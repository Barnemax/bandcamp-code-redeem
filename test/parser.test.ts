import { describe, it, expect } from 'vitest';
import { extractCodes } from '../src/parser/codes.js';
import type { gmail_v1 } from 'googleapis';

function makeMessage(html: string): gmail_v1.Schema$Message {
  return {
    id: 'test-message-id',
    payload: {
      mimeType: 'text/html',
      body: { data: Buffer.from(html).toString('base64url') },
    },
  };
}

describe('extractCodes', () => {
  it('extracts a single code paired with one yum link', () => {
    const html = `
      <html><body>
        <p>Redeem at <a href="https://artist.bandcamp.com/yum">this link</a></p>
        <p>Your code: 2suq-bpfw</p>
      </body></html>
    `;
    expect(extractCodes(makeMessage(html))).toEqual([
      { yumLink: 'https://artist.bandcamp.com/yum', code: '2suq-bpfw' },
    ]);
  });

  it('returns empty array when no yum link is present', () => {
    const html = `<html><body><p>2suq-bpfw</p></body></html>`;
    expect(extractCodes(makeMessage(html))).toEqual([]);
  });

  it('returns empty array when no code is present', () => {
    const html = `<html><body><a href="https://artist.bandcamp.com/yum">yum</a></body></html>`;
    expect(extractCodes(makeMessage(html))).toEqual([]);
  });

  it('extracts multiple codes for one yum link', () => {
    const html = `
      <html><body>
        <a href="https://artist.bandcamp.com/yum">Download</a>
        <p>aaaa-bbbb</p>
        <p>cccc-dddd</p>
      </body></html>
    `;
    const entries = extractCodes(makeMessage(html));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ yumLink: 'https://artist.bandcamp.com/yum', code: 'aaaa-bbbb' });
    expect(entries[1]).toEqual({ yumLink: 'https://artist.bandcamp.com/yum', code: 'cccc-dddd' });
  });

  it('pairs codes to the correct yum link when multiple are present', () => {
    const html = `
      <html><body>
        <a href="https://artist1.bandcamp.com/yum">Release 1</a>
        <p>aaaa-1111</p>
        <a href="https://artist2.bandcamp.com/yum">Release 2</a>
        <p>bbbb-2222</p>
      </body></html>
    `;
    const entries = extractCodes(makeMessage(html));
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.code === 'aaaa-1111')?.yumLink).toBe('https://artist1.bandcamp.com/yum');
    expect(entries.find((e) => e.code === 'bbbb-2222')?.yumLink).toBe('https://artist2.bandcamp.com/yum');
  });

  it('handles multipart email structure', () => {
    const html = `<html><body><a href="https://artist.bandcamp.com/yum">yum</a><p>1234-abcd</p></body></html>`;
    const message: gmail_v1.Schema$Message = {
      id: 'multipart-id',
      payload: {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: Buffer.from('plain text').toString('base64') } },
          { mimeType: 'text/html', body: { data: Buffer.from(html).toString('base64url') } },
        ],
      },
    };
    expect(extractCodes(message)).toEqual([
      { yumLink: 'https://artist.bandcamp.com/yum', code: '1234-abcd' },
    ]);
  });
});
