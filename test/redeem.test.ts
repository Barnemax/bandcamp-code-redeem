import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/config.js', () => ({
  config: {
    BANDCAMP_IDENTITY_COOKIE: 'test-cookie',
  },
}));

import { redeemCode, redeemAll } from '../src/redeem/http.js';

const YUM_LINK = 'https://artist.bandcamp.com/yum';

const API_PARAMS = {
  is_corp: false,
  band_id: 123,
  platform_closed: false,
  hard_to_download: false,
  fan_logged_in: true,
  band_url: 'https://artist.bandcamp.com',
  was_logged_out: null,
  is_https: true,
  ref_url: null,
};

function yumPageHtml(apiParams = API_PARAMS, crumb = 'test-crumb'): string {
  const blob = JSON.stringify({ api_params: apiParams });
  const crumbs = JSON.stringify({ 'api/codes/1/redeem': crumb });
  return `
    <html>
      <head><meta id="js-crumbs-data" data-crumbs='${crumbs}'></head>
      <body><div id="pagedata" data-blob='${blob}'></div></body>
    </html>
  `;
}

function mockFetchSequence(responses: Array<{ body: string; status?: number }>): void {
  const queue = [...responses];
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('Unexpected fetch call');
    return new Response(next.body, { status: next.status ?? 200 });
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('redeemCode', () => {
  it('returns redeemed on success', async () => {
    mockFetchSequence([
      { body: yumPageHtml() },                  // GET yum page
      { body: JSON.stringify({ ok: true }) },   // POST redeem
    ]);

    const result = await redeemCode({ yumLink: YUM_LINK, code: 'aaaa-bbbb' });
    expect(result.status).toBe('redeemed');
  });

  it('returns already_redeemed when code was used', async () => {
    mockFetchSequence([
      { body: yumPageHtml() },
      { body: JSON.stringify({ ok: false, errors: [{ field: 'code', reason: 'invalid.already_redeemed' }] }) },
    ]);

    const result = await redeemCode({ yumLink: YUM_LINK, code: 'aaaa-bbbb' });
    expect(result.status).toBe('already_redeemed');
  });

  it('returns invalid for other invalid.* reasons', async () => {
    mockFetchSequence([
      { body: yumPageHtml() },
      { body: JSON.stringify({ ok: false, errors: [{ field: 'code', reason: 'invalid.not_found' }] }) },
    ]);

    const result = await redeemCode({ yumLink: YUM_LINK, code: 'aaaa-bbbb' });
    expect(result.status).toBe('invalid');
    expect(result.error).toBe('invalid.not_found');
  });

  it('returns error when yum page fetch fails', async () => {
    mockFetchSequence([
      { body: 'Not Found', status: 404 },
    ]);

    const result = await redeemCode({ yumLink: YUM_LINK, code: 'aaaa-bbbb' });
    expect(result.status).toBe('error');
    expect(result.error).toContain('page data');
  });

  it('returns error when yum page has no pagedata blob', async () => {
    mockFetchSequence([
      { body: '<html><body></body></html>' },
    ]);

    const result = await redeemCode({ yumLink: YUM_LINK, code: 'aaaa-bbbb' });
    expect(result.status).toBe('error');
  });

  it('returns error on non-JSON redeem response', async () => {
    mockFetchSequence([
      { body: yumPageHtml() },
      { body: '<html>Server Error</html>', status: 500 },
    ]);

    const result = await redeemCode({ yumLink: YUM_LINK, code: 'aaaa-bbbb' });
    expect(result.status).toBe('error');
    expect(result.error).toContain('Non-JSON response');
  });
});

describe('redeemAll', () => {
  it('skips remaining codes for a link after first success', async () => {
    mockFetchSequence([
      { body: yumPageHtml() },                  // GET yum page (once)
      { body: JSON.stringify({ ok: true }) },   // first code succeeds
    ]);

    const results = await redeemAll([
      { yumLink: YUM_LINK, code: 'aaaa-1111' },
      { yumLink: YUM_LINK, code: 'bbbb-2222' },
      { yumLink: YUM_LINK, code: 'cccc-3333' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]!.status).toBe('redeemed');
    expect(results[1]!.status).toBe('skipped');
    expect(results[2]!.status).toBe('skipped');
  });

  it('tries next code when first is already_redeemed', async () => {
    mockFetchSequence([
      { body: yumPageHtml() },
      { body: JSON.stringify({ ok: false, errors: [{ field: 'code', reason: 'invalid.already_redeemed' }] }) },
      { body: JSON.stringify({ ok: true }) },
    ]);

    const results = await redeemAll([
      { yumLink: YUM_LINK, code: 'aaaa-1111' },
      { yumLink: YUM_LINK, code: 'bbbb-2222' },
    ]);

    expect(results[0]!.status).toBe('already_redeemed');
    expect(results[1]!.status).toBe('redeemed');
  });

  it('marks all codes as error when page data fetch fails', async () => {
    mockFetchSequence([
      { body: 'Not Found', status: 404 },
    ]);

    const results = await redeemAll([
      { yumLink: YUM_LINK, code: 'aaaa-1111' },
      { yumLink: YUM_LINK, code: 'bbbb-2222' },
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'error')).toBe(true);
  });

  it('fetches each unique yum link only once', async () => {
    const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(yumPageHtml()))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    await redeemAll([
      { yumLink: YUM_LINK, code: 'aaaa-1111' },
      { yumLink: YUM_LINK, code: 'bbbb-2222' },
    ]);

    // 1 GET for yum page + 1 POST for first code (second skipped after success)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
