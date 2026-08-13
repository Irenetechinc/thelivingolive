import nodemailer from 'nodemailer';
import { logger } from './logger.js';
const log = logger('mailer');

let transporter = null;

function initSmtp() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;
  transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

async function sendViaResend(to, subject, html, from) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from || process.env.SMTP_FROM || 'noreply@livingolive.app',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      log.error('Resend error', res.status, t);
      return false;
    }
    log.info('Invoice sent via Resend');
    return true;
  } catch (e) {
    log.error('Resend send failed', e.message ?? e);
    return false;
  }
}

// Public send helper: prefer Resend, then SMTP. If neither configured, log and return false.
export async function sendInvoiceMail(to, subject, html, attachments = []) {
  const from = process.env.SMTP_FROM || 'noreply@livingolive.app';
  // Prefer Resend when configured
  if (process.env.RESEND_API_KEY) {
    const ok = await sendViaResend(to, subject, html, from);
    if (ok) return true;
    // fallthrough to SMTP if Resend fails
  }

  const t = initSmtp();
  if (t) {
    try {
      const info = await t.sendMail({ from, to, subject, html, attachments });
      log.info('Invoice mail sent via SMTP', info.messageId);
      return true;
    } catch (e) {
      log.error('Failed to send invoice via SMTP', e.message ?? e);
      return false;
    }
  }

  // As a last resort, if Supabase is available (service role client may be attached to app.locals),
  // the caller (routes) can implement Supabase-specific email sends. Here we simply log.
  log.info('No mailer configured (RESEND_API_KEY or SMTP). Skipping email send.');
  return false;
}
