import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDay, EMPTY_FAILURES, fetchFailedNote } from '../src/index.ts';
import { checkReport } from '../../../.kiro/skills/field-report/scripts/check-report.mjs';
import { dumpArb } from './arbs.ts';
import { emptyDump, richDump } from './build.ts';
import empty from './golden/empty.md?raw';
import rich from './golden/rich.md?raw';
import { NUM_RUNS } from './runs.ts';

const fresh = () => JSON.parse(JSON.stringify(EMPTY_FAILURES));
const build = (json: unknown) => {
  const r = buildDay({ json, failures: fresh(), existingDirs: [] });
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe('golden Markdown files (R6.2)', () => {
  it('a day with every failure matches test/golden/rich.md (regenerate: npm run golden -w tools/field)', () => {
    expect(build(richDump()).markdown).toBe(rich);
  });
  it('a day with no devices matches test/golden/empty.md and says the gate is not measurable', () => {
    const md = build(emptyDump()).markdown;
    expect(md).toBe(empty);
    expect(md).toContain('Gate status (milestone 1): not measurable yet');
  });
  it('the golden files pass the skill checker', () => {
    expect(checkReport(rich)).toEqual([]);
    expect(checkReport(empty)).toEqual([]);
  });
});

describe('F5_report_pure_and_clean', () => {
  it('R6.3 R6.4 any valid input gives the same Markdown twice, and the skill checker finds nothing in it', () => {
    fc.assert(
      fc.property(dumpArb, (dump) => {
        const a = build(dump).markdown;
        expect(build(JSON.parse(JSON.stringify(dump))).markdown).toBe(a);
        expect(checkReport(a)).toEqual([]);
        expect(a).not.toMatch(/[a-z2-7]{26,}/); // install ID shape, also inside gap reasons that look like one
        expect(a).not.toMatch(/\b8[0-9a-f]{14}\b/); // cell shape
        expect(a).not.toMatch(/[0-9a-f]{32,}/i);
        expect(a).not.toMatch(/installId|install_id/i);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('R1.6 devices appear only as D1, D2, ... and the report holds no alias map', () => {
    const md = build(richDump()).markdown;
    const rows = md
      .split('## Devices')[1]
      .split('##')[0]
      .split('\n')
      .filter((l) => /^\| D/.test(l));
    expect(rows.map((r) => r.split('|')[1].trim())).toEqual(['D1', 'D2', 'D3']);
    expect(md).not.toMatch(/D\d+\s*(=|->|maps to)/);
  });

  it('R6.3 a gap reason that looks like an identifier is counted as OTHER, never printed', () => {
    const dump = richDump();
    dump.devices[0].gaps = [{ reason: 'kg4yq7mxwb2ndpr3tfhj5vcsaz', count: 2, lenHistMs: [2, 0, 0, 0, 0, 0] }];
    const md = build(dump).markdown;
    expect(md).not.toContain('kg4yq7');
    expect(md).toContain('OTHER 2');
    expect(checkReport(md)).toEqual([]);
  });

  it('R4.3 a p95 is hidden below 20 samples and shown from 20', () => {
    const dump = emptyDump();
    const row = (n: number) => {
      dump.devices = [
        {
          ...richDump().devices[0],
          delayJobMs: Array.from({ length: n }, (_, i) => (i + 1) * 1000),
          delayReceiverMs: [],
        },
      ];
      return (
        build(dump)
          .markdown.split('\n')
          .find((l) => l.startsWith('| tecno')) ?? ''
      );
    };
    expect(row(19)).toContain('not enough data (n=19)');
    expect(row(20)).toContain('10.0 / 19.0'); // p50 = 10th of 20, p95 = 19th of 20, nearest rank
  });

  it('R4.5 station mode is its own class with its own ratio', () => {
    const md = build(richDump()).markdown;
    expect(md).toMatch(/\| infinix, Android 12, station \| 1 \| 0\.28 \|/);
  });

  it('R7.4 the fetch-failure note is one line, with no value from the environment', () => {
    expect(fetchFailedNote('HTTP 401')).toBe('Data not fetched: HTTP 401\n');
    expect(fetchFailedNote('Bearer abc/def?x=1\n## Heading')).not.toMatch(/[/?=\n#]./);
    expect(fetchFailedNote('')).toBe('Data not fetched: unknown\n');
  });
});

describe('R9.1 fixture candidates', () => {
  it('lists Confirmed, not withdrawn outages with at least 2 devices, with day and device count', () => {
    const dump = richDump();
    dump.outages = [
      { ...dump.outages[0], drops: 1 },
      { ...dump.outages[0], key: 'cccccccccccccccc', drops: 2, startMs: dump.outages[0].startMs + 1000 },
      { ...dump.outages[0], key: 'dddddddddddddddd', drops: 5, withdrawn: true },
      { ...dump.outages[0], key: 'eeeeeeeeeeeeeeee', drops: 5, level: 'POSSIBLE' },
    ];
    const section = build(dump).markdown.split('## Fixture candidates')[1].split('## ')[0];
    const lines = section.split('\n').filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^- 2026-11-14, 2 devices, started /);
    expect(lines[0]).toContain("owner's approval");
  });
});
