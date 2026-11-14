// UserPromptSubmit: if the prompt mentions a new service or SDK, inject "Budget is zero: confirm a free tier first".
// The prompt arrives in the USER_PROMPT environment variable (https://kiro.dev/docs/hooks/types/) and in the payload when present.
import { readPayload, say } from './lib.mjs';

const payload = readPayload();
const prompt = String(process.env.USER_PROMPT || payload.prompt || payload.user_prompt || '');
if (!prompt.trim()) process.exit(0);

const SERVICES = [
  'firebase', 'supabase', 'stripe', 'sentry', 'datadog', 'posthog', 'mixpanel', 'amplitude', 'twilio', 'sendgrid', 'mailgun',
  'aws', 'amazon web services', 'azure', 'gcp', 'google cloud', 'vercel', 'netlify', 'heroku', 'render.com', 'fly.io', 'railway', 'planetscale', 'neon', 'mongodb',
  'redis', 'upstash', 'algolia', 'pusher', 'onesignal', 'mapbox', 'google maps', 'openai', 'anthropic', 'cloudinary', 'auth0', 'clerk',
  'cloudflare kv', 'workers kv', 'cloudflare d1', 'cloudflare r2', 'cloudflare queues', 'vectorize', 'hyperdrive', 'play integrity', 'play store', 'app store',
];
const GENERIC = /\b(new (service|sdk|provider|api)|third[- ]party|paid plan|subscription|api key|saas|managed service|crash reporting|(add|install|integrate|adopt|sign up for|switch to)\s+(a|an|the)?\s*[\w.-]+\s+sdk)\b/i;

const lower = prompt.toLowerCase();
const hits = SERVICES.filter((s) => new RegExp(`(^|[^a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(lower));
const generic = prompt.match(GENERIC);
if (hits.length || generic) {
  say([
    'Budget is zero: confirm a free tier first.',
    `Detected in the prompt: ${[...new Set([...hits, generic?.[0]].filter(Boolean))].join(', ')}.`,
    'Before adding any service, SDK or dependency: check its free tier and limits with a docs server, write the options in an ADR, and ask the human (Part H). Do not add it silently.',
  ]);
}
process.exit(0);
