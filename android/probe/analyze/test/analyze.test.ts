import { describe, expect, it } from 'vitest';
import { analyzeDevice } from '../src/analyze.ts';
import { gate } from '../src/gate.ts';
import { plugLag, plugToStart, unplugToStop } from '../src/pairing.ts';
import { parseExport, parseRow, timeOrder } from '../src/parse.ts';
import { deviceMarkdown, summaryMarkdown } from '../src/report.ts';
import { nearestRank } from '../src/stats.ts';
import { ratio, segments, steps, totals } from '../src/timeline.ts';
import { H, log, note, plugIn, plugOut, start, stop } from './helpers.ts';

import sampleJson from '../../contract/sample-export.json' with { type: 'json' };

const sample = JSON.parse(JSON.stringify(sampleJson));

describe('contract', () => {
  it('reads the shared sample export (android/probe/contract) and gets the hand-computed numbers', () => {
    const { data, problems } = parseExport(sample);
    expect(problems).toEqual([]);
    const d = analyzeDevice(data.devices[0]);
    expect(d.overall.totals.chargingMs).toBe(890_000);
    expect(d.overall.totals.armedChargingMs).toBe(845_000);
    expect(d.m2.pairs.map((p) => p.delayMs)).toEqual([15_000]);
    expect(d.m2.unpaired).toEqual([6]);
    expect(d.m6.pairs.map((p) => p.delayMs)).toEqual([2_000]);
    expect(d.plugLag).toEqual({ checked: 1, differ: 0 });
    expect(d.stopReasons).toEqual({ TIMEOUT: 1, CONSTRAINT_CHARGING: 1 });
    expect(d.m5Gaps.p50).toBe(30_000);
    expect(d.m13.WIFI.p50).toBe(420);
    expect(d.m14).toEqual({ checked: 2, mismatch: 0 });
  });

  it('rejects malformed rows with a reason and drops duplicate ids from retried uploads', () => {
    expect(parseRow({ id: 1, kind: 'NOPE', monoMs: 0, wallMs: 0, bootCount: 1, fields: {} })).toMatch(/unknown kind/);
    expect(parseRow({ id: -1, kind: 'NOTE', monoMs: 0, wallMs: 0, bootCount: 1, fields: {} })).toMatch(/id/);
    expect(parseRow({ id: 1, kind: 'NOTE', monoMs: 0, wallMs: 0, bootCount: 1, fields: { x: { nested: 1 } } })).toMatch(/field x/);
    const dup = JSON.parse(JSON.stringify(sample));
    dup.devices[0].rows.push(dup.devices[0].rows[0], { id: 99, kind: 'BAD' });
    const { data, problems } = parseExport(dup);
    expect(data.devices[0].rows.length).toBe(sample.devices[0].rows.length);
    expect(problems).toEqual(['tecno-a: unknown kind BAD']);
    expect(() => parseExport({ version: 2, devices: [] })).toThrow(/version 1/);
  });
});

describe('PR1 analyze_armed_ratio', () => {
  it('PR1 known intervals give the exact armed ratio, per condition and for the exemption', () => {
    const d = analyzeDevice(log('pix', 'Google', [
      note(0, 'cond: baseline'), plugIn(1_000), start(11_000), stop(611_000, 'TIMEOUT', true), start(641_000), plugOut(1_001_000),
      stop(1_003_000, 'CONSTRAINT_CHARGING', false), note(1_100_000, 'cond: after-exemption'), plugIn(1_200_000), start(1_210_000, true), plugOut(2_210_000),
      stop(2_211_000, 'CONSTRAINT_CHARGING', false, true),
    ]));
    // baseline: charging 1_000..1_001_000 = 1_000_000; armed 600_000 + 360_000 = 960_000
    const base = d.byCond.find((c) => c.cond === 'baseline');
    expect(base?.totals).toEqual({ chargingMs: 1_000_000, armedChargingMs: 960_000, armedMs: 962_000 });
    expect(base?.armedRatio).toBeCloseTo(0.96, 12);
    const after = d.byCond.find((c) => c.cond === 'after-exemption');
    expect(after?.totals.chargingMs).toBe(1_010_000);
    expect(after?.armedRatio).toBeCloseTo(1_000_000 / 1_010_000, 12);
    expect(d.exempt.totals.armedChargingMs).toBe(1_000_000);
  });

  it('PR1 no charging gives no ratio rather than 0 or 100%', () => {
    expect(ratio(totals(steps(log('a', 'x', [note(0, 'hi'), note(5_000, 'there')]).rows)))).toBeNull();
  });
});

describe('PR2 analyze_nearest_rank', () => {
  it('PR2 percentiles equal the nearest-rank reference', () => {
    const v = [15, 20, 35, 40, 50];
    expect(nearestRank(v, 30)).toBe(20); // ceil(1.5) = 2
    expect(nearestRank(v, 40)).toBe(20); // ceil(2.0) = 2
    expect(nearestRank(v, 50)).toBe(35);
    expect(nearestRank(v, 100)).toBe(50);
    expect(nearestRank([3, 1, 2], 95)).toBe(3);
    const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);
    expect(nearestRank(twenty, 95)).toBe(19_000); // ceil(19) = 19th value
    expect(nearestRank([], 50)).toBeNull();
    expect(() => nearestRank(v, 0)).toThrow(RangeError);
  });
});

describe('PR3 analyze_segments', () => {
  it('PR3 reboots and restarts split segments, and the gap before a restart counts as not armed', () => {
    const rows = log('t', 'TECNO', [
      ['SESSION', 0, { kind: 'start' }], plugIn(1_000), start(2_000),
      ['SESSION', 3_602_000, { kind: 'restart' }], start(3_612_000),
      ['SESSION', 50, { kind: 'restart' }, 2], plugIn(60, 2), start(1_060, false, 2), plugOut(2_060, 2),
    ]).rows;
    const segs = segments(rows);
    expect(segs.map((s) => s.endedBy)).toEqual(['restart', 'reboot', 'end']);
    expect(segs.map((s) => s.bootCount)).toEqual([1, 1, 2]);
    const t = totals(steps(rows));
    // boot 1: charging 1_000..3_612_000 (rows end), armed 2_000..3_602_000 is cut: the step ending at the restart is not armed
    // boot 2: charging 60..2_060 = 2_000, armed 1_060..2_060 = 1_000; the reboot gap is not counted at all
    expect(t.chargingMs).toBe(3_602_000 - 1_000 + 10_000 + 2_000);
    expect(t.armedChargingMs).toBe(0 + 1_000);
  });
});

describe('PR4 analyze_pairing', () => {
  it('PR4 each start pairs with the right plug-in within the limit; misses and extra starts are reported, not guessed', () => {
    const rows = log('p', 'x', [
      plugIn(0), start(30_000), stop(630_000, 'TIMEOUT', true), start(660_000), plugOut(700_000), stop(702_000, 'CONSTRAINT_CHARGING', false),
      plugIn(800_000), plugOut(820_000), // no start: missed
      plugIn(900_000), start(900_000 + 11 * 60_000), // beyond the 10 min limit: missed, and the start is unpaired
    ]).rows;
    const m2 = plugToStart(rows);
    expect(m2.pairs.map((p) => [p.fromId, p.toId, p.delayMs])).toEqual([[1, 2, 30_000]]);
    expect(m2.missed).toEqual([7, 9]);
    expect(m2.unpaired).toEqual([4, 10]);
    const m6 = unplugToStop(rows);
    expect(m6.pairs.map((p) => p.delayMs)).toEqual([2_000]);
    expect(m6.missed).toEqual([8]);
  });

  it('PR4 a reference row written after the job row (later id, earlier time) still pairs, after time ordering', () => {
    // emulator run 2026-11-14: unplug broadcast at 988.0 s, JOB_STOP row id 2 at 988.4 s, PLUG row id 3 written 1 s later with 988.0 s
    const raw = log('e', 'x', [plugIn(0), stop(988_400, 'CONSTRAINT_CHARGING', false), plugOut(988_000), ['JOB_START', 1_002_300, { charging: true }], plugIn(1_002_000)]).rows;
    const rows = timeOrder(raw);
    expect(rows.map((r) => r.id)).toEqual([1, 3, 2, 5, 4]);
    expect(unplugToStop(rows).pairs.map((p) => p.delayMs)).toEqual([400]);
    expect(plugToStart(rows).pairs.map((p) => p.delayMs)).toEqual([300]);
    // the job reacting before the broadcast reaches the app (emulator: 0.44 s) pairs with a negative delay
    const early = timeOrder(log('f', 'x', [plugIn(0), ['JOB_START', 30_000, { charging: true }], stop(987_642, 'CONSTRAINT_CHARGING', false), plugOut(988_087)]).rows);
    expect(unplugToStop(early).pairs.map((p) => p.delayMs)).toEqual([-445]);
    // but never more than 10 s early, and never across an earlier plug event
    const tooEarly = timeOrder(log('g', 'x', [plugIn(0), stop(10_000, 'CONSTRAINT_CHARGING', false), plugOut(25_000)]).rows);
    expect(unplugToStop(tooEarly).pairs).toEqual([]);
    // boots stay in id order even when the clock restarts
    const boots = timeOrder(log('b', 'x', [note(5_000, 'a'), ['NOTE', 100, { text: 'b' }, 2], ['NOTE', 50, { text: 'c' }, 2]]).rows);
    expect(boots.map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it('PR4 a stop and its 1 s re-read that disagree count as plug lag', () => {
    const rows = log('l', 'x', [stop(0, 'CONSTRAINT_CHARGING', true), ['BATTERY', 1_000, { source: 'JOB_RECHECK', plug: 'NONE', recheckOf: 1 }]]).rows;
    expect(plugLag(rows)).toEqual({ checked: 1, differ: 1 });
  });
});

describe('PR5 analyze_gate', () => {
  const longRun = (alias: string, maker: string, armedEveryHour: number, exempt: boolean, replugs = 20, delayMs = 20_000) => {
    const items: Parameters<typeof log>[2] = [note(0, `cond: run-${alias}`), plugIn(1_000)];
    let t = 1_000;
    for (let i = 0; i < 12; i++) { items.push(start(t, exempt), stop(t + armedEveryHour, 'TIMEOUT', true, exempt)); t += H; }
    items.push(plugOut(t), stop(t + 500, 'CONSTRAINT_CHARGING', false, exempt));
    for (let i = 0; i < replugs; i++) { const b = t + 10_000 + i * 120_000; items.push(plugIn(b), start(b + delayMs, exempt), plugOut(b + 60_000), stop(b + 61_000, 'CONSTRAINT_CHARGING', false, exempt)); }
    return analyzeDevice(log(alias, maker, items));
  };

  it('PR5 pass: a Tecno phone armed 95% for 12 h with the exemption and 20 fast replugs', () => {
    const g = gate([longRun('tecno-a', 'TECNO', 0.95 * H, true)]);
    expect([g.armed.verdict, g.delay.verdict, g.oem.verdict, g.kill.triggered, g.overall]).toEqual(['pass', 'pass', 'pass', false, 'PASS']);
  });

  it('PR5 fail: armed 85%, slow replugs; the kill criterion is separate and triggers below 50% on every phone', () => {
    const g = gate([longRun('pix', 'Google', 0.85 * H, false, 20, 90_000)]);
    expect([g.armed.verdict, g.delay.verdict, g.oem.verdict, g.overall]).toEqual(['fail', 'fail', 'not measured', 'FAIL']);
    expect(g.kill.triggered).toBe(false);
    const k = gate([longRun('a', 'Samsung', 0.4 * H, false), longRun('b', 'Infinix', 0.45 * H, true)]);
    expect(k.kill.triggered).toBe(true);
    expect(k.oem.verdict).toBe('fail');
  });

  it('PR5 amended gate: a Samsung counts for the maker check, and 12 h of charging can come from several days', () => {
    const items: Parameters<typeof log>[2] = [note(0, 'cond: daily-life')];
    // three days, 4 h of charging each, in separate boots; armed 95% of each hour
    for (let day = 0; day < 3; day++) {
      const b = day + 1;
      items.push(['SESSION', 0, { kind: 'restart' }, b], plugIn(1_000, b));
      let t = 1_000;
      for (let i = 0; i < 4; i++) { items.push(['JOB_START', t, { charging: true, exempt: true }, b], ['JOB_STOP', t + 0.95 * H, { charging: true, stopReasonName: 'TIMEOUT', exempt: true }, b]); t += H; }
      items.push(plugOut(t, b));
    }
    const d = analyzeDevice(log('sam', 'samsung', items));
    expect(d.byCond[0].totals.chargingMs).toBe(12 * H);
    const g = gate([d]);
    expect([g.armed.verdict, g.oem.verdict]).toEqual(['pass', 'pass']);
    expect(summaryMarkdown([d], g, [])).toContain('| Tecno or Infinix tested | no (open risk, ADR 0013) |');
  });

  it('PR5 not enough data: under 12 h of charging and under 20 replugs is "not measured", never pass', () => {
    const d = analyzeDevice(log('s', 'TECNO', [plugIn(0), start(10_000, true), plugOut(H), stop(H + 1_000, 'CONSTRAINT_CHARGING', false, true)]));
    const g = gate([d]);
    expect([g.armed.verdict, g.delay.verdict, g.oem.verdict, g.overall]).toEqual(['not measured', 'not measured', 'not measured', 'INCOMPLETE']);
    expect(g.kill.triggered).toBe(false);
    expect(gate([]).overall).toBe('INCOMPLETE');
  });

  it('PR5 reports: the device file and the summary state the verdicts and carry no install id or coordinates', () => {
    const d = longRun('tecno-a', 'TECNO', 0.95 * H, true);
    const md = deviceMarkdown(d) + summaryMarkdown([d], gate([d]), []);
    expect(md).toContain('Gate: **PASS**');
    expect(md).toMatch(/\| run-tecno-a \| 12\.\d\d \| 11\.\d\d \| 9\d\.\d% \|/);
    expect(md).not.toMatch(/-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/);
  });
});
