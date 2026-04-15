import { load } from 'cheerio';
import type { gmail_v1 } from 'googleapis';
import { getHtmlBody } from './email.js';
import { logger } from '../utils/logger.js';

export interface CodeEntry {
  yumLink: string;
  code: string;
}

const YUM_LINK_RE = /https?:\/\/[\w-]+\.bandcamp\.com\/yum/i;
const CODE_RE = /\b[a-z0-9]{4}-[a-z0-9]{4}\b/g;

export function extractCodes(message: gmail_v1.Schema$Message): CodeEntry[] {
  const html = getHtmlBody(message);
  if (!html) {
    logger.warn('No HTML body found in message', { messageId: message.id });
    return [];
  }

  const $ = load(html);

  // Collect yum links from anchor hrefs, preserving document order via their
  // position in the raw HTML string (used for positional pairing below).
  const yumLinks: Array<{ url: string; pos: number }> = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const match = href.match(YUM_LINK_RE);
    if (match) {
      const url = match[0];
      // Prefer matching the href attribute to avoid false positives from plain-text occurrences.
      const attrPos = html.indexOf(`href="${href}"`);
      const pos = attrPos !== -1 ? attrPos : html.indexOf(href);
      if (!yumLinks.some((l) => l.url === url)) {
        yumLinks.push({ url, pos });
      }
    }
  });

  if (yumLinks.length === 0) return [];

  // Find all codes and their positions in the raw HTML, ignoring matches
  // inside HTML tags (e.g. "data-blob", "base-url2") to avoid false positives.
  const codeMatches: Array<{ code: string; pos: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CODE_RE.source, 'g');
  while ((m = re.exec(html)) !== null) {
    const before = html.lastIndexOf('<', m.index);
    const closeBefore = html.lastIndexOf('>', m.index);
    if (before !== -1 && before > closeBefore) continue; // inside a tag
    codeMatches.push({ code: m[0], pos: m.index });
  }

  if (codeMatches.length === 0) return [];

  if (yumLinks.length === 1) {
    return codeMatches.map(({ code }) => ({ yumLink: yumLinks[0]!.url, code }));
  }

  // Multiple yum links: pair each code with the last yum link that appears
  // before it in the HTML. If a code appears before all links, use the first.
  logger.debug('Multiple yum links found — using positional pairing', {
    messageId: message.id,
    yumCount: yumLinks.length,
  });

  const sorted = [...yumLinks].sort((a, b) => a.pos - b.pos);

  return codeMatches.map(({ code, pos }) => {
    const link =
      [...sorted].reverse().find((l) => l.pos < pos) ?? sorted[0]!;
    return { yumLink: link.url, code };
  });
}
