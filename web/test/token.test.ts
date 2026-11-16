import fc from 'fast-check';
import { INSTALL_ID_PATTERN } from '@outage/shared';
import { describe, expect, it } from 'vitest';
import { hashInstallId, mintInstallId, mintToken, verifyToken } from '../api/ingest/token.ts';
import { NUM_RUNS } from './runs.ts';

const ID = 'kg4yq7mxwb2ndpr3tfhj5vcsaz';
const SECRET = 'test-secret';

describe('R2 install token', () => {
  it('R2.2 a minted token verifies, and is 43 base64url characters', async () => {
    const token = await mintToken(SECRET, ID);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await verifyToken(SECRET, ID, token)).toBe(true);
    expect(await mintToken(SECRET, ID)).toBe(token); // deterministic: nothing stored at registration
  });

  it('R2.3 wrong secret, wrong install id, empty or malformed token are rejected', async () => {
    const token = await mintToken(SECRET, ID);
    expect(await verifyToken('other-secret', ID, token)).toBe(false);
    expect(await verifyToken(SECRET, 'aaaaaaaaaaaaaaaaaaaaaaaaaa', token)).toBe(false);
    for (const bad of ['', 'x', `${token}A`, token.slice(1), `${token.slice(0, 42)}=`, token.replace(/./, '+')]) {
      expect(await verifyToken(SECRET, ID, bad)).toBe(false);
    }
  });

  it('R2.3 any single-character tamper of the token is rejected', async () => {
    const token = await mintToken(SECRET, ID);
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 42 }), fc.nat({ max: 63 }), async (pos, pick) => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        const ch = alphabet[pick];
        fc.pre(ch !== token[pos]);
        const tampered = token.slice(0, pos) + ch + token.slice(pos + 1);
        expect(await verifyToken(SECRET, ID, tampered)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('R2.2 tokens differ per install id and per secret', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 16, maxLength: 16 }), fc.uint8Array({ minLength: 16, maxLength: 16 }), async (a, b) => {
        const ia = mintInstallId(a);
        const ib = mintInstallId(b);
        fc.pre(ia !== ib);
        expect(await mintToken(SECRET, ia)).not.toBe(await mintToken(SECRET, ib));
        expect(await mintToken('a-secret', ia)).not.toBe(await mintToken('b-secret', ia));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('R2.6 a missing secret throws instead of signing with an empty key', async () => {
    await expect(mintToken('', ID)).rejects.toThrow(/INSTALL_TOKEN_SECRET/);
  });

  it('R2.2 mintInstallId gives 26 base32 characters, injective on its input, and matches the shared pattern', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), fc.uint8Array({ minLength: 16, maxLength: 16 }), (a, b) => {
        const ia = mintInstallId(a);
        expect(ia).toMatch(INSTALL_ID_PATTERN);
        expect(ia === mintInstallId(b)).toBe(a.every((v, i) => v === b[i]));
      }),
      { numRuns: NUM_RUNS },
    );
    expect(() => mintInstallId(new Uint8Array(15))).toThrow();
    expect(mintInstallId(new Uint8Array(16))).toBe('a'.repeat(26));
  });

  it('R12.2 hashInstallId is a 64-char hex digest and never the id itself', async () => {
    const h = await hashInstallId(ID);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(ID);
  });
});
