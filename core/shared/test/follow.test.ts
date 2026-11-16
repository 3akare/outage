import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseFollowRequest, parseUnfollowRequest } from '../src/index.ts';

const base = () => ({
  installId: 'kg4yq7mxwb2ndpr3tfhj5vcsaz',
  cell: '88589c986bfffff',
  fcmToken: 'a'.repeat(40),
  kinds: ['RESTORED', 'CONFIRMED'],
  quietStartMin: 1320,
  quietEndMin: 360,
  tzOffsetMin: 60,
});

describe('R6.2 R7.3 R10.1 follow request schema', () => {
  it('accepts a valid request, orders kinds, and accepts no window', () => {
    const r = parseFollowRequest(base());
    expect(r.ok && r.value.kinds).toEqual(['CONFIRMED', 'RESTORED']);
    expect(parseFollowRequest({ ...base(), quietStartMin: null, quietEndMin: null }).ok).toBe(true);
  });
  it('rejects every extra, missing or out-of-range field', () => {
    for (const bad of [
      { ...base(), x: 1 },
      { ...base(), quietStartMin: -1 },
      { ...base(), quietStartMin: 360.5 },
      { ...base(), quietEndMin: null },
      { ...base(), kinds: [] },
      { ...base(), cell: '8a2a1072b59ffff' },
      { ...base(), fcmToken: 'a'.repeat(4097) },
      { ...base(), tzOffsetMin: -841 },
    ]) {
      expect(parseFollowRequest(bad).ok).toBe(false);
    }
    const { tzOffsetMin: _drop, ...missing } = base();
    expect(parseFollowRequest(missing).ok).toBe(false);
  });
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.anything(), (v) => {
        expect(typeof parseFollowRequest(v).ok).toBe('boolean');
        expect(typeof parseUnfollowRequest(v).ok).toBe('boolean');
      }),
    );
  });
  it('unfollow takes exactly installId and cell', () => {
    const { installId, cell } = base();
    expect(parseUnfollowRequest({ installId, cell }).ok).toBe(true);
    expect(parseUnfollowRequest({ installId, cell, extra: 1 }).ok).toBe(false);
  });
});
