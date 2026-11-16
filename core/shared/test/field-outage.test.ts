import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type OutageClass, classifyOutage, countLabels } from '../src/index.ts';
import { NUM_RUNS } from './runs.ts';

describe('F4_outage_classes', () => {
  // The table from design section 5, for a Confirmed outage: yes>=1 -> true; no>=1, yes=0, none=0 -> false alarm; else inconclusive.
  it('F4 matches the table for every combination of label counts 0..3', () => {
    for (let yes = 0; yes <= 3; yes++)
      for (let no = 0; no <= 3; no++)
        for (let none = 0; none <= 3; none++) {
          const want: OutageClass =
            yes >= 1 ? 'CONFIRMED_TRUE' : no >= 1 && none === 0 ? 'FALSE_ALARM' : 'INCONCLUSIVE';
          expect(
            classifyOutage({ level: 'CONFIRMED', labelsYes: yes, labelsNo: no, labelsNone: none }),
            `${yes}/${no}/${none}`,
          ).toBe(want);
        }
  });

  it('F4 a Possible outage is never classified, whatever the labels', () => {
    fc.assert(
      fc.property(fc.nat({ max: 50 }), fc.nat({ max: 50 }), fc.nat({ max: 50 }), (labelsYes, labelsNo, labelsNone) => {
        expect(classifyOutage({ level: 'POSSIBLE', labelsYes, labelsNo, labelsNone })).toBe('NOT_CLASSIFIED');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('F4 a false alarm needs a label: no labels at all is inconclusive; one Yes always beats any number of No', () => {
    expect(classifyOutage({ level: 'CONFIRMED', labelsYes: 0, labelsNo: 0, labelsNone: 0 })).toBe('INCONCLUSIVE');
    expect(classifyOutage({ level: 'CONFIRMED', labelsYes: 1, labelsNo: 40, labelsNone: 40 })).toBe('CONFIRMED_TRUE');
  });

  const drops = fc.uniqueArray(
    fc.record({ installId: fc.constantFrom('a', 'b', 'c', 'd'), seq: fc.integer({ min: 1, max: 4 }) }),
    {
      selector: (d) => `${d.installId}|${d.seq}`,
      maxLength: 12,
    },
  );
  const labels = fc.array(
    fc.record({
      installId: fc.constantFrom('a', 'b', 'c', 'd', 'z'),
      unplugSeq: fc.integer({ min: 1, max: 5 }),
      answer: fc.constantFrom('YES' as const, 'NO' as const),
    }),
    { maxLength: 12 },
  );

  it('F4 label counts partition the eligible drops: yes + no + none equals the number of distinct drops', () => {
    fc.assert(
      fc.property(drops, labels, (d, l) => {
        const c = countLabels(d, l);
        expect(c.yes + c.no + c.none).toBe(d.length);
        expect(Math.min(c.yes, c.no, c.none)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('F4 No wins over Yes for a drop (as in the engine), in any order, and labels for other drops are not counted', () => {
    const d = [
      { installId: 'a', seq: 2 },
      { installId: 'b', seq: 2 },
      { installId: 'a', seq: 2 },
    ];
    const l = [
      { installId: 'a', unplugSeq: 2, answer: 'YES' as const },
      { installId: 'a', unplugSeq: 2, answer: 'NO' as const },
      { installId: 'q', unplugSeq: 2, answer: 'YES' as const },
      { installId: 'b', unplugSeq: 9, answer: 'YES' as const },
    ];
    expect(countLabels(d, l)).toEqual({ yes: 0, no: 1, none: 1 });
    expect(countLabels(d, [l[1], l[0]])).toEqual({ yes: 0, no: 1, none: 1 });
    expect(countLabels(d, [l[0]])).toEqual({ yes: 1, no: 0, none: 1 });
  });
});
