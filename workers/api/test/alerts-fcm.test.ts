import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { backoffMs, FcmClient, type FcmOutgoing, type PushSender, type SendResult, signAssertion } from '../src/alerts/fcm.ts';
import { plan, sentKey } from '../src/alerts/planner.ts';
import { MAX_SENDS_PER_INVOCATION, type PushQueue, type QueuedMessage, runSends } from '../src/alerts/sender.ts';
import { CELL, NOW } from './helpers.ts';
import { push, sub } from './alerts-helpers.ts';

const RUNS = Number(process.env.FC_NUM_RUNS ?? 100);
const PEM_LABEL = ['PRIVATE', 'KEY'].join(' '); // PEM framing is assembled here so no key-looking literal sits in the file

/** A throwaway key made at run time. Nothing secret is in the repo. */
async function makeAccount() {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  const pem = `-----BEGIN ${PEM_LABEL}-----\n${btoa(bin).replace(/(.{64})/g, '$1\n')}\n-----END ${PEM_LABEL}-----\n`;
  const secret = JSON.stringify({ project_id: 'demo-project', client_email: 'svc@demo-project.iam.example', private_key: pem });
  return { secret, pem, publicKey: pair.publicKey };
}

const out = (over: Partial<FcmOutgoing> = {}): FcmOutgoing => ({
  token: 'x'.repeat(40),
  channel: 'alerts',
  title: 't',
  body: 'b',
  data: { cell: 'c' },
  ttlSeconds: 600,
  ...over,
});

function fakeFcm(fcmReplies: (call: number) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  let sends = 0;
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: `at-${calls.length}`, expires_in: 3600 }), { status: 200 });
    }
    return fcmReplies(sends++);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ok = () => new Response(JSON.stringify({ name: 'projects/demo-project/messages/1' }), { status: 200 });
const err = (status: number, errorCode: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { status: 'X', details: [{ errorCode }] } }), { status, headers });
const oauthCalls = (calls: { url: string }[]) => calls.filter((c) => c.url.includes('oauth2')).length;

describe('L8_fcm_client', () => {
  it('signs an RS256 JWT with the documented claims', async () => {
    const { pem, publicKey } = await makeAccount();
    const sa = { projectId: 'demo-project', clientEmail: 'svc@demo-project.iam.example', privateKeyPem: pem };
    const jwt = await signAssertion(sa, NOW);
    const [h, c, s] = jwt.split('.') as [string, string, string];
    const unb64 = (t: string) => atob(t.replace(/-/g, '+').replace(/_/g, '/'));
    expect(JSON.parse(unb64(h))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(unb64(c))).toMatchObject({
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: Math.floor(NOW / 1000),
      exp: Math.floor(NOW / 1000) + 3600,
    });
    const sig = Uint8Array.from(unb64(s), (ch) => ch.charCodeAt(0));
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sig, new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });

  it('caches the access token across sends, and sends one message per request', async () => {
    const { secret } = await makeAccount();
    const fake = fakeFcm(() => ok());
    const client = new FcmClient({ secret, fetch: fake.f, now: () => NOW });
    expect(await client.send(out())).toEqual({ kind: 'ok', name: 'projects/demo-project/messages/1' });
    await client.send(out());
    expect(oauthCalls(fake.calls)).toBe(1);
    const sendCall = fake.calls.find((c) => c.url.includes('fcm.googleapis.com'));
    expect(sendCall?.url).toBe('https://fcm.googleapis.com/v1/projects/demo-project/messages:send');
    const body = JSON.parse(String(sendCall?.init.body));
    expect(body.message.android).toEqual({ priority: 'HIGH', ttl: '600s', notification: { channel_id: 'alerts' } });
  });

  it('refreshes the token after it expires and once after a 401', async () => {
    const { secret } = await makeAccount();
    let now = NOW;
    const fake = fakeFcm((n) => (n === 0 ? err(401, 'UNAUTHENTICATED') : ok()));
    const client = new FcmClient({ secret, fetch: fake.f, now: () => now });
    expect((await client.send(out())).kind).toBe('ok');
    expect(oauthCalls(fake.calls)).toBe(2);
    now += 3_600_000;
    await client.send(out());
    expect(oauthCalls(fake.calls)).toBe(3);
  });

  it('maps errors: UNREGISTERED, QUOTA_EXCEEDED, UNAVAILABLE, INTERNAL, failed request, other', async () => {
    const { secret } = await makeAccount();
    const cases: [() => Response, SendResult][] = [
      [() => err(404, 'UNREGISTERED'), { kind: 'unregistered' }],
      [() => err(429, 'QUOTA_EXCEEDED', { 'retry-after': '120' }), { kind: 'retry', reason: 'QUOTA_EXCEEDED', retryAfterMs: 120_000 }],
      [() => err(503, 'UNAVAILABLE'), { kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: null }],
      [() => err(500, 'INTERNAL'), { kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: null }],
      [() => err(400, 'INVALID_ARGUMENT'), { kind: 'drop', code: 'INVALID_ARGUMENT' }],
    ];
    for (const [reply, want] of cases) {
      const client = new FcmClient({ secret, fetch: fakeFcm(reply).f, now: () => NOW });
      expect(await client.send(out())).toEqual(want);
    }
    const failing = (async (url: string) => {
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'a', expires_in: 3600 }));
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await new FcmClient({ secret, fetch: failing, now: () => NOW }).send(out())).toEqual({
      kind: 'retry',
      reason: 'UNAVAILABLE',
      retryAfterMs: null,
    });
  });

  it('does nothing without a valid secret', async () => {
    const fake = fakeFcm(() => ok());
    for (const secret of [undefined, '', 'not json', '{"project_id":"p"}']) {
      const r = await new FcmClient({ secret, fetch: fake.f, now: () => NOW }).send(out());
      expect(r).toEqual({ kind: 'drop', code: 'NOT_CONFIGURED' });
    }
    expect(fake.calls).toHaveLength(0);
  });

  it('back-off starts at 1 minute, doubles, and is capped at 1 hour', () => {
    expect([0, 1, 2, 3].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(backoffMs(50)).toBe(3_600_000);
  });
});

/** In-memory queue with the same contract as the SQL one. */
class MemQueue implements PushQueue {
  rows: QueuedMessage[] = [];
  sent = new Map<string, number>();
  tokens = new Map<string, string>();
  due(now: number, limit: number) {
    return this.rows
      .filter((r) => r.nextTryMs <= now)
      .sort((a, b) => a.nextTryMs - b.nextTryMs)
      .slice(0, limit);
  }
  token(i: string, c: string) {
    return this.tokens.get(`${i}|${c}`);
  }
  markSent(m: QueuedMessage) {
    const k = sentKey(m.installId, m.cell, m.episodeId, m.kind);
    this.sent.set(k, (this.sent.get(k) ?? 0) + 1);
    this.drop(m);
  }
  reschedule(m: QueuedMessage, at: number, failed: boolean) {
    m.nextTryMs = at;
    if (failed) m.attempts++;
  }
  drop(m: QueuedMessage) {
    this.rows = this.rows.filter((r) => r !== m);
  }
  removeSubscription(i: string, c: string) {
    this.tokens.delete(`${i}|${c}`);
    this.rows = this.rows.filter((r) => !(r.installId === i && r.cell === c));
  }
  nextDue() {
    return this.rows.length ? Math.min(...this.rows.map((r) => r.nextTryMs)) : null;
  }
}

describe('L8_batching_and_retry', () => {
  it('covers every eligible follower exactly once, in invocation-sized chunks, however sends fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 150 }),
        fc.array(fc.constantFrom<'ok' | 'quota' | 'down'>('ok', 'ok', 'quota', 'down'), { maxLength: 3 }),
        async (followers, failures) => {
          const subs = Array.from({ length: followers }, (_, i) =>
            sub({ installId: `f${String(i).padStart(25, '0')}`, cell: CELL }),
          );
          const q = new MemQueue();
          for (const s of subs) q.tokens.set(`${s.installId}|${s.cell}`, s.fcmToken);
          q.rows = plan([push()], subs, NOW, { has: () => false }).map((m) => ({ ...m, attempts: 0, nextTryMs: NOW }));
          expect(q.rows).toHaveLength(followers);
          const script = [...failures];
          const sender: PushSender = {
            async send() {
              const next = script.shift() ?? 'ok'; // only the first calls fail, so the 10 minute age rule is not reached
              if (next === 'quota') return { kind: 'retry', reason: 'QUOTA_EXCEEDED', retryAfterMs: null };
              if (next === 'down') return { kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: null };
              return { kind: 'ok', name: null };
            },
          };
          let now = NOW;
          for (let invocations = 0; invocations < 100 && q.rows.length > 0; invocations++) {
            const r = await runSends(q, sender, now);
            expect(r.attempted).toBeLessThanOrEqual(MAX_SENDS_PER_INVOCATION);
            const next = q.nextDue();
            if (next !== null) now = Math.max(now + 1, next);
          }
          expect(q.rows).toHaveLength(0);
          expect(q.sent.size).toBe(followers);
          for (const n of q.sent.values()) expect(n).toBe(1);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('an accepted message is not sent again, and an old one is dropped unsent', async () => {
    const q = new MemQueue();
    const s = sub();
    q.tokens.set(`${s.installId}|${s.cell}`, s.fcmToken);
    const [m] = plan([push()], [s], NOW, { has: () => false });
    const row = { ...(m as NonNullable<typeof m>), attempts: 0, nextTryMs: NOW };
    q.rows = [row];
    let calls = 0;
    const sender: PushSender = { send: async () => {
        calls++;
        return { kind: 'ok', name: null };
      } };
    await runSends(q, sender, NOW);
    await runSends(q, sender, NOW + 1);
    expect(calls).toBe(1);
    q.rows = [{ ...row }];
    await runSends(q, sender, NOW + 601_000);
    expect(calls).toBe(1);
    expect(q.rows).toHaveLength(0);
  });
});
