import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGmailClient } from '../src/gmail/auth.js';
import { config } from '../src/utils/config.js';
import { logger } from '../src/utils/logger.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Vercel cron invocations include Authorization: Bearer <CRON_SECRET>.
  // Require the secret so that arbitrary callers cannot consume Gmail watch quota.
  const cronSecret = process.env['CRON_SECRET'];
  if (!cronSecret) {
    logger.error('CRON_SECRET is not set — refusing renew-watch');
    res.status(500).json({ error: 'CRON_SECRET not configured' });
    return;
  }
  if (req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    res.status(401).end();
    return;
  }

  if (!config.GMAIL_PUBSUB_TOPIC) {
    res.status(500).json({ error: 'GMAIL_PUBSUB_TOPIC is not set' });
    return;
  }

  try {
    const gmail = getGmailClient();

    const watchRes = await gmail.users.watch({
      userId: config.GMAIL_USER_EMAIL,
      requestBody: {
        labelIds: ['INBOX'],
        topicName: config.GMAIL_PUBSUB_TOPIC,
      },
    });

    const expiry = new Date(Number(watchRes.data.expiration)).toISOString();
    logger.info('Gmail watch renewed', { expiry });

    res.status(200).json({ ok: true, expiry });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to renew Gmail watch', { error: message });
    res.status(500).json({ error: message });
  }
}
