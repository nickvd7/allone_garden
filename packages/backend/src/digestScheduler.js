'use strict';

function startDigestScheduler() {
  if (process.env.NOTIFICATION_DIGEST_ENABLED === 'false') return;

  try {
    const cron = require('node-cron');
    const { sendDigestsForInactiveUsers, sendWeeklyDigests } = require('./services/digestService');
    const { isEmailConfigured } = require('./services/email');

    const dailySpec = process.env.NOTIFICATION_DIGEST_CRON || '0 9 * * *';
    if (cron.validate(dailySpec)) {
      cron.schedule(dailySpec, async () => {
        if (!isEmailConfigured()) return;
        try {
          const result = await sendDigestsForInactiveUsers();
          if (result.sent > 0) {
            console.log(`[digest] Daily: ${result.sent} sent (${result.skipped} skipped)`);
          }
        } catch (e) {
          console.error('[digest] daily run failed:', e.message);
        }
      });
      console.log(`[digest] Daily scheduler: ${dailySpec}`);
    } else {
      console.warn(`[digest] Invalid NOTIFICATION_DIGEST_CRON: ${dailySpec}`);
    }

    const weeklySpec = process.env.WEEKLY_DIGEST_CRON || '0 9 * * 1';
    if (cron.validate(weeklySpec)) {
      cron.schedule(weeklySpec, async () => {
        if (!isEmailConfigured()) return;
        try {
          const result = await sendWeeklyDigests();
          if (result.sent > 0) {
            console.log(`[digest] Weekly: ${result.sent} sent (${result.skipped} skipped)`);
          }
        } catch (e) {
          console.error('[digest] weekly run failed:', e.message);
        }
      });
      console.log(`[digest] Weekly scheduler: ${weeklySpec}`);
    } else {
      console.warn(`[digest] Invalid WEEKLY_DIGEST_CRON: ${weeklySpec}`);
    }
  } catch (e) {
    console.warn('[digest] scheduler not started:', e.message);
  }
}

module.exports = { startDigestScheduler };
