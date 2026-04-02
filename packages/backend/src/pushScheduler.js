/**
 * Optional scheduled broadcast using node-cron (env PUSH_SCHEDULE_CRON + TITLE + BODY).
 */
'use strict';

function startPushScheduler() {
  const spec = process.env.PUSH_SCHEDULE_CRON;
  const title = process.env.PUSH_SCHEDULE_TITLE;
  const body = process.env.PUSH_SCHEDULE_BODY;
  if (!spec || !title || !body) return;

  try {
    const cron = require('node-cron');
    const { getAllPushTokens, sendPushBroadcast } = require('./routes/push');
    const { logPushBroadcast } = require('./services/pushLog');
    const { isApnsConfigured } = require('./services/apnsSend');

    cron.schedule(spec, async () => {
      const canSend = !!(
        process.env.FCM_SERVER_KEY
        || process.env.FCM_SERVICE_ACCOUNT_JSON
        || process.env.FCM_SERVICE_ACCOUNT_PATH
        || isApnsConfigured()
      );
      if (!canSend) return;
      try {
        const rows = await getAllPushTokens();
        if (!rows.length) return;
        const result = await sendPushBroadcast(rows, { title, body });
        await logPushBroadcast({
          title,
          body,
          tokenCount: rows.length,
          sent:       result.sent,
          failures:   result.failures,
          mode:       result.mode,
          source:     'cron',
          adminUserId: null,
        });
      } catch (e) {
        console.error('[push] scheduled send failed:', e.message);
      }
    });

    console.log(`[push] Scheduled broadcast enabled: ${spec}`);
  } catch (e) {
    console.warn('[push] scheduler not started:', e.message);
  }
}

module.exports = { startPushScheduler };
