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

  if (isRecurring) {
    payload.payment_plan = undefined; // Flutterwave payment plans need pre-creation; handled manually for now
  }

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

  try {
    let verifyId = txId;
    if (!verifyId) {
      const searchRes = await fetch(
        `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(txRef)}`,
        { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) }
      );
      const sd = await searchRes.json();
      verifyId = sd.data?.[0]?.id;
    }
    if (!verifyId) return res.status(404).json({ error: 'Transaction not found' });

    const vRes = await fetch(`https://api.flutterwave.com/v3/transactions/${verifyId}/verify`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    const vData = await vRes.json();
    const tx = vData.data;

    if (tx.status !== 'successful') {
      return res.json({ ok: false, paid: false, status: tx.status });
    }

    const supabase = req.app.locals.supabaseAdmin;
    await supabase.from('donations').upsert(
      {
        user_id: req.user.id,
        flw_tx_ref: tx.tx_ref,
        flw_tx_id: String(tx.id),
        amount_ngn: tx.amount,
        is_recurring: tx.meta?.is_recurring ?? false,
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
