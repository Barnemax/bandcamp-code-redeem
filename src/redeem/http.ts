import * as cheerio from 'cheerio';
import type { YumPageBlob } from '@barnemax/bandcamp-types';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

import type { CodeEntry } from '../parser/codes.js';

export type RedemptionStatus = 'redeemed' | 'already_redeemed' | 'invalid' | 'skipped' | 'error';

export interface RedemptionResult extends CodeEntry {
  status: RedemptionStatus;
  error?: string;
}

interface YumPageData {
  apiParams: YumPageBlob['api_params'];
  crumbs: Record<string, string>;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 10_000;

/** Calls `call()` once; if Bandcamp responds 429, honours the Retry-After header
 *  (capped at 10 s) then tries once more. */
async function retryOn429(call: () => Promise<Response>): Promise<Response> {
  const res = await call();
  if (res.status !== 429) return res;
  const parsed = parseFloat(res.headers.get('Retry-After') ?? '');
  const delayMs = Number.isFinite(parsed)
    ? Math.min(parsed * 1_000, MAX_RETRY_DELAY_MS)
    : DEFAULT_RETRY_DELAY_MS;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return call();
}

function bandcampHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Cookie: `identity=${config.BANDCAMP_IDENTITY_COOKIE}`,
    'User-Agent': USER_AGENT,
    ...extra,
  };
}

async function getYumPageData(yumLink: string): Promise<YumPageData | null> {
  const res = await retryOn429(() =>
    fetch(yumLink, {
      headers: bandcampHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  );
  if (!res.ok) {
    logger.warn('Failed to GET yum page', { yumLink, status: res.status });
    return null;
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const blobRaw = $('#pagedata').attr('data-blob');

  if (!blobRaw) {
    logger.warn('No #pagedata[data-blob] found on yum page', { yumLink });
    return null;
  }

  let blob: YumPageBlob;
  try {
    blob = JSON.parse(blobRaw) as YumPageBlob;
  } catch {
    logger.warn('Failed to parse #pagedata[data-blob] as JSON', { yumLink });
    return null;
  }

  const apiParams = blob.api_params;

  // Crumbs live in <meta id="js-crumbs-data" data-crumbs="..."> as a JSON map keyed by API path.
  const crumbsRaw = $('#js-crumbs-data').attr('data-crumbs');
  let crumbs: Record<string, string> = {};
  if (crumbsRaw) {
    try {
      crumbs = JSON.parse(crumbsRaw) as Record<string, string>;
    } catch {
      logger.warn('Failed to parse #js-crumbs-data[data-crumbs] as JSON', { yumLink });
    }
  }

  if (!apiParams) {
    logger.warn('Missing api_params in page data', { yumLink });
    return null;
  }

  if (!crumbs['api/codes/1/redeem']) {
    logger.warn('Missing redeem crumb in page data', { yumLink });
    return null;
  }

  return { apiParams, crumbs };
}

async function redeemCodeWithData(entry: CodeEntry, pageData: YumPageData): Promise<RedemptionResult> {
  const { yumLink, code } = entry;
  const { apiParams, crumbs } = pageData;
  const origin = new URL(yumLink).origin;
  const apiUrl = `${origin}/api/codes/1/redeem`;

  try {
    const body = JSON.stringify({ ...apiParams, code, collection_add: true, mailing_list: false, crumb: crumbs['api/codes/1/redeem'] });
    const res = await retryOn429(() =>
      fetch(apiUrl, {
        method: 'POST',
        headers: bandcampHeaders({
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: yumLink,
        }),
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    );

    const text = await res.text();

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        ...entry,
        status: 'error',
        error: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
      };
    }

    if (json['ok'] === true) {
      return { ...entry, status: 'redeemed' };
    }

    const errors = json['errors'];
    if (Array.isArray(errors) && errors.length > 0) {
      const reason = (errors[0] as Record<string, unknown>)['reason'];
      if (typeof reason === 'string') {
        if (reason === 'invalid.already_redeemed') {
          return { ...entry, status: 'already_redeemed', error: reason };
        }
        if (reason.startsWith('invalid.')) {
          return { ...entry, status: 'invalid', error: reason };
        }
      }
    }

    return {
      ...entry,
      status: 'error',
      error: `Unexpected response: ${text.slice(0, 200)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...entry, status: 'error', error: message };
  }
}

export async function redeemCode(entry: CodeEntry): Promise<RedemptionResult> {
  const pageData = await getYumPageData(entry.yumLink);
  if (!pageData) {
    return { ...entry, status: 'error', error: 'Could not extract page data from yum page' };
  }
  return redeemCodeWithData(entry, pageData);
}

export async function redeemAll(entries: CodeEntry[]): Promise<RedemptionResult[]> {
  // Fetch each unique yumLink once — multiple codes from the same release share page data.
  const uniqueLinks = [...new Set(entries.map((e) => e.yumLink))];
  const pageDataMap = new Map<string, YumPageData | null>();
  for (const link of uniqueLinks) {
    pageDataMap.set(link, await getYumPageData(link));
  }

  // Per release: try codes sequentially and stop as soon as one succeeds.
  // Bandcamp returns ok:true even if you already own the item, so burning
  // through all codes for the same release would waste them needlessly.
  const results: RedemptionResult[] = [];
  for (const link of uniqueLinks) {
    const codesForLink = entries.filter((e) => e.yumLink === link);
    const pageData = pageDataMap.get(link) ?? null;

    if (!pageData) {
      for (const entry of codesForLink) {
        results.push({ ...entry, status: 'error', error: 'Could not extract page data from yum page' });
      }
      continue;
    }

    let succeeded = false;
    for (const entry of codesForLink) {
      if (succeeded) {
        results.push({ ...entry, status: 'skipped' });
        continue;
      }
      const result = await redeemCodeWithData(entry, pageData);
      results.push(result);
      if (result.status === 'redeemed') {
        succeeded = true;
      }
    }
  }

  return results;
}
