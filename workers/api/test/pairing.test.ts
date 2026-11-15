import fc from 'fast-check';
import {
  type ClaimResponse,
  generateCode,
  isPairId,
  keyOfCode,
  MAX_FAILED_CLAIMS,
  MAX_VIEWERS_PER_STATION,
  OFFER_TTL_MS,
  type OfferResponse,
  PAIRING_ALPHABET,
  shardFromHash,
  shardOfPairId,
} from '@outage/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handlers.ts';
import { constantTimeEqual } from '../src/pairing-core.ts';
import { hashPairingCode } from '../src/pairing-hash.ts';
import { hashInstallId } from '../src/token.ts';
import { ID, makeWorld, NOW, post, ROOMY, SECRET, tokenFor } from './helpers.ts';
import { NUM_RUNS } from './runs.ts';

const VIEWER = 'bbbbbbbbbbbbbbbbbbbbbbbbbb';
const VIEWER2 = 'cccccccccccccccccccccccccc';
type World = ReturnType<typeof makeWorld>;

const claimBody = (code: string, installId = VIEWER, extra: Record<string, unknown> = {}) => ({
  installId,
  code,
  fcmToken: 'fcm-token-1',
  quietStartMin: 1320,
  quietEndMin: 360,
  tzOffsetMin: 60,
  ...extra,
});
const offer = async (w: World, id = ID) => handleRequest(await post('/v1/pair/offer', { installId: id }, await tokenFor(id)), w.deps);
const claim = async (w: World, code: string, id = VIEWER, extra: Record<string, unknown> = {}) =>
  handleRequest(await post('/v1/pair/claim', claimBody(code, id, extra), await tokenFor(id)), w.deps);
const remove = async (w: World, pairId: string, id: string) =>
  handleRequest(await post('/v1/pair/remove', { installId: id, pairId }, await tokenFor(id)), w.deps);
const del = async (w: World, body: unknown, id = ID) => handleRequest(await post('/v1/delete', body, await tokenFor(id)), w.deps);

async function newCode(w: World, id = ID): Promise<string> {
  const res = await offer(w, id);
  expect(res.status).toBe(200);
  return ((await res.json()) as OfferResponse).code;
}
const stationShard = async (id = ID) => shardFromHash(await hashInstallId(id));
/** The same code with its secret part changed, so the key still finds the offer but the hash differs. */
const wrongSecret = (code: string) => code.slice(0, 4) + [...code.slice(4)].map((c) => PAIRING_ALPHABET[(PAIRING_ALPHABET.indexOf(c) + 1) % 30]).join('');
const snapshot = async (res: Response) => ({ status: res.status, body: await res.text(), headers: [...res.headers].sort() });

describe('H5_pairing_rules: offers (R1.1, R1.2, R1.3, R1.7)', () => {
  it('H5_pairing_rules: an offer is a 10-symbol code in the station shard, valid for 10 minutes', async () => {
    const w = makeWorld(ROOMY);
    const res = await offer(w);
    const body = (await res.json()) as OfferResponse;
    expect(res.status).toBe(200);
    expect(body.code).toMatch(new RegExp(`^[${PAIRING_ALPHABET}]{10}$`));
    expect(body.code.slice(0, 2)).toBe(await stationShard());
    expect(body.expiresAtMs).toBe(NOW + OFFER_TTL_MS);
    expect(Object.keys(body).sort()).toEqual(['code', 'expiresAtMs']); // no install id, no location (R1.7)
  });

  it('H5_pairing_rules: only a hash of the code is stored, never the code or a cell', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const shard = w.shard(code.slice(0, 2));
    const row = shard.store.offers.get(keyOfCode(code));
    expect(row?.codeHash).toBe(await hashPairingCode(SECRET, code));
    expect(JSON.stringify([...shard.store.offers.values()])).not.toContain(code);
    expect(Object.keys(row ?? {}).sort()).toEqual(['attempts', 'codeHash', 'expiresMs', 'key', 'stationInstall']);
  });

  it('H5_pairing_rules: a new offer replaces the station’s old one', async () => {
    const w = makeWorld(ROOMY);
    const first = await newCode(w);
    w.deps.randomBytes = (n) => new Uint8Array(n).map((_, i) => (i * 11 + 5) & 127);
    const second = await newCode(w);
    expect(second).not.toBe(first);
    expect((await claim(w, first)).status).toBe(404);
    expect((await claim(w, second)).status).toBe(200);
  });

  it('H5_pairing_rules: a key already held by another station is retried with a new code, then gives 503', async () => {
    const shard = await stationShard();
    const bytesFor = (k: number, len: number) => new Uint8Array(len).map((_, i) => (i * 7 + k * 13) & 127);
    const taken = (key: string) => ({ key, codeHash: 'x', stationInstall: 'other', expiresMs: NOW + 1000, attempts: 0 });

    const w = makeWorld(ROOMY);
    let calls = 0;
    w.deps.randomBytes = (len) => bytesFor(calls++, len);
    const firstKey = keyOfCode(generateCode(shard, (len) => bytesFor(0, len)));
    w.shard(shard).store.offers.set(firstKey, taken(firstKey));
    const res = await offer(w);
    expect(res.status).toBe(200);
    expect(calls).toBe(2); // the first code was refused, the second used
    expect(keyOfCode(((await res.json()) as OfferResponse).code)).not.toBe(firstKey);

    const stuck = makeWorld(ROOMY);
    stuck.deps.randomBytes = (len) => bytesFor(0, len);
    stuck.shard(shard).store.offers.set(firstKey, taken(firstKey));
    expect((await offer(stuck)).status).toBe(503);
  });
});

describe('H5_pairing_rules: claims (R1.2, R1.4, R1.5, R7.2)', () => {
  it('H5_pairing_rules: a claim makes one pair, returns only a pair id, and the code works once', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const res = await claim(w, code, VIEWER, { stationName: 'Home' });
    const body = (await res.json()) as ClaimResponse;
    expect(res.status).toBe(200);
    expect(Object.keys(body)).toEqual(['pairId']);
    expect(isPairId(body.pairId)).toBe(true);
    expect(shardOfPairId(body.pairId)).toBe(code.slice(0, 2));
    const shard = w.shard(code.slice(0, 2));
    expect(shard.store.offers.size).toBe(0);
    expect([...shard.store.pairs.values()]).toEqual([
      {
        pairId: body.pairId,
        stationInstall: ID,
        viewerInstall: VIEWER,
        fcmToken: 'fcm-token-1',
        quietStartMin: 1320,
        quietEndMin: 360,
        tzOffsetMin: 60,
        stationName: 'Home',
        createdMs: NOW,
      },
    ]);
    expect((await claim(w, code, VIEWER2)).status).toBe(404);
    expect(shard.store.pairs.size).toBe(1);
  });

  it('H5_pairing_rules: typed codes are accepted with spaces, hyphens and lower case', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const typed = `${code.slice(0, 5)}-${code.slice(5)}`.toLowerCase();
    expect((await claim(w, typed)).status).toBe(200);
  });

  it('H5_pairing_rules: the station name is stored only when the viewer sends it (R7.6)', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    await claim(w, code);
    expect([...w.shard(code.slice(0, 2)).store.pairs.values()][0].stationName).toBeNull();
  });

  it('H5_pairing_rules: no claim works at or after expiry, and the expired offer is dropped', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    w.now = NOW + OFFER_TTL_MS;
    expect((await claim(w, code)).status).toBe(404);
    expect(w.shard(code.slice(0, 2)).store.offers.size).toBe(0);
    const code2 = await newCode(w);
    w.now += OFFER_TTL_MS - 1;
    expect((await claim(w, code2)).status).toBe(200);
  });

  it('H5_pairing_rules: five failed claims burn the offer, so the right code then fails', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    for (let i = 0; i < MAX_FAILED_CLAIMS; i++) {
      expect((await claim(w, wrongSecret(code), VIEWER2)).status).toBe(404);
    }
    expect(w.shard(code.slice(0, 2)).store.offers.size).toBe(0);
    expect((await claim(w, code)).status).toBe(404);
  });

  it('H5_pairing_rules: the right code still works after four failures', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    for (let i = 0; i < MAX_FAILED_CLAIMS - 1; i++) await claim(w, wrongSecret(code), VIEWER2);
    expect(w.shard(code.slice(0, 2)).store.offers.get(keyOfCode(code))?.attempts).toBe(4);
    expect((await claim(w, code)).status).toBe(200);
  });

  it('H5_pairing_rules: every failure gives the same answer: unknown code, wrong code, bad shape, used, burned, expired', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const shapes = [
      await claim(w, 'AAAAAAAAAA'), // unknown shard and key
      await claim(w, `${code.slice(0, 4)}AAAAAA`), // key found, wrong secret
      await claim(w, 'short'), // bad shape
      await claim(w, 'OOOOOOOOOO'), // look-alike symbols
    ];
    const used = await newCode(w);
    await claim(w, used);
    shapes.push(await claim(w, used, VIEWER2)); // used
    const burn = await newCode(w);
    for (let i = 0; i < MAX_FAILED_CLAIMS; i++) await claim(w, wrongSecret(burn));
    shapes.push(await claim(w, burn)); // burned
    const old = await newCode(w);
    w.now += OFFER_TTL_MS + 1;
    shapes.push(await claim(w, old)); // expired
    const snaps = await Promise.all(shapes.map(snapshot));
    for (const s of snaps) expect(s).toEqual(snaps[0]);
    expect(snaps[0].status).toBe(404);
    expect(JSON.parse(snaps[0].body)).toEqual({ error: 'not_found' });
  });

  it('H5_pairing_rules: any wrong code gives the one generic answer and never makes a pair', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const reference = await snapshot(await claim(w, 'AAAAAAAAAA'));
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(new RegExp(`^[${PAIRING_ALPHABET}]{10}$`)).filter((c) => c !== code), async (guess) => {
        // Reset the burn counter so the property tests the answer, not the burn.
        const row = w.shard(code.slice(0, 2)).store.offers.get(keyOfCode(code));
        if (row) row.attempts = 0;
        expect(await snapshot(await claim(w, guess))).toEqual(reference);
        expect(w.shard(guess.slice(0, 2)).store.pairs.size).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H5_pairing_rules: a station cannot claim its own offer, and the offer stays for the real viewer', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    expect((await claim(w, code, ID)).status).toBe(404);
    expect((await claim(w, code)).status).toBe(200);
  });

  it('H5_pairing_rules: pairing the same two phones again replaces the old pair', async () => {
    const w = makeWorld(ROOMY);
    const a = await newCode(w);
    const first = ((await (await claim(w, a)).json()) as ClaimResponse).pairId;
    w.deps.randomBytes = (n) => new Uint8Array(n).map((_, i) => (i * 11 + 5) & 127);
    const b = await newCode(w);
    const second = ((await (await claim(w, b)).json()) as ClaimResponse).pairId;
    expect(second).not.toBe(first);
    expect([...w.shard(a.slice(0, 2)).store.pairs.keys()]).toEqual([second]);
  });
});

describe('H5_pairing_rules: limits (R1.6, R1.9)', () => {
  it('H5_pairing_rules: offers and claims use the per-install bucket and answer 429 with a retry hint', async () => {
    const w = makeWorld({ ...ROOMY, BUCKET_CAPACITY: 3 });
    for (let i = 0; i < 3; i++) expect((await offer(w)).status).toBe(200);
    const limited = await offer(w);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    const code = await (async () => {
      w.now += 10 * ROOMY.BUCKET_REFILL_MS;
      return newCode(w);
    })();
    for (let i = 0; i < 2; i++) expect((await claim(w, wrongSecret(code))).status).toBe(404);
    expect((await claim(w, wrongSecret(code))).status).toBe(404); // 3rd token used (offer took 1)
    expect((await claim(w, wrongSecret(code))).status).toBe(429);
  });

  it('H5_pairing_rules: a station takes at most five viewers, checked at offer time and at claim time', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const shard = w.shard(code.slice(0, 2));
    for (let i = 0; i < MAX_VIEWERS_PER_STATION; i++) {
      shard.store.pairs.set(`p${i}`, {
        pairId: `p${i}`, stationInstall: ID, viewerInstall: `v${i}`, fcmToken: 't', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: null, createdMs: NOW,
      });
    }
    const res = await claim(w, code);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'station_full' });
    expect(shard.store.offers.size).toBe(1); // the offer is kept
    expect((await offer(w)).status).toBe(409);
    shard.store.pairs.delete('p0');
    expect((await claim(w, code)).status).toBe(200);
  });
});

describe('H5_pairing_rules: access (R1.4)', () => {
  it('H5_pairing_rules: pairing calls need a valid, unrevoked token for the install in the body', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const post1 = async (path: string, body: unknown, token?: string) => handleRequest(await post(path, body, token), w.deps);
    expect((await post1('/v1/pair/offer', { installId: ID })).status).toBe(401);
    expect((await post1('/v1/pair/offer', { installId: ID }, await tokenFor(VIEWER))).status).toBe(401);
    expect((await post1('/v1/pair/claim', claimBody(code), await tokenFor(VIEWER2))).status).toBe(401);
    w.revoked.add(ID);
    expect((await offer(w)).status).toBe(401);
    expect((await post1('/v1/pair/offer', { installId: 'nope' }, 'x')).status).toBe(400);
    const wrongMethod = await handleRequest(new Request('https://api.test/v1/pair/claim'), w.deps);
    expect(wrongMethod.status).toBe(405);
  });

  it('H5_pairing_rules: an unconfigured Worker answers 500 and stores nothing', async () => {
    const w = makeWorld(ROOMY, null);
    expect((await offer(w)).status).toBe(500);
    expect(w.shards.size).toBe(0);
  });
});

describe('H5_pairing_rules: hash and compare (R7.2)', () => {
  it('H5_pairing_rules: the stored hash is an HMAC of the code under the secret', async () => {
    const a = await hashPairingCode('s1', 'AB23456789');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPairingCode('s1', 'AB23456789')).toBe(a);
    expect(await hashPairingCode('s2', 'AB23456789')).not.toBe(a);
    expect(await hashPairingCode('s1', 'AB2345678A')).not.toBe(a);
    await expect(hashPairingCode('', 'AB23456789')).rejects.toThrow();
  });

  it('H5_pairing_rules: constantTimeEqual agrees with strict equality', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 70 }), fc.string({ maxLength: 70 }), (a, b) => {
        expect(constantTimeEqual(a, b)).toBe(a === b);
        expect(constantTimeEqual(a, a)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('R1.10 remove a pair', () => {
  async function paired(w: World) {
    const code = await newCode(w);
    const pairId = ((await (await claim(w, code)).json()) as ClaimResponse).pairId;
    return { code, pairId, shard: w.shard(code.slice(0, 2)) };
  }

  it('R1.10 either side removes the pair and its push token', async () => {
    for (const who of [VIEWER, ID]) {
      const w = makeWorld(ROOMY);
      const { pairId, shard } = await paired(w);
      expect((await remove(w, pairId, who)).status).toBe(200);
      expect(shard.store.pairs.size).toBe(0);
      expect((await remove(w, pairId, who)).status).toBe(404); // already gone
    }
  });

  it('R1.10 another install cannot remove it, and the answer matches an unknown pair id', async () => {
    const w = makeWorld(ROOMY);
    const { pairId, shard } = await paired(w);
    const stranger = await snapshot(await remove(w, pairId, VIEWER2));
    const unknown = await snapshot(await remove(w, `${pairId.slice(0, 2)}${'0'.repeat(32)}`, VIEWER2));
    expect(stranger).toEqual(unknown);
    expect(stranger.status).toBe(404);
    expect(shard.store.pairs.size).toBe(1);
  });

  it('R1.10 a malformed pair id is 400', async () => {
    const w = makeWorld(ROOMY);
    const res = await handleRequest(await post('/v1/pair/remove', { installId: ID, pairId: 'nope' }, await tokenFor()), w.deps);
    expect(res.status).toBe(400);
  });
});

describe('H8_delete_removes_pairs (R1.10, R7.4)', () => {
  it('H8_delete_removes_pairs: a station delete removes its offers and pairs and leaves other stations alone', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    await claim(w, code);
    const other = 'dddddddddddddddddddddddddd';
    const otherCode = await newCode(w, other);
    const otherPair = ((await (await claim(w, otherCode, VIEWER2)).json()) as ClaimResponse).pairId;
    await newCode(w); // a fresh live offer of the station
    const res = await del(w, { installId: ID, cells: [] });
    expect(res.status).toBe(200);
    for (const s of w.shards.values()) {
      expect([...s.store.pairs.values()].some((p) => p.stationInstall === ID)).toBe(false);
      expect([...s.store.offers.values()].some((o) => o.stationInstall === ID)).toBe(false);
    }
    expect(w.shard(otherCode.slice(0, 2)).store.pairs.has(otherPair)).toBe(true);
  });

  it('H8_delete_removes_pairs: a viewer delete that lists its pair ids removes the pairs and push tokens', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    const pairId = ((await (await claim(w, code)).json()) as ClaimResponse).pairId;
    const code2 = await newCode(w);
    const keep = ((await (await claim(w, code2, VIEWER2)).json()) as ClaimResponse).pairId;
    const res = await del(w, { installId: VIEWER, cells: [], pairIds: [pairId] }, VIEWER);
    expect(res.status).toBe(200);
    const rows = [...w.shards.values()].flatMap((s) => [...s.store.pairs.values()]);
    expect(rows.some((p) => p.viewerInstall === VIEWER)).toBe(false);
    expect(rows.map((p) => p.pairId)).toEqual([keep]);
  });

  it('H8_delete_removes_pairs: any set of installs and pairs leaves nothing for the deleted install', async () => {
    const ids = ['aaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccccc', 'dddddddddddddddddddddddddd'];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.constantFrom(...ids), fc.constantFrom(...ids)), { maxLength: 8 }),
        fc.constantFrom(...ids),
        async (links, victim) => {
          const w = makeWorld(ROOMY);
          let t = 0;
          const pairIds: Record<string, string[]> = {};
          for (const [station, viewer] of links) {
            if (station === viewer) continue;
            w.deps.randomBytes = (n) => new Uint8Array(n).map((_, i) => (i * 31 + ++t * 17) & 127);
            const code = await newCode(w, station);
            const res = await claim(w, code, viewer);
            if (res.status === 200) {
              const list = pairIds[viewer] ?? [];
              list.push(((await res.json()) as ClaimResponse).pairId);
              pairIds[viewer] = list;
            }
          }
          const res = await del(w, { installId: victim, cells: [], pairIds: (pairIds[victim] ?? []).slice(-25) }, victim);
          expect(res.status).toBe(200);
          for (const s of w.shards.values()) {
            for (const p of s.store.pairs.values()) {
              expect(p.stationInstall).not.toBe(victim);
              expect(p.viewerInstall).not.toBe(victim);
            }
            for (const o of s.store.offers.values()) expect(o.stationInstall).not.toBe(victim);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('H8_delete_removes_pairs: a failing shard gives 502 and the retry finishes the removal', async () => {
    const w = makeWorld(ROOMY);
    const code = await newCode(w);
    await claim(w, code);
    const shard = code.slice(0, 2);
    w.failShards.add(shard);
    expect((await del(w, { installId: ID, cells: [] })).status).toBe(502);
    w.failShards.clear();
    expect((await del(w, { installId: ID, cells: [] })).status).toBe(200);
    expect(w.shard(shard).store.pairs.size).toBe(0);
  });

  it('H8_delete_removes_pairs: a delete request lists at most 25 pair ids and only well-formed ones', async () => {
    const w = makeWorld(ROOMY);
    expect((await del(w, { installId: ID, cells: [], pairIds: ['x'] })).status).toBe(400);
    expect((await del(w, { installId: ID, cells: [], pairIds: [], extra: 1 })).status).toBe(400);
  });
});
