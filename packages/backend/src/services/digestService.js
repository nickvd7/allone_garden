'use strict';

const db = require('../db');
const { sendActivityDigest, sendWeeklyDigest, isEmailConfigured } = require('./email');
const { normalizeLang } = require('./emailTemplates');
const { seasonIndexFromDay } = require('../utils/season');

const INACTIVE_MS = 24 * 60 * 60 * 1000;
const DAILY_GAP_MS = 23 * 60 * 60 * 1000;
const WEEKLY_GAP_MS = 6 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_LEVEL = 99;

const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter'];

function rowCount(result) {
  const raw = result?.rows?.[0]?.c ?? result?.rows?.[0]?.count ?? 0;
  return Number(raw) || 0;
}

async function touchLastActive(userId) {
  if (!db.isConnected() || !userId) return;
  try {
    await db.query(
      'UPDATE users SET last_active_at = NOW() WHERE id = $1',
      [userId],
    );
  } catch {
    /* ignore */
  }
}

async function countMessagesSince(userId, since) {
  if (!db.isConnected()) return { dmCount: 0, groupCount: 0 };
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const dmResult = await db.query(
    `SELECT COUNT(*) AS c FROM direct_messages
     WHERE to_user_id = $1 AND created_at > $2`,
    [userId, sinceIso],
  );
  const groupResult = await db.query(
    `SELECT COUNT(*) AS c
     FROM group_chat_messages gcm
     INNER JOIN group_chat_members gcmem
       ON gcmem.group_id = gcm.group_id AND gcmem.user_id = $1
     WHERE gcm.from_user_id <> $1 AND gcm.created_at > $2`,
    [userId, sinceIso],
  );

  return {
    dmCount: rowCount(dmResult),
    groupCount: rowCount(groupResult),
  };
}

async function countPendingProposals(userId, since) {
  if (!db.isConnected()) return { trade: 0, collaborate: 0, total: 0 };
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const tradeResult = await db.query(
    `SELECT COUNT(*) AS c FROM player_proposals
     WHERE to_user_id = $1 AND status = 'pending' AND kind = 'trade'
       AND created_at > $2`,
    [userId, sinceIso],
  );
  const collabResult = await db.query(
    `SELECT COUNT(*) AS c FROM player_proposals
     WHERE to_user_id = $1 AND status = 'pending' AND kind = 'collaborate'
       AND created_at > $2`,
    [userId, sinceIso],
  );
  const trade = rowCount(tradeResult);
  const collaborate = rowCount(collabResult);
  return { trade, collaborate, total: trade + collaborate };
}

async function countTradesSince(userId, since) {
  if (!db.isConnected()) return { sold: 0, bought: 0 };
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const soldResult = await db.query(
    `SELECT COUNT(*) AS c FROM trade_history
     WHERE seller_id = $1 AND completed_at > $2`,
    [userId, sinceIso],
  );
  const boughtResult = await db.query(
    `SELECT COUNT(*) AS c FROM trade_history
     WHERE buyer_id = $1 AND completed_at > $2`,
    [userId, sinceIso],
  );
  return {
    sold: rowCount(soldResult),
    bought: rowCount(boughtResult),
  };
}

async function countWikiActions(userId, userLevel) {
  if (!db.isConnected()) return { revisions: 0, adminPending: 0 };
  let revisions = 0;
  let adminPending = 0;

  try {
    const revResult = await db.query(
      `SELECT COUNT(*) AS c FROM content_proposals
       WHERE submitted_by = $1 AND status = 'revision_requested'`,
      [userId],
    );
    revisions = rowCount(revResult);
  } catch {
    /* table may be absent in old DBs */
  }

  if (Number(userLevel) >= ADMIN_LEVEL) {
    try {
      const adminResult = await db.query(
        `SELECT COUNT(*) AS c FROM content_proposals WHERE status = 'pending'`,
      );
      adminPending = rowCount(adminResult);
    } catch {
      /* ignore */
    }
  }

  return { revisions, adminPending };
}

async function collectDailyActivity(userId, since, userLevel) {
  const { dmCount, groupCount } = await countMessagesSince(userId, since);
  const proposals = await countPendingProposals(userId, since);
  const trades = await countTradesSince(userId, since);
  const wiki = await countWikiActions(userId, userLevel);

  return {
    dmCount,
    groupCount,
    pendingTradeProposals: proposals.trade,
    pendingCollaborateProposals: proposals.collaborate,
    pendingProposals: proposals.total,
    tradesSold: trades.sold,
    tradesBought: trades.bought,
    wikiRevisions: wiki.revisions,
    wikiAdminPending: wiki.adminPending,
  };
}

function hasDailyContent(activity) {
  if (!activity) return false;
  const n = (v) => Math.max(0, Number(v) || 0);
  return (
    n(activity.dmCount)
    + n(activity.groupCount)
    + n(activity.pendingProposals)
    + n(activity.pendingTradeProposals)
    + n(activity.pendingCollaborateProposals)
    + n(activity.tradesSold)
    + n(activity.tradesBought)
    + n(activity.wikiRevisions)
    + n(activity.wikiAdminPending)
  ) > 0;
}

async function wasEmailSentRecently(userId, kind, gapMs) {
  if (!db.isConnected()) return false;
  const cutoff = new Date(Date.now() - gapMs).toISOString();
  const result = await db.query(
    `SELECT 1 FROM notification_email_log
     WHERE user_id = $1 AND kind = $2 AND sent_at > $3
     LIMIT 1`,
    [userId, kind, cutoff],
  );
  return (result?.rows?.length || 0) > 0;
}

async function logEmailSent(userId, kind) {
  if (!db.isConnected()) return;
  await db.query(
    `INSERT INTO notification_email_log (user_id, kind) VALUES ($1, $2)`,
    [userId, kind],
  );
}

function hasWeeklyContent(summary) {
  if (summary.dmCount + summary.groupCount + summary.pendingProposals > 0) return true;
  if (!summary.activeThisWeek) return false;
  return summary.xp > 0 || summary.plantsGrown > 0 || summary.currentDay > 1;
}

async function collectWeeklySummary(userId, activityAt) {
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const userResult = await db.query(
    `SELECT username, level, xp, coins, plants_grown AS "plantsGrown",
            COALESCE(last_active_at, last_login, created_at) AS activity_at
     FROM users WHERE id = $1`,
    [userId],
  );
  const gardenResult = await db.query(
    'SELECT current_day FROM gardens WHERE user_id = $1',
    [userId],
  );
  const proposalsResult = await db.query(
    `SELECT COUNT(*) AS c FROM player_proposals
     WHERE to_user_id = $1 AND status = 'pending'`,
    [userId],
  );

  const user = userResult?.rows?.[0] || {};
  const currentDay = gardenResult?.rows?.[0]?.current_day || 1;
  const lastActive = new Date(user.activity_at || activityAt || 0);
  const { dmCount, groupCount } = await countMessagesSince(userId, weekAgo);

  return {
    username: user.username || 'Speler',
    level: user.level || 1,
    xp: user.xp || 0,
    coins: user.coins || 0,
    plantsGrown: user.plantsGrown || 0,
    currentDay,
    seasonKey: SEASON_KEYS[seasonIndexFromDay(currentDay)] || 'spring',
    dmCount,
    groupCount,
    pendingProposals: rowCount(proposalsResult),
    activeThisWeek: lastActive >= weekAgo,
  };
}

async function sendDigestsForInactiveUsers() {
  if (!isEmailConfigured() || !db.isConnected()) {
    return { scanned: 0, sent: 0, skipped: 0 };
  }

  const cutoff = new Date(Date.now() - INACTIVE_MS).toISOString();
  const usersResult = await db.query(
    `SELECT id, username, email, preferred_language, level,
            COALESCE(last_active_at, last_login, created_at) AS activity_at
     FROM users
     WHERE email IS NOT NULL
       AND email <> ''
       AND COALESCE(email_daily_digest_enabled, email_digest_enabled, TRUE) = TRUE
       AND COALESCE(last_active_at, last_login, created_at) < $1
     LIMIT 500`,
    [cutoff],
  );

  let sent = 0;
  let skipped = 0;
  const rows = usersResult?.rows || [];

  for (const user of rows) {
    try {
      if (await wasEmailSentRecently(user.id, 'digest', DAILY_GAP_MS)) {
        skipped += 1;
        continue;
      }

      const activityAt = new Date(user.activity_at);
      const activity = await collectDailyActivity(user.id, activityAt, user.level);
      if (!hasDailyContent(activity)) {
        skipped += 1;
        continue;
      }

      const lang = normalizeLang(user.preferred_language);
      const ok = await sendActivityDigest(user.email, {
        username: user.username,
        lang,
        ...activity,
      });

      if (ok) {
        await logEmailSent(user.id, 'digest');
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      console.error(`[digest] daily user ${user.id}:`, err.message);
      skipped += 1;
    }
  }

  return { scanned: rows.length, sent, skipped };
}

async function sendWeeklyDigests() {
  if (!isEmailConfigured() || !db.isConnected()) {
    return { scanned: 0, sent: 0, skipped: 0 };
  }

  const usersResult = await db.query(
    `SELECT id, username, email, preferred_language,
            COALESCE(last_active_at, last_login, created_at) AS activity_at
     FROM users
     WHERE email IS NOT NULL
       AND email <> ''
       AND COALESCE(email_weekly_digest_enabled, email_digest_enabled, TRUE) = TRUE
     LIMIT 500`,
  );

  let sent = 0;
  let skipped = 0;
  const rows = usersResult?.rows || [];

  for (const user of rows) {
    try {
      if (await wasEmailSentRecently(user.id, 'weekly', WEEKLY_GAP_MS)) {
        skipped += 1;
        continue;
      }

      const summary = await collectWeeklySummary(user.id, user.activity_at);
      if (!hasWeeklyContent(summary)) {
        skipped += 1;
        continue;
      }

      const lang = normalizeLang(user.preferred_language);
      const ok = await sendWeeklyDigest(user.email, { ...summary, lang });

      if (ok) {
        await logEmailSent(user.id, 'weekly');
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      console.error(`[digest] weekly user ${user.id}:`, err.message);
      skipped += 1;
    }
  }

  return { scanned: rows.length, sent, skipped };
}

module.exports = {
  touchLastActive,
  countMessagesSince,
  collectDailyActivity,
  sendDigestsForInactiveUsers,
  sendWeeklyDigests,
  hasDailyContent,
  hasWeeklyContent,
  collectWeeklySummary,
};
