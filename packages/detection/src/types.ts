import type {
  Confidence,
  Context,
  Decision,
  EngineEvent,
  EventType,
  Explanation,
  HintKind,
  Label,
  Level,
  OutageLevel,
} from '@outage/shared/engine';

export type {
  Confidence,
  Context,
  Decision,
  EngineEvent,
  EventType,
  Explanation,
  HintKind,
  Label,
  Level,
  OutageLevel,
};

export const STATE_VERSION = 1;

/** Compact stored event: [seq, typeCode, timeMs, confidenceCode (0 HIGH, 1 LOW), schedulingDelayMs|null]. */
export type StoredEvent = [seq: number, type: number, timeMs: number, conf: number, delayMs: number | null];
/** Stored label: [unplugSeq, answerCode (0 YES, 1 NO)]. */
export type StoredLabel = [unplugSeq: number, answer: number];

export const EVENT_TYPES: EventType[] = ['ARMED', 'DISARMED', 'UNPLUG', 'BATTERY_FULL', 'REPLUG'];

/** State carried over a settle cut for one install (see settle.ts). */
export type InstallCarry = {
  armed: { startMs: number; lastSeenMs: number } | null;
  /** Times of this install's isolated unplugs within the weight look-back before the cut. */
  isolatedMs: number[];
};

export type InstallPart = { events: StoredEvent[]; labels: StoredLabel[]; carry?: InstallCarry };

export type DayBucket = { c: number[]; e: number[] };

export type BaselineStats = {
  /** Decayed totals through `accDay` (local day index); null when nothing was folded. */
  accDay: number | null;
  c: number[];
  /** Exposure in milliseconds (integers keep sums exact). */
  e: number[];
  /** Raw (undecayed) settled contributions for days after `accDay`, keyed by local day index. */
  days: Record<string, DayBucket>;
};

export type ArchiveOutage = {
  id: string;
  startMs: number;
  status: 'RESTORED' | 'ENDED_UNKNOWN';
  level: OutageLevel;
  endMs: number | null;
  explanation: Explanation;
};

export type PushKind = 'CONFIRMED' | 'RESTORED';
export type PushedRecord = { outageId: string; kind: PushKind; startMs: number };

export type EngineState = {
  version: number;
  /** Events older than this were folded by settle(); null before the first settle. */
  cutMs: number | null;
  installs: Record<string, InstallPart>;
  baseline: BaselineStats;
  /** REPLUG scheduling delays [timeMs, delayMs], oldest first, newest 500 of the settled part. */
  delays: [number, number][];
  archive: ArchiveOutage[];
  pushed: PushedRecord[];
  decisions: Decision[];
};

export type EngineInput = {
  events: EngineEvent[];
  labels: Label[];
  context: Context;
  nowMs: number;
};

export type Push = {
  outageId: string;
  kind: PushKind;
  decisionTimeMs: number;
  level: OutageLevel;
  explanation: Explanation;
};

export type EngineOutputs = {
  decisions: Decision[];
  changes: Decision[];
  pushes: Push[];
  areaStatus: { level: Level; outageId?: string; sinceMs?: number };
  spotStates: { installId: string; state: 'SPOT_ONLY'; sinceMs: number }[];
  rejected: { reason: string }[];
  ignoredSimulated: number;
  clockSkew: boolean;
};

export const MAX_DELAY_SAMPLES = 500;
