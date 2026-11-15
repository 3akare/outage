// Builders for report tests: field dumps made from the shared telemetry fixture, with aliases in place of install IDs.
import type { AliasedDeviceDay, DeviceDay, FieldDump, MissRecordOut, OutageRecordOut } from '@outage/shared';
import fixture from '@outage/shared/fixtures/telemetry/device-day.json' with { type: 'json' };

export const DAY = '2026-11-14';
const HOUR = 3_600_000;
const T0 = Date.parse(`${DAY}T10:00:00Z`);

export function device(alias: string, over: Partial<AliasedDeviceDay> = {}): AliasedDeviceDay {
  const { installId: _drop, ...rest } = fixture as DeviceDay;
  return { ...rest, alias, day: DAY, ...over };
}

export function outage(over: Partial<OutageRecordOut> = {}): OutageRecordOut {
  return {
    kind: 'OUTAGE_RECORD',
    key: '0123456789abcdef',
    scopeClass: 'CELL',
    startMs: T0,
    endMs: null,
    level: 'CONFIRMED',
    drops: 4,
    armedN: 6,
    labelsYes: 1,
    labelsNo: 0,
    labelsNone: 3,
    confirmedMs: T0 + 90_000,
    withdrawn: false,
    ...over,
  };
}

export const miss = (armedN: number, atMs = T0 + 2 * HOUR): MissRecordOut => ({ kind: 'MISS', atMs, armedN });

export function emptyDump(day = DAY): FieldDump {
  return { v: 1, day, devices: [], silent: [], outages: [], misses: [] };
}

/** Three phones, one silent phone, three outages and two misses: every check in signatures.md fires once. */
export function richDump(): FieldDump {
  const slow = [...Array.from({ length: 22 }, (_, i) => 1000 + i * 100), 90_000, 95_000, 99_000];
  return {
    v: 1,
    day: DAY,
    devices: [
      device('D1', { armedMs: 22_000_000, delayJobMs: slow }),
      device('D2', { maker: 'samsung', androidMajor: 14, armedMs: 34_900_000 }),
      device('D3', {
        maker: 'infinix',
        androidMajor: 12,
        mode: { normalMs: 0, stationMs: 7_200_000 },
        chargingMs: 7_200_000,
        armedMs: 2_000_000,
        writeFailures: 2,
        alarms: { expected: 2, rung: 1 },
        stopReasons: { FGS_START_BLOCKED: 1 },
        exemption: false,
      }),
    ],
    silent: [{ alias: 'D4', maker: 'xiaomi', androidMajor: 13, lastDay: '2026-11-11' }],
    outages: [
      outage(),
      outage({
        key: 'aaaaaaaaaaaaaaaa',
        startMs: T0 + 3 * HOUR,
        drops: 3,
        armedN: 4,
        labelsYes: 0,
        labelsNo: 2,
        labelsNone: 0,
      }),
      outage({
        key: 'bbbbbbbbbbbbbbbb',
        startMs: T0 + 5 * HOUR,
        level: 'POSSIBLE',
        drops: 2,
        armedN: 5,
        labelsYes: 0,
        labelsNo: 0,
        labelsNone: 2,
        confirmedMs: null,
      }),
    ],
    misses: [miss(4), miss(1, T0 + 4 * HOUR)],
  };
}
