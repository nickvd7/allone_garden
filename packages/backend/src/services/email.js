/**
 * Transactional email — SendGrid API (preferred) or SMTP via nodemailer.
 *
 * SendGrid:
 *   SENDGRID_API_KEY  — API key from SendGrid dashboard
 *   SENDGRID_FROM     — verified sender (default: noreply@allone.garden)
 *
 * SMTP fallback (e.g. dev):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 *   APP_URL — base URL for links in emails
 */

const {
  passwordReset: tplPasswordReset,
  welcome: tplWelcome,
  accountCreated: tplAccountCreated,
  usernameReminder: tplUsernameReminder,
  passwordChanged: tplPasswordChanged,
  normalizeLang,
} = require('./emailTemplates');

let sgMail = null;
let transporter = null;

const FROM = () =>
  process.env.SENDGRID_FROM
  || process.env.SMTP_FROM
  || process.env.SMTP_USER
  || 'noreply@allone.garden';

const APP_URL = () => process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

function getSendGrid() {
  if (sgMail !== null) return sgMail;
  if (!process.env.SENDGRID_API_KEY) {
    sgMail = false;
    return sgMail;
  }
  try {
    sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return sgMail;
  } catch {
    console.warn('[email] @sendgrid/mail not installed — run: npm install @sendgrid/mail');
    sgMail = false;
    return sgMail;
  }
}

function getSmtpTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
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

async function deliver({ to, subject, text, html }) {
  const sg = getSendGrid();
  if (sg) {
    await sg.send({
      to,
      from: FROM(),
      subject,
      text,
      html,
    });
    return true;
  }

  const transport = getSmtpTransporter();
  if (transport) {
    await transport.sendMail({ from: FROM(), to, subject, text, html });
    return true;
  }

  console.log('[email] No SendGrid/SMTP — printing to stdout:');
  console.log(`  To:      ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Text:\n${text}`);
  return true;
}

async function sendMailSafe(kind, to, payload) {
  try {
    await deliver({ to, ...payload });
    console.log(`[email] ${kind} sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send ${kind}:`, err.message);
    return false;
  }
}

async function sendPasswordReset(toEmail, username, token, lang = 'nl') {
  const resetUrl = `${APP_URL()}/reset-password?token=${token}`;
  const mail = tplPasswordReset({ username, resetUrl, lang: normalizeLang(lang) });
  return sendMailSafe('password reset', toEmail, mail);
}

async function sendWelcome(toEmail, username, lang = 'nl') {
  const mail = tplWelcome({ username, appUrl: APP_URL(), lang: normalizeLang(lang) });
  return sendMailSafe('welcome', toEmail, mail);
}

async function sendAccountCreated(toEmail, username, token, { createdByAdmin = false, lang = 'nl' } = {}) {
  const resetUrl = `${APP_URL()}/reset-password?token=${token}`;
  const mail = tplAccountCreated({
    username,
    email: toEmail,
    resetUrl,
    createdByAdmin,
    lang: normalizeLang(lang),
  });
  return sendMailSafe('account created', toEmail, mail);
}

async function sendUsernameReminder(toEmail, username, lang = 'nl') {
  const mail = tplUsernameReminder({
    username,
    appUrl: APP_URL(),
    lang: normalizeLang(lang),
  });
  return sendMailSafe('username reminder', toEmail, mail);
}

async function sendPasswordChanged(toEmail, username, lang = 'nl') {
  const mail = tplPasswordChanged({ username, lang: normalizeLang(lang) });
  return sendMailSafe('password changed', toEmail, mail);
}

function isEmailConfigured() {
  return !!(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST);
}

module.exports = {
  sendPasswordReset,
  sendWelcome,
  sendAccountCreated,
  sendUsernameReminder,
  sendPasswordChanged,
  isEmailConfigured,
  normalizeLang,
};
