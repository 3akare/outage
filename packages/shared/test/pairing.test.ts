import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type ClaimRequest,
  decideClaim,
  generateCode,
  generatePairId,
  isPairId,
  isPairingCode,
  MAX_FAILED_CLAIMS,
  normalizeCode,
  OFFER_TTL_MS,
  type OfferLife,
  PAIRING_ALPHABET,
  PAIRING_SHARDS,
  parseClaimRequest,
  parseDeleteRequest,
  parseOfferRequest,
  parseRemovePairRequest,
  shardFromHash,
  shardOfCode,
  shardOfPairId,
} from '../src/index.ts';
import { NUM_RUNS } from './runs.ts';

const INSTALL = 'kg4yq7mxwb2ndpr3tfhj5vcsaz';
const bytes = (n: number) => fc.uint8Array({ minLength: n, maxLength: n });
const randomFrom = (seed: Uint8Array) => {
  let at = 0;
  return (n: number) => Uint8Array.from({ length: n }, () => seed[at++ % seed.length]);
};
const anyShard = fc.integer({ min: 0, max: PAIRING_SHARDS - 1 }).map((i) => PAIRING_ALPHABET[Math.floor(i / 30)] + PAIRING_ALPHABET[i % 30]);

describe('H5_pairing_rules: alphabet, length and shard (R1.3)', () => {
  it('H5_pairing_rules: the alphabet has 30 symbols and no look-alikes', () => {
    expect(PAIRING_ALPHABET).toHaveLength(30);
    expect(new Set(PAIRING_ALPHABET).size).toBe(30);
    for (const c of '01ILOU') expect(PAIRING_ALPHABET.includes(c)).toBe(false);
  });

  it('H5_pairing_rules: a generated code is 10 alphabet symbols that start with the shard, for any random source', () => {
    fc.assert(
      fc.property(anyShard, fc.uint8Array({ minLength: 1, maxLength: 64 }), (shard, seed) => {
        // A source of only rejected bytes cannot make a code; the generator then throws instead of making a biased one.
        if (seed.every((b) => b >= 240)) return;
        let code: string;
        try {
          code = generateCode(shard, randomFrom(seed));
        } catch {
          return;
        }
        expect(code).toHaveLength(10);
        expect(isPairingCode(code)).toBe(true);
        expect(shardOfCode(code)).toBe(shard);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H5_pairing_rules: the generator never uses a byte that would bias a symbol', () => {
    // 240 = 8 x 30: bytes 0..239 map evenly, 240..255 are skipped.
    const code = generateCode('23', randomFrom(Uint8Array.from([255, 240, 0, 1, 29, 30, 239, 100, 200, 7, 8, 9, 10, 11, 12, 13])));
    expect(code.slice(2, 4)).toBe(PAIRING_ALPHABET[0] + PAIRING_ALPHABET[1]);
  });

  it('H5_pairing_rules: normalizeCode only upper-cases and strips spaces and hyphens, and never fixes look-alikes', () => {
    expect(normalizeCode('ab2d-5678 jk')).toBe('AB2D5678JK');
    expect(isPairingCode(normalizeCode('o123456789'))).toBe(false);
    expect(isPairingCode('AB2D5678J')).toBe(false);
    expect(isPairingCode('AB2D5678JKM')).toBe(false);
  });

  it('H5_pairing_rules: shardFromHash is one of 900 shards and is stable', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-f]{64}$/), (h) => {
        const s = shardFromHash(h);
        expect(s).toHaveLength(2);
        expect(shardFromHash(h)).toBe(s);
        expect([...s].every((c) => PAIRING_ALPHABET.includes(c))).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(() => shardFromHash('zz')).toThrow();
  });

  it('H5_pairing_rules: a pair id carries the shard and 128 random bits, and nothing else', () => {
    fc.assert(
      fc.property(anyShard, bytes(16), (shard, b) => {
        const id = generatePairId(shard, () => b);
        expect(isPairId(id)).toBe(true);
        expect(shardOfPairId(id)).toBe(shard);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('H5_pairing_rules: attempts rule (R1.2, R1.5)', () => {
  const live: OfferLife = { expiresAtMs: 1_000_000 + OFFER_TTL_MS, attempts: 0 };

  type Step = { at: number; right: boolean };
  const steps = fc.array(fc.record({ at: fc.integer({ min: 0, max: 2 * OFFER_TTL_MS }), right: fc.boolean() }), { maxLength: 30 });

  /** Replays claims in time order against one offer. Each outcome is what the caller sees. */
  function replay(list: Step[]) {
    let offer: OfferLife | undefined = { ...live };
    const outcomes: { step: Step; kind: 'match' | 'fail'; failuresBefore: number }[] = [];
    let failures = 0;
    for (const step of [...list].sort((a, b) => a.at - b.at)) {
      const now = 1_000_000 + step.at;
      const d = decideClaim(offer, now, step.right);
      outcomes.push({ step, kind: d.kind, failuresBefore: failures });
      if (d.kind === 'match') offer = undefined;
      else {
        if (offer) failures += step.right && now < offer.expiresAtMs ? 0 : 1;
        offer = d.next ?? undefined;
      }
    }
    return outcomes;
  }

  it('H5_pairing_rules: at most one claim ever succeeds, and only before expiry', () => {
    fc.assert(
      fc.property(steps, (list) => {
        const out = replay(list);
        expect(out.filter((o) => o.kind === 'match').length).toBeLessThanOrEqual(1);
        for (const o of out) if (o.kind === 'match') expect(o.step.at).toBeLessThan(OFFER_TTL_MS);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H5_pairing_rules: five failed claims burn the offer, so even the right code then fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (extraWrong) => {
        let offer: OfferLife | undefined = { ...live };
        for (let i = 0; i < MAX_FAILED_CLAIMS; i++) {
          const d = decideClaim(offer, 1_000_000, false);
          expect(d.kind).toBe('fail');
          offer = d.kind === 'fail' ? (d.next ?? undefined) : offer;
        }
        expect(offer).toBeUndefined();
        for (let i = 0; i < extraWrong + 1; i++) expect(decideClaim(offer, 1_000_000, true)).toEqual({ kind: 'fail', next: null });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H5_pairing_rules: the right code still works after four failures', () => {
    let offer: OfferLife | undefined = { ...live };
    for (let i = 0; i < MAX_FAILED_CLAIMS - 1; i++) {
      const d = decideClaim(offer, 1_000_000, false);
      offer = d.kind === 'fail' ? (d.next ?? undefined) : offer;
    }
    expect(offer?.attempts).toBe(4);
    expect(decideClaim(offer, 1_000_000, true)).toEqual({ kind: 'match' });
  });

  it('H5_pairing_rules: expired or missing offers fail the same way and are dropped', () => {
    expect(decideClaim(live, live.expiresAtMs, true)).toEqual({ kind: 'fail', next: null });
    expect(decideClaim(live, live.expiresAtMs + 1, true)).toEqual({ kind: 'fail', next: null });
    expect(decideClaim(undefined, 0, true)).toEqual({ kind: 'fail', next: null });
    expect(decideClaim(live, live.expiresAtMs - 1, true)).toEqual({ kind: 'match' });
  });
});

describe('H5_pairing_rules: request shapes', () => {
  const claim = { installId: INSTALL, code: 'ab2d-5678jk', fcmToken: 'tok', quietStartMin: 1320, quietEndMin: 360, tzOffsetMin: 60 };

  it('parses a claim, normalizing the code, with exact keys', () => {
    const r = parseClaimRequest(claim);
    expect(r).toEqual({ ok: true, value: { ...claim, code: 'AB2D5678JK' } satisfies ClaimRequest });
    expect(parseClaimRequest({ ...claim, stationName: 'Home' })).toMatchObject({ ok: true, value: { stationName: 'Home' } });
    for (const bad of [
      { ...claim, extra: 1 },
      { ...claim, code: 'OOOOOOOOOO' },
      { ...claim, code: 'AB2D5678J' },
      { ...claim, fcmToken: '' },
      { ...claim, quietStartMin: 1440 },
      { ...claim, tzOffsetMin: 841 },
      { ...claim, stationName: '' },
      { ...claim, stationName: 'x'.repeat(41) },
      { ...claim, installId: 'short' },
      null,
      [],
    ])
      expect(parseClaimRequest(bad).ok).toBe(false);
  });

  it('parses offer, remove and delete-with-pairs envelopes', () => {
    const pairId = generatePairId('AB', () => new Uint8Array(16));
    expect(parseOfferRequest({ installId: INSTALL }).ok).toBe(true);
    expect(parseOfferRequest({ installId: INSTALL, x: 1 }).ok).toBe(false);
    expect(parseRemovePairRequest({ installId: INSTALL, pairId }).ok).toBe(true);
    expect(parseRemovePairRequest({ installId: INSTALL, pairId: 'nope' }).ok).toBe(false);
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], pairIds: [pairId] }, 10)).toEqual({ ok: true, installId: INSTALL, cells: [], pairIds: [pairId] });
    expect(parseDeleteRequest({ installId: INSTALL, cells: [] }, 10)).toMatchObject({ ok: true, pairIds: [] });
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], pairIds: ['x'] }, 10).ok).toBe(false);
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], pairIds: new Array(26).fill(pairId) }, 10).ok).toBe(false);
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], other: [] }, 10).ok).toBe(false);
  });
});
