# Bandcamp Code Redeemer

Automatically redeems Bandcamp gift codes from your Gmail inbox within ~30 seconds of the email arriving. No database required — Gmail's read/unread state handles deduplication.

## How it works

```
New email from noreply@bandcamp.com
  → Gmail triggers a Pub/Sub push notification
    → POST /api/webhook (Vercel serverless function)
      → Fetch all unread Bandcamp emails via Gmail API
      → Parse HTML body, extract (yum link, code) pairs
      → For each release: try codes one by one, stop on first success
      → Mark emails as read (prevents reprocessing)
```

## Prerequisites

- A [Vercel](https://vercel.com) account (free hobby plan works)
- A [Google Cloud](https://console.cloud.google.com) account (free tier works)
- Node.js 20+ and pnpm installed locally
- A Bandcamp account with the `identity` cookie handy

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd bandcamp-code-redeem
pnpm install
```

### 2. Create a GCP project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project
2. Enable two APIs for the project:
   - **Gmail API** — [direct link](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - **Cloud Pub/Sub API** — [direct link](https://console.cloud.google.com/apis/library/pubsub.googleapis.com)

### 3. Create OAuth2 credentials

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Add `http://localhost:3000/oauth/callback` to **Authorised redirect URIs**
4. Download or copy the **Client ID** and **Client Secret**

### 4. Create a Pub/Sub topic

1. Go to **Pub/Sub → Topics → Create topic**
2. Name it anything (e.g. `gmail-push`)
3. Note the full topic name: `projects/{project-id}/topics/{topic-name}`
4. Grant the Gmail service account permission to publish to it:
   - On the topic page, open the **Permissions** panel (or **Principals** tab)
   - Add principal: `gmail-api-push@system.gserviceaccount.com`
   - Role: **Pub/Sub Publisher** (French UI: *Éditeur Pub/Sub*)

### 5. Deploy to Vercel

```bash
npx vercel --prod
```

Note the deployment URL (e.g. `https://your-project.vercel.app`).

### 6. Create a Pub/Sub push subscription

1. Go to **Pub/Sub → Subscriptions → Create subscription**
2. Select your topic
3. Delivery type: **Push**
4. Endpoint URL: `https://your-project.vercel.app/api/webhook?token=YOUR_WEBHOOK_SECRET`
   - `YOUR_WEBHOOK_SECRET` is a random string you choose (at least 32 chars); keep it, you'll need it below
5. Leave authentication as **No authentication**

### 7. Get your Bandcamp identity cookie

1. Log in to [bandcamp.com](https://bandcamp.com) in your browser
2. Open DevTools → **Application** → **Cookies** → `bandcamp.com`
3. Copy the value of the `identity` cookie

### 8. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

```dotenv
GOOGLE_CLIENT_ID=        # from step 3
GOOGLE_CLIENT_SECRET=    # from step 3
GOOGLE_REFRESH_TOKEN=    # generated in step 9 below

GMAIL_USER_EMAIL=        # the Gmail address to monitor

GCP_PROJECT_ID=          # your GCP project ID
GMAIL_PUBSUB_TOPIC=      # projects/{project-id}/topics/{topic-name}

BANDCAMP_IDENTITY_COOKIE=  # from step 7

WEBHOOK_SECRET=          # the random string you chose in step 6
CRON_SECRET=             # another random string (at least 32 chars) for the renew-watch cron
```

### 9. Run the OAuth2 flow

```bash
pnpm setup:oauth
```

This starts a local server, prints a URL, and waits. Open the URL in your browser, approve Gmail access, then copy the printed `GOOGLE_REFRESH_TOKEN` into `.env.local`.

### 10. Register Gmail push notifications

```bash
pnpm setup:watch
```

This registers your Gmail inbox with the Pub/Sub topic. Gmail push notifications expire after 7 days — a Vercel Cron job (`/api/renew-watch`) runs every 6 days to renew them automatically. Set `CRON_SECRET` in the Vercel dashboard so the cron endpoint is protected.

### 11. Set environment variables in Vercel

Go to your project in the Vercel dashboard → **Settings → Environment Variables** and add all the variables from `.env.local`.

Then redeploy so the new variables take effect:

```bash
npx vercel --prod
```

### 12. Verify

Send yourself a Bandcamp gift code email (or ask someone to send one), then watch **Vercel → Functions → Logs** for redemption results.

---

## Development

```bash
pnpm dev          # run locally with vercel dev
pnpm build        # type-check
pnpm test         # run unit tests
pnpm lint:fix     # lint and auto-fix

pnpm test:redeem  # manually test a single redemption (edit the script first)
```

---

## Renewing the Gmail watch (every 7 days)

Gmail push notifications expire after 7 days. A Vercel Cron job (`/api/renew-watch`, runs every 6 days) handles this automatically as long as `CRON_SECRET` is set in the Vercel dashboard.

If the cron job missed a cycle, or you see emails no longer being processed, renew manually. This will likely fail with `invalid_grant` first — see below.

### `invalid_grant` (happens almost every time)

Google refresh tokens expire after roughly 7 days of inactivity or when the OAuth consent screen is set to "Testing" (tokens expire after 7 days regardless). Re-run the OAuth flow first:

```bash
pnpm setup:oauth
```

Copy the new `GOOGLE_REFRESH_TOKEN` into `.env.local`, then update `GOOGLE_REFRESH_TOKEN` in the Vercel dashboard. Then register the watch:

```bash
pnpm setup:watch
```

---

## Renewing the Bandcamp cookie

The `identity` cookie expires periodically. When it does you'll see redemption failures in the logs. Refresh it by repeating step 7 and updating `BANDCAMP_IDENTITY_COOKIE` in the Vercel dashboard, then redeploy.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Emails not processed | Pub/Sub subscription not pointing at the right URL, or Gmail watch expired (run `pnpm setup:watch` again — likely needs `pnpm setup:oauth` first) |
| `invalid_grant` when running any script | OAuth refresh token expired — run `pnpm setup:oauth`, update `GOOGLE_REFRESH_TOKEN` in `.env.local` and Vercel, then retry |
| `Failed to GET yum page` (status 429) | Bandcamp rate limit — the code retries once automatically |
| `Quota exceeded` in webhook logs | Gmail API QPM limit hit; the webhook returns 200 to stop Pub/Sub retries, the next email will catch up |
| `Redemption result: invalid` | Code was already used by someone else before the email arrived |
| `Bandcamp cookie expired` | Refresh the `identity` cookie (see above) |
