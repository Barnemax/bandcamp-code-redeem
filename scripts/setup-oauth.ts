/**
 * One-time script to complete the OAuth2 consent flow and get a refresh token.
 *
 * Usage:
 *   1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local
 *   2. pnpm setup:oauth
 *   3. Visit the printed URL, approve access
 *   4. The refresh token is printed — add it to .env.local as GOOGLE_REFRESH_TOKEN
 */

import { google } from 'googleapis';
import * as http from 'http';


const CLIENT_ID = process.env['GOOGLE_CLIENT_ID'];
const CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'http://localhost:3000/oauth/callback',
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.modify'],
  prompt: 'consent', // Ensures a refresh token is always returned
});

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback on http://localhost:3000 ...\n');

async function handleCallback(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const parsed = new URL(req.url ?? '/', 'http://localhost:3000');
  if (parsed.pathname !== '/oauth/callback') {
    res.end('Not found');
    return;
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    res.end('Missing code');
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\nSuccess! Add this to .env.local:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    res.end('<h1>Done — you can close this tab.</h1>');
  } catch (err) {
    console.error('Token exchange failed:', err);
    res.end('Error — check the terminal.');
  } finally {
    server.close();
  }
}

const server = http.createServer((req, res) => {
  void handleCallback(req, res);
}).listen(3000);
