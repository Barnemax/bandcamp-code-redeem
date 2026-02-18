import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchUnreadBandcampMessages, markAsRead } from '../src/gmail/fetch.js';
import { extractCodes } from '../src/parser/codes.js';
import { redeemAll } from '../src/redeem/http.js';
import { logger } from '../src/utils/logger.js';
import { config } from '../src/utils/config.js';

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as unknown as Record<string, unknown>)['status'];
  if (status === 429) return true;
  return (
    err.message.includes('Quota exceeded') ||
    err.message.includes('rateLimitExceeded') ||
    err.message.includes('Too many concurrent requests')
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  if (req.query['token'] !== config.WEBHOOK_SECRET) {
    logger.warn('Rejected webhook — bad token');
    res.status(403).end();
    return;
  }

  try {
    const messages = await fetchUnreadBandcampMessages();
    logger.info('Processing unread messages', { count: messages.length });

    // Process messages sequentially to avoid Gmail concurrent-request rate limits.
    let totalRedeemed = 0;
    for (const message of messages) {
      const messageId = message.id!;
      const entries = extractCodes(message);

      if (entries.length > 0) {
        const results = await redeemAll(entries);

        for (const result of results) {
          // Omit the gift code itself from log lines — it's single-use but still sensitive.
          const { code: _code, ...logResult } = result;
          logger.info('Redemption result', { messageId, ...logResult });
          if (result.status === 'redeemed') totalRedeemed++;
        }
      } else {
        logger.debug('No codes found in message', { messageId });
      }

      // Mark as read regardless of outcome — prevents reprocessing on next push.
      await markAsRead(messageId);
    }
    res.status(200).json({ processed: messages.length, redeemed: totalRedeemed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Webhook handler failed', { error: message });
    if (isQuotaError(err)) {
      // Return 200 to stop Pub/Sub from retrying — retries would only make quota worse.
      // The next push notification (any email) will re-process all unread Bandcamp messages.
      res.status(200).json({ error: message, skipped: 'quota_exceeded' });
      return;
    }
    // Return 500 so Pub/Sub retries with backoff.
    res.status(500).json({ error: message });
  }
}
