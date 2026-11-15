import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDay, EMPTY_FAILURES, type FailuresIndex, parseFailures } from '../src/index.ts';
import { dumpArb } from './arbs.ts';
import { DAY, device, emptyDump, richDump } from './build.ts';
import { NUM_RUNS } from './runs.ts';

const fresh = (): FailuresIndex => JSON.parse(JSON.stringify(EMPTY_FAILURES));
const day = (json: unknown, failures: FailuresIndex, existingDirs: string[] = []) => {
  const r = buildDay({ json, failures, existingDirs });
  if (!r.ok) throw new Error(r.reason);
  return r;
};
const specDirs = (files: Record<string, string>) => [
  ...new Set(Object.keys(files).map((f) => f.split('/').slice(0, 3).join('/'))),
];
const withDate = (d: ReturnType<typeof richDump>, date: string) => ({
  ...d,
  day: date,
  devices: d.devices.map((x) => ({ ...x, day: date })),
});

describe('F6_signature_dedup', () => {
  it('R8.4 a new signature creates exactly one spec (three files) and one entry that links it', () => {
    const r = day(richDump(), fresh());
    expect(r.summary.signatures).toBe(9);
    expect(specDirs(r.specFiles)).toHaveLength(9);
    expect(Object.keys(r.specFiles)).toHaveLength(27);
    const sig = 'ARMED_LOW:tecno:13:normal';
    expect(r.failures.failures[sig]).toEqual({
      firstSeen: DAY,
      lastSeen: DAY,
      count: 1,
      spec: '.kiro/specs/bugfix-20261114-armed-low-tecno-13-normal',
    });
    expect(r.specFiles['.kiro/specs/bugfix-20261114-armed-low-tecno-13-normal/bugfix.md']).toContain(
      'Current Behavior',
    );
    expect(r.markdown).toContain('`.kiro/specs/bugfix-20261114-armed-low-tecno-13-normal`');
  });

  it('R8.5 a known signature on a later day opens no second spec and only updates its count and last-seen date', () => {
    const first = day(richDump(), fresh());
    const next = day(
      withDate(richDump(), '2026-11-15'),
      first.failures,
      specDirs(first.specFiles).map((d) => d.split('/')[2]),
    );
    expect(next.specFiles).toEqual({});
    expect(next.summary.newSpecs).toEqual([]);
    expect(next.summary.seenAgain).toHaveLength(9);
    expect(next.failures.failures['MISS:other:unknown:normal']).toMatchObject({
      firstSeen: DAY,
      lastSeen: '2026-11-15',
      count: 2,
    });
    expect(next.markdown).toContain('## New failures\n- None.');
    expect(next.markdown).toContain('Known signatures seen again: `ALARM_MISSED:infinix:12:station` (2)');
  });

  it('design 8: running the same day twice gives the same report, no new spec, and no count change', () => {
    const first = day(richDump(), fresh());
    const second = day(
      richDump(),
      first.failures,
      specDirs(first.specFiles).map((d) => d.split('/')[2]),
    );
    expect(second.markdown).toBe(first.markdown);
    expect(second.specFiles).toEqual({});
    expect(second.failures).toEqual(first.failures);
  });

  it('R8.4 a new signature next to a known one creates one spec for the new one only', () => {
    const first = day({ ...emptyDump(), devices: [device('D1', { armedMs: 20_000_000 })] }, fresh());
    expect(Object.keys(first.failures.failures)).toEqual(['ARMED_LOW:tecno:13:normal']);
    const next = day(
      withDate({ ...emptyDump(), devices: [device('D1', { armedMs: 20_000_000, writeFailures: 1 })] }, '2026-11-15'),
      first.failures,
      ['bugfix-20261114-armed-low-tecno-13-normal'],
    );
    expect(specDirs(next.specFiles)).toEqual(['.kiro/specs/bugfix-20261115-write-fail-tecno-13-normal']);
    expect(Object.keys(next.failures.failures).sort()).toEqual([
      'ARMED_LOW:tecno:13:normal',
      'WRITE_FAIL:tecno:13:normal',
    ]);
  });

  it('for any days in sequence: one spec per distinct signature, ever, and the count is the number of days seen', () => {
    fc.assert(
      fc.property(fc.array(dumpArb, { minLength: 1, maxLength: 4 }), (dumps) => {
        let failures = fresh();
        const dirs: string[] = [];
        const created: string[] = [];
        dumps.forEach((raw, i) => {
          const date = `2026-11-${String(10 + i).padStart(2, '0')}`;
          const r = day(withDate(raw, date), failures, dirs);
          for (const d of specDirs(r.specFiles)) {
            created.push(d);
            dirs.push(d.split('/')[2]);
          }
          failures = r.failures;
        });
        expect(new Set(created).size).toBe(created.length);
        expect(created).toHaveLength(Object.keys(failures.failures).length);
        for (const [sig, e] of Object.entries(failures.failures)) {
          expect(e.count).toBeGreaterThanOrEqual(1);
          expect(e.count).toBeLessThanOrEqual(dumps.length);
          expect(created).toContain(e.spec);
          expect(sig).toMatch(/^[A-Z_]+:[a-z]+:(\d+|unknown):(normal|station)$/);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('R8.6 the run writes documents only: every file is under .kiro/specs/bugfix-*', () => {
    for (const f of Object.keys(day(richDump(), fresh()).specFiles))
      expect(f).toMatch(/^\.kiro\/specs\/bugfix-\d{8}-[a-z0-9-]+\/(bugfix|design|tasks)\.md$/);
  });

  it('a spec folder that exists while its signature is unknown stops the run, so nothing is overwritten', () => {
    const r = buildDay({
      json: richDump(),
      failures: fresh(),
      existingDirs: ['bugfix-20261114-armed-low-tecno-13-normal'],
    });
    expect(r.ok).toBe(false);
  });
});

describe('design 8: failures.json that cannot be read', () => {
  it('missing file is an empty index; bad JSON, wrong version or a bad entry is refused', () => {
    expect(parseFailures(undefined)).toEqual({ ok: true, value: EMPTY_FAILURES });
    expect(parseFailures('{').ok).toBe(false);
    expect(parseFailures('{"version":2,"failures":{}}').ok).toBe(false);
    expect(parseFailures('{"version":1,"failures":{"A:b:1:normal":{"count":0}}}').ok).toBe(false);
    const good =
      '{"version":1,"failures":{"MISS:other:unknown:normal":{"firstSeen":"2026-11-14","lastSeen":"2026-11-14","count":1,"spec":".kiro/specs/bugfix-20261114-miss-other-unknown-normal"}}}';
    expect(parseFailures(good).ok).toBe(true);
  });
});
