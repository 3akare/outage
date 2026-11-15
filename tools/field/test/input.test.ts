import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseFieldDump } from '../src/index.ts';
import { dumpArb } from './arbs.ts';
import { device, emptyDump, outage, richDump } from './build.ts';
import { NUM_RUNS } from './runs.ts';

describe('R6.4 the generator reads only a strict field dump', () => {
  it('accepts the dumps the Worker builds', () => {
    expect(parseFieldDump(richDump()).ok).toBe(true);
    expect(parseFieldDump(emptyDump()).ok).toBe(true);
    fc.assert(
      fc.property(dumpArb, (d) => {
        expect(parseFieldDump(d).ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects anything outside the schema, at any level', () => {
    const rich = richDump();
    const bad: unknown[] = [
      null,
      [],
      { ...rich, extra: 1 },
      { ...rich, v: 2 },
      { ...rich, day: '2026-13-01' },
      { ...rich, devices: [{ ...device('D1'), installId: 'kg4yq7mxwb2ndpr3tfhj5vcsaz' }] },
      { ...rich, devices: [{ ...device('D1'), model: 'TECNO KJ5' }] },
      { ...rich, devices: [{ ...device('D1'), alias: 'kg4yq7mxwb2ndpr3tfhj5vcsaz' }] },
      { ...rich, devices: [device('D1'), device('D1')] },
      { ...rich, devices: [{ ...device('D1'), maker: 'nokia' }] },
      {
        ...rich,
        silent: [{ alias: 'D1', maker: 'tecno', androidMajor: 13, lastDay: '2026-11-10' }],
        devices: [device('D1')],
      },
      { ...rich, outages: [{ ...outage(), cell: '88589c986bfffff' }] },
      { ...rich, outages: [{ ...outage(), key: 'kg4yq7mxwb2ndpr3tfhj5vcsaz' }] },
      { ...rich, misses: [{ kind: 'MISS', atMs: 1, armedN: 2, installId: 'x' }] },
    ];
    for (const b of bad) expect(parseFieldDump(b).ok, JSON.stringify(b).slice(0, 80)).toBe(false);
  });
});
