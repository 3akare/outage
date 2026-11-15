import type { FieldDump } from '@outage/shared';
import { describe, expect, it } from 'vitest';
import { deriveSignatures } from '../src/index.ts';
import { device, emptyDump, miss, outage, richDump } from './build.ts';

const H = 3_600_000;
const sigs = (d: FieldDump) => deriveSignatures(d).map((h) => h.signature);
const withDevices = (...devices: ReturnType<typeof device>[]): FieldDump => ({ ...emptyDump(), devices });
const ratioDay = (r: number, over = {}) =>
  device('D1', { chargingMs: 10 * H, armedMs: Math.round(r * 10 * H), ...over });

describe('R8.1 R8.2 signatures: CHECK:maker:androidMajor:mode', () => {
  it('a day with every failure raises every check once', () => {
    expect(sigs(richDump())).toEqual([
      'ALARM_MISSED:infinix:12:station',
      'ARMED_CRITICAL:infinix:12:station',
      'ARMED_LOW:tecno:13:normal',
      'DELAY_SLOW:tecno:13:normal',
      'FALSE_ALARM:other:unknown:normal',
      'FGS_BLOCKED:infinix:12:station',
      'MISS:other:unknown:normal',
      'UPLOAD_GAP:xiaomi:13:normal',
      'WRITE_FAIL:infinix:12:station',
    ]);
  });

  it('armed ratio: 0.90 and above is clean, between 0.50 and 0.90 is LOW, below 0.50 is CRITICAL', () => {
    expect(sigs(withDevices(ratioDay(0.9)))).toEqual([]);
    expect(sigs(withDevices(ratioDay(0.89)))).toEqual(['ARMED_LOW:tecno:13:normal']);
    expect(sigs(withDevices(ratioDay(0.5)))).toEqual(['ARMED_LOW:tecno:13:normal']);
    expect(sigs(withDevices(ratioDay(0.49)))).toEqual(['ARMED_CRITICAL:tecno:13:normal']);
  });

  it('armed ratio needs one hour of charging, and a suspect day (over 26 h) is left out', () => {
    expect(sigs(withDevices(device('D1', { chargingMs: H - 1, armedMs: 0 })))).toEqual([]);
    expect(sigs(withDevices(device('D1', { chargingMs: 27 * H, armedMs: 0 })))).toEqual([]);
  });

  it('delay p95 above 60 s needs 20 samples; exactly 60 s passes', () => {
    const slow = (n: number, v: number) =>
      device('D1', { delayJobMs: Array.from({ length: n }, () => v), delayReceiverMs: [] });
    expect(sigs(withDevices(slow(19, 90_000)))).toEqual([]);
    expect(sigs(withDevices(slow(20, 60_000)))).toEqual([]);
    expect(sigs(withDevices(slow(20, 60_001)))).toEqual(['DELAY_SLOW:tecno:13:normal']);
  });

  it('classes are separate: the same fault in station mode is another signature', () => {
    const station = ratioDay(0.8, { mode: { normalMs: 0, stationMs: 5 * H } });
    expect(sigs(withDevices(ratioDay(0.8), { ...station, alias: 'D2' }))).toEqual([
      'ARMED_LOW:tecno:13:normal',
      'ARMED_LOW:tecno:13:station',
    ]);
  });

  it('alarm, write and foreground-service failures', () => {
    const ok = device('D1', { alarms: { expected: 2, rung: 2 }, writeFailures: 0, stopReasons: {} });
    expect(sigs(withDevices(ok))).toEqual([]);
    expect(sigs(withDevices({ ...ok, alarms: { expected: 2, rung: 1 } }))).toEqual(['ALARM_MISSED:tecno:13:normal']);
    expect(sigs(withDevices({ ...ok, writeFailures: 1 }))).toEqual(['WRITE_FAIL:tecno:13:normal']);
    expect(sigs(withDevices({ ...ok, stopReasons: { FGS_START_BLOCKED: 1 } }))).toEqual([
      'FGS_BLOCKED:tecno:13:normal',
    ]);
  });

  it('a false alarm needs a Confirmed outage with at least one label, all No', () => {
    const day = (o: Partial<ReturnType<typeof outage>>): FieldDump => ({ ...emptyDump(), outages: [outage(o)] });
    expect(sigs(day({ labelsYes: 0, labelsNo: 2, labelsNone: 0 }))).toEqual(['FALSE_ALARM:other:unknown:normal']);
    expect(sigs(day({ labelsYes: 0, labelsNo: 2, labelsNone: 1 }))).toEqual([]);
    expect(sigs(day({ labelsYes: 1, labelsNo: 2, labelsNone: 0 }))).toEqual([]);
    expect(sigs(day({ labelsYes: 0, labelsNo: 2, labelsNone: 0, level: 'POSSIBLE' }))).toEqual([]);
  });

  it('a miss counts only with at least 3 armed phones in the cell', () => {
    expect(sigs({ ...emptyDump(), misses: [miss(2)] })).toEqual([]);
    expect(sigs({ ...emptyDump(), misses: [miss(2), miss(3)] })).toEqual(['MISS:other:unknown:normal']);
  });

  it('an upload gap is a device with no aggregate for more than a day', () => {
    const silent = (lastDay: string): FieldDump => ({
      ...emptyDump(),
      silent: [{ alias: 'D1', maker: 'itel', androidMajor: 12, lastDay }],
    });
    expect(sigs(silent('2026-11-13'))).toEqual([]); // missing today only
    expect(sigs(silent('2026-11-12'))).toEqual(['UPLOAD_GAP:itel:12:normal']);
  });

  it('evidence holds numbers and no alias or identifier', () => {
    for (const h of deriveSignatures(richDump())) expect(h.evidence).not.toMatch(/\bD\d+\b|[a-z2-7]{26}/);
  });
});
