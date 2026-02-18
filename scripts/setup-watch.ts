/**
 * One-time script to register Gmail push notifications via Pub/Sub.
 * Re-run every ~6 days (or let the Vercel cron on /api/renew-watch handle it).
 *
 * Usage:
 *   pnpm setup:watch
 */

import { getGmailClient } from '../src/gmail/auth.js';
import { config } from '../src/utils/config.js';

if (!config.GMAIL_PUBSUB_TOPIC) {
  console.error('GMAIL_PUBSUB_TOPIC is not set in .env.local');
  process.exit(1);
}

const gmail = getGmailClient();

const res = await gmail.users.watch({
  userId: config.GMAIL_USER_EMAIL,
  requestBody: {
    labelIds: ['INBOX'],
    topicName: config.GMAIL_PUBSUB_TOPIC,
  },
});

const expiry = new Date(Number(res.data.expiration)).toISOString();
console.log('Gmail watch registered.');
console.log('Expires:', expiry);
console.log('History ID:', res.data.historyId);
