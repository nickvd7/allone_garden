/**
 * Localised transactional email copy (nl + en primary; de/fr/es fallback to en).
 */

const SUPPORTED = new Set(['nl', 'en', 'de', 'fr', 'es']);

function normalizeLang(lang) {
  const code = String(lang || 'nl').split('-')[0].toLowerCase();
  return SUPPORTED.has(code) ? code : 'en';
}

function pick(lang, table) {
  const code = normalizeLang(lang);
  return table[code] || table.en || table.nl;
}

function layout({ title, bodyHtml, footer, lang }) {
  const l = normalizeLang(lang);
  const brand = l === 'nl' ? 'AllOne Garden' : 'AllOne Garden';
  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#333;">
  <h2 style="color:#2e7d32;margin:0 0 16px;">🌱 ${brand}</h2>
  ${title ? `<h3 style="margin:0 0 12px;font-size:1.1rem;">${title}</h3>` : ''}
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
  <p style="font-size:0.8rem;color:#aaa;margin:0;">${footer}</p>
</div>`;
}

function cta(url, label) {
  return `<p style="margin:24px 0;">
  <a href="${url}" style="background:#4caf50;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">${label}</a>
</p>`;
}

function passwordReset({ username, resetUrl, lang }) {
  const t = pick(lang, {
    nl: {
      subject: 'AllOne Garden — Wachtwoord resetten',
      title: 'Wachtwoord resetten',
      hi: `Hoi ${username},`,
      p1: 'Je hebt een wachtwoordreset aangevraagd voor je AllOne Garden-account.',
      cta: 'Wachtwoord resetten',
      expire: 'Deze link is <strong>1 uur</strong> geldig.',
      ignore: 'Heb je dit niet aangevraagd? Negeer deze e-mail — je wachtwoord blijft ongewijzigd.',
      footer: 'AllOne Garden — community tuinspel',
    },
    en: {
      subject: 'AllOne Garden — Password reset',
      title: 'Password reset',
      hi: `Hi ${username},`,
      p1: 'You requested a password reset for your AllOne Garden account.',
      cta: 'Reset my password',
      expire: 'This link is valid for <strong>1 hour</strong>.',
      ignore: 'If you did not request this, you can safely ignore this email.',
      footer: 'AllOne Garden — community gardening game',
    },
  });

  const text = [t.hi, '', t.p1, '', resetUrl, '', t.ignore.replace(/<[^>]+>/g, ''), '', `— ${t.footer}`].join('\n');
  const html = layout({
    lang,
    title: t.title,
    bodyHtml: `<p>${t.hi}</p><p>${t.p1}</p>${cta(resetUrl, t.cta)}<p style="font-size:0.85rem;color:#666;">${t.expire}<br/>${t.ignore}</p>`,
    footer: t.footer,
  });

  return { subject: t.subject, text, html };
}

function welcome({ username, appUrl, lang }) {
  const t = pick(lang, {
    nl: {
      subject: 'Welkom bij AllOne Garden 🌱',
      title: 'Welkom!',
      hi: `Hoi ${username},`,
      p1: 'Je account is aangemaakt. Log in en begin met je moestuin!',
      cta: 'Naar AllOne Garden',
      footer: 'AllOne Garden — community tuinspel',
    },
    en: {
      subject: 'Welcome to AllOne Garden 🌱',
      title: 'Welcome!',
      hi: `Hi ${username},`,
      p1: 'Your account is ready. Sign in and start your garden!',
      cta: 'Open AllOne Garden',
      footer: 'AllOne Garden — community gardening game',
    },
  });

  const text = [t.hi, '', t.p1, '', appUrl, '', `— ${t.footer}`].join('\n');
  const html = layout({
    lang,
    title: t.title,
    bodyHtml: `<p>${t.hi}</p><p>${t.p1}</p>${cta(appUrl, t.cta)}`,
    footer: t.footer,
  });

  return { subject: t.subject, text, html };
}

function accountCreated({ username, email, resetUrl, createdByAdmin, lang }) {
  const t = pick(lang, {
    nl: {
      subject: 'Je AllOne Garden-account is aangemaakt',
      title: 'Account aangemaakt',
      hi: `Hoi ${username},`,
      p1: createdByAdmin
        ? 'Een beheerder heeft een account voor je aangemaakt.'
        : 'Je account is succesvol aangemaakt.',
      p2: `E-mailadres: <strong>${email}</strong>`,
      cta: 'Stel je wachtwoord in',
      hint: 'Gebruik de knop hieronder om je wachtwoord in te stellen (link 1 uur geldig).',
      footer: 'AllOne Garden — community tuinspel',
    },
    en: {
      subject: 'Your AllOne Garden account was created',
      title: 'Account created',
      hi: `Hi ${username},`,
      p1: createdByAdmin
        ? 'An administrator created an account for you.'
        : 'Your account was created successfully.',
      p2: `Email: <strong>${email}</strong>`,
      cta: 'Set your password',
      hint: 'Use the button below to choose your password (link valid for 1 hour).',
      footer: 'AllOne Garden — community gardening game',
    },
  });

  const text = [t.hi, '', t.p1, `Email: ${email}`, '', t.hint, resetUrl, '', `— ${t.footer}`].join('\n');
  const html = layout({
    lang,
    title: t.title,
    bodyHtml: `<p>${t.hi}</p><p>${t.p1}</p><p>${t.p2}</p><p style="font-size:0.9rem;color:#555;">${t.hint}</p>${cta(resetUrl, t.cta)}`,
    footer: t.footer,
  });

  return { subject: t.subject, text, html };
}

function usernameReminder({ username, appUrl, lang }) {
  const t = pick(lang, {
    nl: {
      subject: 'Je gebruikersnaam — AllOne Garden',
      title: 'Gebruikersnaam herinnering',
      hi: 'Hoi,',
      p1: 'Je hebt gevraagd om je gebruikersnaam te ontvangen.',
      p2: `Je gebruikersnaam is: <strong>${username}</strong>`,
      hint: 'Je kunt inloggen met je gebruikersnaam <em>of</em> je e-mailadres.',
      cta: 'Naar inloggen',
      footer: 'AllOne Garden — community tuinspel',
    },
    en: {
      subject: 'Your username — AllOne Garden',
      title: 'Username reminder',
      hi: 'Hi,',
      p1: 'You requested a reminder of your username.',
      p2: `Your username is: <strong>${username}</strong>`,
      hint: 'You can sign in with your username <em>or</em> your email address.',
      cta: 'Go to login',
      footer: 'AllOne Garden — community gardening game',
    },
  });

  const loginUrl = `${appUrl.replace(/\/$/, '')}/login`;
  const text = [t.hi, '', t.p1, `Username: ${username}`, '', t.hint.replace(/<[^>]+>/g, ''), loginUrl, '', `— ${t.footer}`].join('\n');
  const html = layout({
    lang,
    title: t.title,
    bodyHtml: `<p>${t.hi}</p><p>${t.p1}</p><p>${t.p2}</p><p style="font-size:0.9rem;color:#555;">${t.hint}</p>${cta(loginUrl, t.cta)}`,
    footer: t.footer,
  });

  return { subject: t.subject, text, html };
}

function passwordChanged({ username, lang }) {
  const t = pick(lang, {
    nl: {
      subject: 'Je wachtwoord is gewijzigd — AllOne Garden',
      title: 'Wachtwoord gewijzigd',
      hi: `Hoi ${username},`,
      p1: 'Het wachtwoord van je AllOne Garden-account is zojuist gewijzigd.',
      warn: 'Was jij dit niet? Neem direct contact op met de serverbeheerder.',
      footer: 'AllOne Garden — community tuinspel',
    },
    en: {
      subject: 'Your password was changed — AllOne Garden',
      title: 'Password changed',
      hi: `Hi ${username},`,
      p1: 'The password for your AllOne Garden account was just changed.',
      warn: 'If this was not you, contact the server administrator immediately.',
      footer: 'AllOne Garden — community gardening game',
    },
  });

  const text = [t.hi, '', t.p1, '', t.warn, '', `— ${t.footer}`].join('\n');
  const html = layout({
    lang,
    title: t.title,
    bodyHtml: `<p>${t.hi}</p><p>${t.p1}</p><p style="color:#b71c1c;font-size:0.9rem;">${t.warn}</p>`,
    footer: t.footer,
  });

  return { subject: t.subject, text, html };
}

module.exports = {
  normalizeLang,
  passwordReset,
  welcome,
  accountCreated,
  usernameReminder,
  passwordChanged,
};
