/**
 * donate.js — Platform donation API
 * Mounted at /api/donate in index.js.
 * Handles one-time and recurring donations to Living Olive via Flutterwave.
 */

import { Router } from 'express';
import { logger } from '../lib/logger.js';

const log = logger('donate');
const router = Router();

function flutterwaveSecret() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY is not set');
  return key;
}

// Initiate a donation — returns a Flutterwave-hosted payment link
router.post('/initiate', async (req, res) => {
  const { amount, isRecurring, donorName } = req.body;
  const amountNgn = parseInt(amount, 10);
  if (!amountNgn || amountNgn < 100) return res.status(400).json({ error: 'Minimum donation is ₦100' });

  let key;
  try { key = flutterwaveSecret(); } catch {
    return res.status(503).json({ error: 'Payment system not configured. Contact support.' });
  }

  const txRef = `donation_${req.user.id}_${Date.now()}`;
  const email = req.user.email ?? 'donor@livingolive.app';
  const name = donorName?.trim() || email.split('@')[0];

  const payload = {
    tx_ref: txRef,
    amount: amountNgn,
    currency: 'NGN',
    redirect_url: 'https://livingolive.adroomai.com/payment/success',
    customer: { email, name },
    customizations: {
      title: 'Support Living Olive',
      description: 'Your donation keeps Living Olive running and improving for everyone.',
      logo: 'https://livingolive.adroomai.com/icon.png',
    },
    meta: { user_id: req.user.id, donation: true, is_recurring: !!isRecurring },
  };

  // Note: Flutterwave recurring payment plans require pre-creation via the
  // dashboard API before they can be referenced here. When a plan ID is
  // available, set payload.payment_plan = "<plan_id>". For now, one-time
  // and recurring intents are differentiated only via meta.is_recurring.

  const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (!flwRes.ok) {
    const err = await flwRes.json().catch(() => ({}));
    return res.status(502).json({ error: err.message ?? 'Failed to create payment link' });
  }

  const flwData = await flwRes.json();
  const paymentLink = flwData.data?.link;
  if (!paymentLink) return res.status(502).json({ error: 'No payment link returned' });

  // Record pending donation
  const supabase = req.app.locals.supabaseAdmin;
  await supabase.from('donations').insert({
    user_id: req.user.id,
    flw_tx_ref: txRef,
    amount_ngn: amountNgn,
    is_recurring: !!isRecurring,
    status: 'pending',
  });

  log.info(`Donation initiated: ${txRef} amount=₦${amountNgn} user=${req.user.id}`);
  res.json({ ok: true, paymentLink, txRef });
});

// Verify donation after user completes payment
router.post('/verify', async (req, res) => {
  const { txRef, txId } = req.body;
  if (!txRef && !txId) return res.status(400).json({ error: 'txRef or txId is required' });

  let key;
  try { key = flutterwaveSecret(); } catch {
    return res.status(503).json({ error: 'Payment system not configured' });
  }

  const supabase = req.app.locals.supabaseAdmin;

  try {
    // Step 1 — Load the pending donation that was created when the user initiated
    // payment. This anchors verification to the authenticated user: only a pending
    // record whose flw_tx_ref matches the incoming txRef (or whose id resolves via
    // txId lookup) belongs to this user. A caller cannot replay another user's
    // successful transaction to claim a donation they didn't make.
    const lookupRef = txRef ?? null;
    const { data: pending, error: pendingErr } = lookupRef
      ? await supabase
          .from('donations')
          .select('flw_tx_ref, amount_ngn, is_recurring')
          .eq('user_id', req.user.id)
          .eq('flw_tx_ref', lookupRef)
          .eq('status', 'pending')
          .maybeSingle()
      : { data: null, error: null };

    // When only txId is provided (redirect flow), we look up the tx_ref from
    // Flutterwave first and then validate it against the pending record.
    let verifyId = txId ?? null;
    let resolvedTxRef = lookupRef;

    if (!verifyId) {
      const searchRes = await fetch(
        `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(lookupRef)}`,
        { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) }
      );
      const sd = await searchRes.json();
      verifyId = sd.data?.[0]?.id ?? null;
    }
    if (!verifyId) return res.status(404).json({ error: 'Transaction not found' });

    // Step 2 — Verify with Flutterwave
    const vRes = await fetch(`https://api.flutterwave.com/v3/transactions/${verifyId}/verify`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    const vData = await vRes.json();
    const tx = vData.data;

    if (tx.status !== 'successful') {
      return res.json({ ok: false, paid: false, status: tx.status });
    }

    // Step 3 — The resolved tx_ref must match the pending donation record for
    // this user. If we found a pending record above (txRef path), check it.
    // If we arrived via txId only, load the pending record by the resolved tx_ref.
    let pendingRecord = pending;
    if (!pendingRecord && !pendingErr) {
      resolvedTxRef = tx.tx_ref;
      const { data: byRef } = await supabase
        .from('donations')
        .select('flw_tx_ref, amount_ngn, is_recurring')
        .eq('user_id', req.user.id)
        .eq('flw_tx_ref', resolvedTxRef)
        .eq('status', 'pending')
        .maybeSingle();
      pendingRecord = byRef;
    }

    if (!pendingRecord || tx.tx_ref !== pendingRecord.flw_tx_ref) {
      log.warn(`Donation tx_ref mismatch for user ${req.user.id}: expected ${pendingRecord?.flw_tx_ref}, got ${tx.tx_ref}`);
      return res.status(403).json({ error: 'Transaction does not match any pending donation for this account.' });
    }
    if ((tx.currency ?? '').toUpperCase() !== 'NGN') {
      return res.status(400).json({ error: 'Donation must be in NGN.' });
    }
    if (tx.amount < pendingRecord.amount_ngn) {
      log.warn(`Donation underpayment for user ${req.user.id}: expected ₦${pendingRecord.amount_ngn}, received ₦${tx.amount}`);
      return res.status(400).json({ error: 'Payment amount is less than the intended donation.' });
    }

    // Step 4 — Record as successful. upsert on flw_tx_ref is idempotent and
    // safe: the unique constraint prevents a second caller from claiming the
    // same tx_ref under a different user_id.
    await supabase.from('donations').upsert(
      {
        user_id: req.user.id,
        flw_tx_ref: tx.tx_ref,
        flw_tx_id: String(tx.id),
        amount_ngn: tx.amount,
        is_recurring: pendingRecord.is_recurring ?? false,
        status: 'success',
        paid_at: new Date().toISOString(),
      },
      { onConflict: 'flw_tx_ref' }
    );

    log.info(`Donation verified: ${tx.tx_ref} ₦${tx.amount} from user ${req.user.id}`);
    res.json({ ok: true, paid: true, amount: tx.amount });
  } catch (e) {
    log.error('Donation verify error:', e.message);
    res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

export { router as donateRouter };
