import { z } from 'zod';

const schema = z.object({
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REFRESH_TOKEN: z.string(),
  GMAIL_USER_EMAIL: z.email(),
  BANDCAMP_IDENTITY_COOKIE: z.string(),
  WEBHOOK_SECRET: z.string().min(32, 'WEBHOOK_SECRET must be at least 32 characters'),
  // Only required for setup scripts and the renew-watch endpoint
  GCP_PROJECT_ID: z.string().optional(),
  GMAIL_PUBSUB_TOPIC: z.string().optional(),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const issues = result.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`Missing or invalid environment variables:\n${issues}`);
  process.exit(1);
}

const parsed = result.data;

// Prevent secrets from appearing in serialised output (e.g. logger.info('ctx', { ...config }))
Object.defineProperty(parsed, 'toJSON', {
  enumerable: false,
  value: () => ({
    ...parsed,
    BANDCAMP_IDENTITY_COOKIE: '[REDACTED]',
    GOOGLE_REFRESH_TOKEN: '[REDACTED]',
    GOOGLE_CLIENT_SECRET: '[REDACTED]',
  }),
});

export const config = parsed;
