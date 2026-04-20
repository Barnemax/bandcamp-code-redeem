import type { gmail_v1 } from 'googleapis';
import { getGmailClient } from './auth.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { concurrentMap } from '../utils/concurrent.js';

export async function fetchUnreadBandcampMessages(): Promise<gmail_v1.Schema$Message[]> {
  const gmail = getGmailClient();

  const twoWeeksAgo = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);
  const listRes = await gmail.users.messages.list({
    q: `from:noreply@bandcamp.com is:unread subject:"new message from" after:${twoWeeksAgo}`,
    userId: config.GMAIL_USER_EMAIL,
  });

  const stubs: gmail_v1.Schema$Message[] = listRes.data.messages ?? [];
  if (stubs.length === 0) {
    return [];
  }

  // Cap concurrent messages.get calls to stay under Gmail's concurrent-request limit.
  const messages = await concurrentMap(stubs, 3, (stub: gmail_v1.Schema$Message) =>
    gmail.users.messages.get({
      format: 'full',
      id: stub.id!,
      userId: config.GMAIL_USER_EMAIL,
    }),
  );

  return messages.map((r: { data: gmail_v1.Schema$Message }) => r.data);
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = getGmailClient();

  await gmail.users.messages.modify({
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
    userId: config.GMAIL_USER_EMAIL,
  });

  logger.debug('Marked message as read', { messageId });
}
