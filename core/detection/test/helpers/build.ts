// Small builders for engine tests.
import { DEFAULT_PARAMS, type EngineEvent, type EngineInput, type EventType, type Params } from '../../src/index.ts';

export const P: Params = DEFAULT_PARAMS;
export const T0 = 1_700_000_000_000; // arbitrary base event time
export const SEC = 1000;
export const MIN = 60_000;
export const HOUR = 3_600_000;

export const ev = (
  installId: string,
  seq: number,
  type: EventType,
  eventTimeMs: number,
  extra: Partial<EngineEvent> = {},
): EngineEvent => ({ installId, seq, type, eventTimeMs, confidence: 'HIGH', ...extra });

export const input = (events: EngineEvent[], nowMs: number, extra: Partial<EngineInput> = {}): EngineInput => ({
  events,
  labels: [],
  context: { neighbors: [], manualReports: 0 },
  nowMs,
  ...extra,
});

export const ids = (n: number, prefix = 'i'): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** ARMED events for installs, spread over `beforeMs` before `startMs`. Seq 1 each. */
export const armAll = (installs: string[], startMs: number, beforeMs = 10 * MIN): EngineEvent[] =>
  installs.map((id, i) => ev(id, 1, 'ARMED', startMs - beforeMs + i * 1000));

/** UNPLUG events (seq 2) for installs starting at `startMs` with `stepMs` between them. */
export const unplugAll = (installs: string[], startMs: number, stepMs = 100): EngineEvent[] =>
  installs.map((id, i) => ev(id, 2, 'UNPLUG', startMs + i * stepMs));

/** REPLUG events (seq 3) for installs starting at `startMs`. */
export const replugAll = (installs: string[], startMs: number, stepMs = 1000, delay: number | null = null): EngineEvent[] =>
  installs.map((id, i) => ev(id, 3, 'REPLUG', startMs + i * stepMs, delay === null ? {} : { schedulingDelayMs: delay }));
