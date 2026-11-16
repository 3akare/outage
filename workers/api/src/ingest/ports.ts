// The handoff from ingest to detection (R7.3). Detection logic lives only in packages/detection (structure.md).
// Until the engine is wired in, NoopDetectionPort records what it was given so ingest can be built and tested alone.

/** A detection or state event with its event time. `elapsedMs` never travels past the Worker (R3.3). */
export interface IngestedEvent {
  installId: string;
  seq: number;
  type: 'ARMED' | 'DISARMED' | 'UNPLUG' | 'BATTERY_FULL' | 'REPLUG';
  cell: string; // res-8
  eventTimeMs: number;
  confidence: 'HIGH' | 'LOW';
  schedulingDelayMs: number | null;
}

/** alerts-and-light-alarm section 4: the engine takes it as Label { installId, unplugSeq: refSeq, answer }. */
export interface IngestedLabel {
  installId: string;
  seq: number;
  type: 'LABEL';
  cell: string;
  eventTimeMs: number;
  refSeq: number;
  answer: 'YES' | 'NO';
}

/** power-log R7.4: a "Power is out" tap. A hint source only (area-cells R8); it never reaches the engine as an event. */
export interface IngestedReport {
  installId: string;
  seq: number;
  type: 'REPORT';
  cell: string;
  eventTimeMs: number;
}

export type IngestedItem = IngestedEvent | IngestedLabel | IngestedReport;

export interface DetectionPort {
  /** Called once per accepted, new events of one area actor (res-7 parent), in arrival order. Never for duplicates. */
  handle(parent: string, items: IngestedItem[], receiveTimeMs: number): void | Promise<void>;
}

export class NoopDetectionPort implements DetectionPort {
  readonly calls: { parent: string; items: IngestedItem[]; receiveTimeMs: number }[] = [];
  handle(parent: string, items: IngestedItem[], receiveTimeMs: number): void {
    this.calls.push({ parent, items, receiveTimeMs });
    if (this.calls.length > 100) this.calls.shift(); // bounded: this lives in an actor's memory
  }
}
