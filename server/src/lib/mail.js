/**
 * Lightweight transactional email helper.
 * Uses Resend HTTP API when RESEND_API_KEY is set; otherwise logs and no-ops
 * so shop flows never break in environments without mail configured.
 */
import { logger } from './logger.js';

const log = logger('mail');

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Olive Shop <noreply@livingolive.app>';
  if (!to) {
    log.warn('sendEmail skipped — no recipient');
    return { ok: false, skipped: true };
  }
  if (!apiKey) {
    log.warn(`sendEmail skipped (no RESEND_API_KEY): to=${to} subject=${subject}`);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      log.error(`Resend failed: ${err.message || res.status}`);
      return { ok: false, error: err.message || String(res.status) };
    }
    log.info(`Email sent to ${to}: ${subject}`);
    return { ok: true };
  } catch (e) {
    log.error(`sendEmail error: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

export function shopInvoiceHtml({
  invoiceNumber,
  buyerName,
  productTitle,
  quantity = 1,
  amount,
  currency = 'NGN',
  fulfillmentMethod,
  deliveryAddress,
  shippingPhone,
  collectionCode,
  status = 'pending',
  churchName,
}) {
  const money = `${currency === 'NGN' ? '₦' : currency}${Number(amount || 0).toLocaleString()}`;
  const methodLabel = fulfillmentMethod === 'pickup' ? 'Pickup on site' : 'Delivery';
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#f7f3ea;padding:24px;color:#1c2712">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6dcc8">
    <div style="background:#2B1800;padding:24px 28px;color:#F5D680">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.7">The Living Olive</div>
      <h1 style="margin:8px 0 0;font-size:26px;font-weight:400">Purchase Invoice</h1>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 18px;color:#5a5244">Hi ${escapeHtml(buyerName || 'there')},</p>
      <p style="margin:0 0 18px;color:#5a5244">Thank you for your order${churchName ? ` from <strong>${escapeHtml(churchName)}</strong>` : ''}.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
        <tr><td style="padding:8px 0;color:#8a8070">Invoice</td><td style="padding:8px 0;text-align:right;font-weight:700">${escapeHtml(invoiceNumber || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8070">Status</td><td style="padding:8px 0;text-align:right;font-weight:700">${escapeHtml(status)}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8070">Item</td><td style="padding:8px 0;text-align:right">${escapeHtml(productTitle || 'Product')} × ${quantity}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8070">Amount</td><td style="padding:8px 0;text-align:right;font-weight:700">${money}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8070">Fulfillment</td><td style="padding:8px 0;text-align:right">${methodLabel}</td></tr>
        ${fulfillmentMethod === 'delivery' && deliveryAddress ? `<tr><td style="padding:8px 0;color:#8a8070">Ship to</td><td style="padding:8px 0;text-align:right">${escapeHtml(deliveryAddress)}</td></tr>` : ''}
        ${shippingPhone ? `<tr><td style="padding:8px 0;color:#8a8070">Phone</td><td style="padding:8px 0;text-align:right">${escapeHtml(shippingPhone)}</td></tr>` : ''}
        ${collectionCode ? `<tr><td style="padding:8px 0;color:#8a8070">Collection code</td><td style="padding:8px 0;text-align:right;font-size:18px;letter-spacing:2px;font-weight:700">${escapeHtml(collectionCode)}</td></tr>` : ''}
      </table>
      <p style="margin:0;font-size:13px;color:#8a8070;line-height:1.5">Keep this invoice for your records. If you selected pickup, present your collection code (or QR) at the church office after payment is confirmed.</p>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
