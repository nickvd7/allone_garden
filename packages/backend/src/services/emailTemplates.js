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

function activityDigest({
  username,
  dmCount,
  groupCount,
  pendingTradeProposals = 0,
  pendingCollaborateProposals = 0,
  tradesSold = 0,
  tradesBought = 0,
  wikiRevisions = 0,
  wikiAdminPending = 0,
  appUrl,
  lang,
}) {
  const t = pick(lang, {
    nl: {
      subject: 'AllOne Garden — je hebt nieuwe meldingen 🌱',
      title: 'Er wacht iets op je in de tuin',
      hi: `Hoi ${username},`,
      intro: 'Je bent een dag niet actief geweest. Dit is er gebeurd:',
      dm: (n) => (n === 1 ? '1 nieuw direct bericht' : `${n} nieuwe directe berichten`),
      group: (n) => (n === 1 ? '1 nieuw groepsbericht' : `${n} nieuwe groepsberichten`),
      tradeProposal: (n) => (n === 1 ? '1 nieuw ruilvoorstel' : `${n} nieuwe ruilvoorstellen`),
      collaborateProposal: (n) => (n === 1 ? '1 samenwerkverzoek' : `${n} samenwerkverzoeken`),
      tradeSold: (n) => (n === 1 ? '1 keer iets verkocht op de markt' : `${n}× verkocht op de markt`),
      tradeBought: (n) => (n === 1 ? '1 marktaankoop' : `${n} marktaankopen`),
      wikiRevision: (n) => (n === 1 ? '1 wiki-voorstel wacht op aanpassing' : `${n} wiki-voorstellen wachten op aanpassing`),
      wikiAdmin: (n) => (n === 1 ? '1 wiki-voorstel wacht op beoordeling (beheerder)' : `${n} wiki-voorstellen wachten op beoordeling (beheerder)`),
      cta: 'Open AllOne Garden',
      prefs: 'Dagelijkse mail uitzetten? Accountinstellingen → E-mailnotificaties.',
      footer: 'AllOne Garden — community tuinspel',
    },
    en: {
      subject: 'AllOne Garden — you have new notifications 🌱',
      title: 'Something is waiting in the garden',
      hi: `Hi ${username},`,
      intro: 'You have been away for a day. Here is what happened:',
      dm: (n) => (n === 1 ? '1 new direct message' : `${n} new direct messages`),
      group: (n) => (n === 1 ? '1 new group message' : `${n} new group messages`),
      tradeProposal: (n) => (n === 1 ? '1 new trade offer' : `${n} new trade offers`),
      collaborateProposal: (n) => (n === 1 ? '1 collaboration request' : `${n} collaboration requests`),
      tradeSold: (n) => (n === 1 ? '1 market sale' : `${n} market sales`),
      tradeBought: (n) => (n === 1 ? '1 market purchase' : `${n} market purchases`),
      wikiRevision: (n) => (n === 1 ? '1 wiki proposal needs revision' : `${n} wiki proposals need revision`),
      wikiAdmin: (n) => (n === 1 ? '1 wiki proposal awaiting review (admin)' : `${n} wiki proposals awaiting review (admin)`),
      cta: 'Open AllOne Garden',
      prefs: 'Turn off daily emails in Account settings → Email notifications.',
      footer: 'AllOne Garden — community gardening game',
    },
  });

  const lines = [];
  if (dmCount > 0) lines.push(`• ${t.dm(dmCount)}`);
  if (groupCount > 0) lines.push(`• ${t.group(groupCount)}`);
  if (pendingTradeProposals > 0) lines.push(`• ${t.tradeProposal(pendingTradeProposals)}`);
  if (pendingCollaborateProposals > 0) lines.push(`• ${t.collaborateProposal(pendingCollaborateProposals)}`);
  if (tradesSold > 0) lines.push(`• ${t.tradeSold(tradesSold)}`);
  if (tradesBought > 0) lines.push(`• ${t.tradeBought(tradesBought)}`);
  if (wikiRevisions > 0) lines.push(`• ${t.wikiRevision(wikiRevisions)}`);
  if (wikiAdminPending > 0) lines.push(`• ${t.wikiAdmin(wikiAdminPending)}`);

  const text = [
    t.hi,
    '',
    t.intro,
    ...lines,
    '',
    appUrl,
    '',
    t.prefs,
    '',
    `— ${t.footer}`,
  ].join('\n');

  const listHtml = lines.map((line) => `<li>${line.replace(/^•\s*/, '')}</li>`).join('');
  const html = layout({
    lang,
    title: t.title,
    bodyHtml: `<p>${t.hi}</p><p>${t.intro}</p><ul style="padding-left:1.2rem;">${listHtml}</ul>${cta(appUrl, t.cta)}<p style="font-size:0.85rem;color:#666;">${t.prefs}</p>`,
    footer: t.footer,
  });

  return { subject: t.subject, text, html };
}

function weeklyDigest({
  username,
  level,
  xp,
  coins,
  plantsGrown,
  currentDay,
  seasonKey,
  dmCount,
  groupCount,
  pendingProposals,
  appUrl,
  lang,
}) {
  const seasonLabel = pick(lang, {
    nl: {
      spring: 'lente', summer: 'zomer', autumn: 'herfst', winter: 'winter',
    },
    en: {
      spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter',
    },
  });
  const season = seasonLabel[seasonKey] || seasonKey;

  const t = pick(lang, {
    nl: {
      subject: 'AllOne Garden — jouw weekoverzicht 🌱',
      title: 'Jouw tuin in cijfers',
      hi: `Hoi ${username},`,
      intro: 'Dit is je weekoverzicht — alleen als er iets te melden valt:',
      stats: `Level ${level} · ${xp} XP · ${coins} munten · ${plantsGrown} planten geoogst`,
      garden: `Tuindag ${currentDay} · ${season}`,
      dm: (n) => (n === 1 ? '1 bericht ontvangen' : `${n} berichten ontvangen`),
      group: (n) => (n === 1 ? '1 groepsbericht' : `${n} groepsberichten`),
      proposals: (n) => (n === 1 ? '1 openstaand ruilvoorstel' : `${n} openstaande ruilvoorstellen`),
      cta: 'Open AllOne Garden',
      prefs: 'Wekelijkse mail uitzetten? Accountinstellingen → E-mailnotificaties.',
      footer: 'AllOne Garden — community tuinspel',
    },
    en: {
      subject: 'AllOne Garden — your weekly summary 🌱',
      title: 'Your garden in numbers',
      hi: `Hi ${username},`,
      intro: 'Your weekly summary — only sent when there is something to share:',
      stats: `Level ${level} · ${xp} XP · ${coins} coins · ${plantsGrown} plants harvested`,
      garden: `Garden day ${currentDay} · ${season}`,
      dm: (n) => (n === 1 ? '1 message received' : `${n} messages received`),
      group: (n) => (n === 1 ? '1 group message' : `${n} group messages`),
      proposals: (n) => (n === 1 ? '1 pending trade proposal' : `${n} pending trade proposals`),
      cta: 'Open AllOne Garden',
      prefs: 'Turn off under Account settings → Email notifications.',
      footer: 'AllOne Garden — community gardening game',
    },
  });

  const lines = [`• ${t.stats}`, `• ${t.garden}`];
  if (dmCount > 0) lines.push(`• ${t.dm(dmCount)}`);
  if (groupCount > 0) lines.push(`• ${t.group(groupCount)}`);
  if (pendingProposals > 0) lines.push(`• ${t.proposals(pendingProposals)}`);

  const text = [
    t.hi,
    '',
    t.intro,
    ...lines,
    '',
    appUrl,
    '',
    t.prefs,
    '',
    `— ${t.footer}`,
  ].join('\n');

  const listHtml = lines.map((line) => `<li>${line.replace(/^•\s*/, '')}</li>`).join('');
  const html = layout({
    lang,
    title: t.title,
    bodyHtml: `<p>${t.hi}</p><p>${t.intro}</p><ul style="padding-left:1.2rem;">${listHtml}</ul>${cta(appUrl, t.cta)}<p style="font-size:0.85rem;color:#666;">${t.prefs}</p>`,
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
  activityDigest,
  weeklyDigest,
};
