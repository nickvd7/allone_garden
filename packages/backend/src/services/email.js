/**
 * Email service — wraps nodemailer for transactional emails.
 *
 * Configure via environment variables:
 *   SMTP_HOST     — e.g. smtp.gmail.com  (required to enable email)
 *   SMTP_PORT     — default 587
 *   SMTP_SECURE   — 'true' for port 465 (SSL), otherwise STARTTLS
 *   SMTP_USER     — SMTP username / email address
 *   SMTP_PASS     — SMTP password or app password
 *   SMTP_FROM     — From address shown to recipients (default: SMTP_USER)
 *   APP_URL       — Base URL of the game, used in email links
 *
 * When SMTP_HOST is not set the service logs the email content to stdout
 * instead of sending — useful for development and in-memory mode.
 */

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST) return null;

  // Lazy-require so nodemailer is only loaded when SMTP is configured.
  // This keeps the server startable without nodemailer installed.
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return transporter;
  } catch {
    console.warn('[email] nodemailer not installed — run: npm install nodemailer');
    return null;
  }
}

const FROM = () => process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@allone.garden';
const APP_URL = () => process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Send a password-reset email.
 *
 * @param {string} toEmail   - Recipient email address
 * @param {string} username  - Recipient username (shown in email body)
 * @param {string} token     - 64-char hex reset token
 * @returns {Promise<boolean>} true if sent (or logged), false on hard error
 */
async function sendPasswordReset(toEmail, username, token) {
  const resetUrl = `${APP_URL()}/reset-password?token=${token}`;

  const subject = 'AllOne Garden — Password Reset';
  const text = [
    `Hi ${username},`,
    '',
    'You requested a password reset for your AllOne Garden account.',
    '',
    `Reset link (valid for 1 hour):`,
    resetUrl,
    '',
    'If you did not request this, you can safely ignore this email.',
    'Your password will not change until you click the link above.',
    '',
    '— The AllOne Garden server',
  ].join('\n');

  const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="color:#2e7d32;">🌱 AllOne Garden</h2>
  <p>Hi <strong>${username}</strong>,</p>
  <p>You requested a password reset for your AllOne Garden account.</p>
  <p style="margin:24px 0;">
    <a href="${resetUrl}"
       style="background:#4caf50;color:#fff;padding:12px 24px;border-radius:8px;
              text-decoration:none;font-weight:bold;display:inline-block;">
      Reset my password
    </a>
  </p>
  <p style="font-size:0.85rem;color:#666;">
    This link expires in <strong>1 hour</strong>.<br />
    If you did not request this, you can safely ignore this email.
  </p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
  <p style="font-size:0.8rem;color:#aaa;">AllOne Garden — community-hosted gardening game</p>
</div>`;

  const transport = getTransporter();

  if (!transport) {
    // No SMTP configured — log to stdout so server admin can relay the link
    console.log('[email] Password reset (no SMTP, printing to stdout):');
    console.log(`  To:      ${toEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Link:    ${resetUrl}`);
    return true;
  }

  try {
    await transport.sendMail({
      from:    FROM(),
      to:      toEmail,
      subject,
      text,
      html,
    });
    console.log(`[email] Password reset sent to ${toEmail}`);
    return true;
  } catch (err) {
    console.error('[email] Failed to send password reset:', err.message);
    return false;
  }
}

module.exports = { sendPasswordReset };
