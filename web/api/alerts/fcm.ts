// FCM HTTP v1 client (alerts-and-light-alarm task 7, R8, R11; property L8). No server SDK: `fetch` is injected.
// - Send API, one message per request: https://firebase.google.com/docs/cloud-messaging/send/v1-api
//   Message fields (token, data, notification, android.priority, android.ttl, android.notification.channel_id):
//   https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages
// - Error codes and back-off (QUOTA_EXCEEDED minimum initial delay of 1 minute): https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode
// - Service-account token: signed JWT (RS256, claims iss, scope, aud, iat, exp), POSTed form-encoded with
//   grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer: https://developers.google.com/identity/protocols/oauth2/service-account
// - Web Crypto in Workers (RSASSA-PKCS1-v1_5 importKey and sign are supported): https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
// The key and every token are used only in memory. Nothing here logs or returns them.

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const BACKOFF_START_MS = 60_000; // R8.1, decisions table
export const BACKOFF_MAX_MS = 3_600_000;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export interface FcmOutgoing {
  token: string;
  channel: string;
  title: string;
  body: string;
  data: Record<string, string>;
  ttlSeconds: number;
  /** Android message priority. Default HIGH. https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#androidmessagepriority */
  priority?: 'HIGH' | 'NORMAL';
}

export type SendResult =
  | { kind: 'ok'; name: string | null }
  | { kind: 'unregistered' }
  | { kind: 'retry'; reason: 'QUOTA_EXCEEDED' | 'UNAVAILABLE'; retryAfterMs: number | null }
  | { kind: 'drop'; code: string };

export interface PushSender {
  send(msg: FcmOutgoing): Promise<SendResult>;
}

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKeyPem: string;
}

/** Null when the secret is missing or not a service-account key. The reason never includes the value. */
export function parseServiceAccount(secret: string | undefined): ServiceAccount | null {
  if (!secret) return null;
  try {
    const j = JSON.parse(secret) as Record<string, unknown>;
    const { project_id: p, client_email: e, private_key: k } = j;
    if (typeof p !== 'string' || typeof e !== 'string' || typeof k !== 'string') return null;
    if (!/^[a-z0-9-]{1,64}$/.test(p) || !k.includes('BEGIN PRIVATE KEY')) return null;
    return { projectId: p, clientEmail: e, privateKeyPem: k };
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlText = (t: string): string => b64url(new TextEncoder().encode(t));

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** A signed JWT assertion for the OAuth token request. Exported for the test, which verifies the signature. */
export async function signAssertion(sa: ServiceAccount, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlText(
    JSON.stringify({ iss: sa.clientEmail, scope: FCM_SCOPE, aud: OAUTH_TOKEN_URL, iat, exp: iat + 3600 }),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const input = `${header}.${claims}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

/** Exponential back-off: 1 minute, 2, 4, ... capped at 1 hour. `attempts` counts failures so far (0 gives the start). */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_START_MS * 2 ** Math.min(Math.max(attempts, 0), 20), BACKOFF_MAX_MS);
}

export interface FcmDeps {
  secret: string | undefined;
  fetch: typeof fetch;
  now(): number;
}

/** Reads FCM's error body: the typed `errorCode` in details wins, then the status string. */
function errorCodeOf(body: unknown, http: number): string {
  const e = (body as { error?: { status?: unknown; details?: unknown } } | null)?.error;
  if (Array.isArray(e?.details)) {
    for (const d of e.details as { errorCode?: unknown }[]) if (typeof d?.errorCode === 'string') return d.errorCode;
  }
  if (typeof e?.status === 'string') return e.status;
  return http === 404 ? 'UNREGISTERED' : http === 429 ? 'QUOTA_EXCEEDED' : http >= 500 ? 'UNAVAILABLE' : `HTTP_${http}`;
}

const retryAfter = (res: Response, nowMs: number): number | null => {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
};

export class FcmClient implements PushSender {
  private cached: { token: string; expiresMs: number } | null = null;
  private account: ServiceAccount | null | undefined;

  constructor(private readonly deps: FcmDeps) {}

  /** Cached until shortly before it expires (one subrequest per refresh). Null when not configured; throws on a failed exchange. */
  private async accessToken(force = false): Promise<string | null> {
    this.account ??= parseServiceAccount(this.deps.secret);
    if (!this.account) return null;
    const now = this.deps.now();
    if (!force && this.cached && now < this.cached.expiresMs - TOKEN_REFRESH_MARGIN_MS) return this.cached.token;
    const assertion = await signAssertion(this.account, now);
    const res = await this.deps.fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`oauth ${res.status}`);
    const j = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof j.access_token !== 'string' || typeof j.expires_in !== 'number') throw new Error('oauth shape');
    this.cached = { token: j.access_token, expiresMs: now + j.expires_in * 1000 };
    return j.access_token;
  }

  async send(msg: FcmOutgoing): Promise<SendResult> {
    this.account ??= parseServiceAccount(this.deps.secret);
    if (!this.account) return { kind: 'drop', code: 'NOT_CONFIGURED' };
    const url = `https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`;
    const payload = JSON.stringify({
      message: {
        token: msg.token,
        notification: { title: msg.title, body: msg.body },
        data: msg.data,
        android: { priority: msg.priority ?? 'HIGH', ttl: `${msg.ttlSeconds}s`, notification: { channel_id: msg.channel } },
      },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      let bearer: string | null;
      try {
        bearer = await this.accessToken(attempt === 1);
      } catch {
        return { kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: null };
      }
      if (bearer === null) return { kind: 'drop', code: 'NOT_CONFIGURED' };
      let res: Response;
      try {
        res = await this.deps.fetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
          body: payload,
        });
      } catch {
        return { kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: null }; // a failed request (R8.3)
      }
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { name?: unknown } | null;
        return { kind: 'ok', name: typeof j?.name === 'string' ? j.name : null };
      }
      if (res.status === 401 && attempt === 0) {
        this.cached = null; // the cached token was refused: sign a new one once
        continue;
      }
      const code = errorCodeOf(await res.json().catch(() => null), res.status);
      if (code === 'UNREGISTERED') return { kind: 'unregistered' };
      if (code === 'QUOTA_EXCEEDED')
        return { kind: 'retry', reason: 'QUOTA_EXCEEDED', retryAfterMs: retryAfter(res, this.deps.now()) };
      if (code === 'UNAVAILABLE' || code === 'INTERNAL' || res.status >= 500) {
        return { kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: retryAfter(res, this.deps.now()) };
      }
      return { kind: 'drop', code }; // INVALID_ARGUMENT, SENDER_ID_MISMATCH and the rest are not fixed by retrying
    }
    return { kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: null };
  }
}
