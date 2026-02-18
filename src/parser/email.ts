import type { gmail_v1 } from 'googleapis';

type Part = gmail_v1.Schema$MessagePart;

export function getHtmlBody(message: gmail_v1.Schema$Message): string | null {
  return extractHtml(message.payload ?? null);
}

function extractHtml(part: Part | null): string | null {
  if (!part) return null;

  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8');
  }

  for (const child of part.parts ?? []) {
    const found = extractHtml(child);
    if (found) return found;
  }

  return null;
}
