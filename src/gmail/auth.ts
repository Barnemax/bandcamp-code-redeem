import { google, gmail_v1, type Auth } from 'googleapis';
import { config } from '../utils/config.js';

let _authClient: Auth.OAuth2Client | null = null;

function getAuthClient(): Auth.OAuth2Client {
  if (!_authClient) {
    _authClient = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
    _authClient.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
  }
  return _authClient;
}

let _gmailClient: gmail_v1.Gmail | null = null;

export function getGmailClient(): gmail_v1.Gmail {
  if (!_gmailClient) {
    _gmailClient = new gmail_v1.Gmail({ auth: getAuthClient() });
  }
  return _gmailClient;
}
