// Types shared by the detection engine, the Worker and the simulator.
// Spec: .kiro/specs/detection-engine/design.md section 6. Counts and numbers only in explanations (R13.2).

export type EventType = 'ARMED' | 'DISARMED' | 'UNPLUG' | 'BATTERY_FULL' | 'REPLUG';
export type Confidence = 'HIGH' | 'LOW';

/** One event as the engine sees it. `eventTimeMs` is event time (see event-time.md). */
export type EngineEvent = {
  installId: string;
  seq: number;
  type: EventType;
  eventTimeMs: number;
  confidence: Confidence;
  schedulingDelayMs?: number | null;
  /** Simulated events are counted and ignored by the engine (R14). */
  simulated?: boolean;
};

/** Answer to "Was that you?": YES = "Yes, wake me when it's back", NO = "No, I unplugged it". */
export type LabelAnswer = 'YES' | 'NO';
export type Label = { installId: string; unplugSeq: number; answer: LabelAnswer; simulated?: boolean };

export type Level = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED';
export type OutageLevel = 'POSSIBLE' | 'CONFIRMED';
export type HintKind = 'NEIGHBOR' | 'LINKED' | 'MANUAL';

/** Hints from other scopes, assembled by the cell actor (R7.1). */
export type Context = {
  neighbors: { level: Level; maxK: number; linked: boolean }[];
  manualReports: number;
};

export type Thresholds = {
  possible: { minK: number; maxP: number };
  confirmed: { minK: number; maxP: number };
  minArmedForConfirm: number;
  weightCut: number;
};

export type Explanation = {
  k: number;
  n: number;
  excludedNoisy: number;
  lambdaPerSec: number;
  muValue: number;
  p: number;
  windowMs: number;
  thresholds: Thresholds;
  raisedBy?: HintKind;
  confidence: { high: number; low: number };
  restore?: { d: number; quorum: number; replugs: number; wrMs: number; p95SampleCount: number; p95Ms: number };
};

export type DecisionKind = 'OPENED' | 'RAISED' | 'RESTORED' | 'ENDED_UNKNOWN';
export type OutageStatus = 'OPEN' | 'RESTORED' | 'ENDED_UNKNOWN';

export type Decision = {
  outageId: string;
  kind: DecisionKind;
  level: OutageLevel;
  status: OutageStatus;
  decisionTimeMs: number;
  startMs: number;
  restoredAtMs?: number;
  explanation: Explanation;
};
