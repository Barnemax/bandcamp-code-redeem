/**
 * Manually test redemption of a single code.
 *
 * Usage:
 *   pnpm test:redeem <yumLink> <code>
 *
 * Example:
 *   pnpm test:redeem https://artist.bandcamp.com/yum 2suq-bpfw
 */

import { redeemCode } from '../src/redeem/http.js';

const [, , yumLink, code] = process.argv;

if (!yumLink || !code) {
  console.error('Usage: pnpm test:redeem <yumLink> <code>');
  process.exit(1);
}

const result = await redeemCode({ yumLink, code });
console.log(JSON.stringify(result, null, 2));

if (result.status !== 'redeemed') {
  process.exit(1);
}
