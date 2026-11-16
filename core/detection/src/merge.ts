// Merge and normalize (R2, R14): validate, drop simulated, de-duplicate by identity, keep per-install sorted parts.
// The input state is never mutated: touched install parts are copied, untouched ones are shared.
import {
  type EngineEvent,
  type EngineState,
  EVENT_TYPES,
  type InstallPart,
  type Label,
  type StoredEvent,
  type StoredLabel,
} from './types.ts';

const MAX_ABS_TIME = 1e13;
const TYPE_CODE: Record<string, number> = { ARMED: 0, DISARMED: 1, UNPLUG: 2, BATTERY_FULL: 3, REPLUG: 4 };
export const T_ARMED = 0;
export const T_DISARMED = 1;
export const T_UNPLUG = 2;
export const T_BATTERY_FULL = 3;
export const T_REPLUG = 4;

const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x !== '__proto__';
const isSeq = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;

/** Reason an event is malformed, or null when it is valid. Reasons never contain install IDs. */
export function eventProblem(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return 'event is not an object';
  const o = e as Record<string, unknown>;
  if (!isId(o.installId)) return 'installId missing or invalid';
  if (!isSeq(o.seq)) return 'seq must be a non-negative integer';
  if (typeof o.type !== 'string' || !(EVENT_TYPES as string[]).includes(o.type)) return 'unknown event type';
  const t = o.eventTimeMs;
  if (typeof t !== 'number' || !Number.isSafeInteger(t) || Math.abs(t) > MAX_ABS_TIME) {
    return 'eventTimeMs must be an integer in range';
  }
  if (o.confidence !== 'HIGH' && o.confidence !== 'LOW') return 'confidence must be HIGH or LOW';
  const d = o.schedulingDelayMs;
  if (d !== undefined && d !== null && !(typeof d === 'number' && Number.isFinite(d) && d >= 0)) {
    return 'schedulingDelayMs must be null or a number >= 0';
  }
  if (o.simulated !== undefined && typeof o.simulated !== 'boolean') return 'simulated must be a boolean';
  return null;
}

export function labelProblem(l: unknown): string | null {
  if (typeof l !== 'object' || l === null) return 'label is not an object';
  const o = l as Record<string, unknown>;
  if (!isId(o.installId)) return 'label installId missing or invalid';
  if (!isSeq(o.unplugSeq)) return 'label unplugSeq must be a non-negative integer';
  if (o.answer !== 'YES' && o.answer !== 'NO') return 'label answer must be YES or NO';
  if (o.simulated !== undefined && typeof o.simulated !== 'boolean') return 'label simulated must be a boolean';
  return null;
}

export const packEvent = (e: EngineEvent): StoredEvent => [
  e.seq,
  TYPE_CODE[e.type],
  e.eventTimeMs,
  e.confidence === 'LOW' ? 1 : 0,
  e.schedulingDelayMs ?? null,
];

export const compareStored = (a: StoredEvent, b: StoredEvent): number => a[2] - b[2] || a[0] - b[0];

export type MergeResult = {
  installs: Record<string, InstallPart>;
  rejected: { reason: string }[];
  ignoredSimulated: number;
};

export const hasOwn = (o: object, k: string): boolean => Object.hasOwn(o, k);
const has = hasOwn;

export function mergeInputs(state: EngineState, events: EngineEvent[], labels: Label[]): MergeResult {
  const rejected: { reason: string }[] = [];
  let ignoredSimulated = 0;
  const installs: Record<string, InstallPart> = { ...state.installs };
  const copied = new Set<string>();
  const seen = new Map<string, Set<number>>();
  const cut = state.cutMs;

  const part = (id: string): InstallPart => {
    if (!copied.has(id)) {
      const old = has(installs, id) ? installs[id] : undefined;
      installs[id] = old
        ? { events: [...old.events], labels: [...old.labels], ...(old.carry ? { carry: old.carry } : {}) }
        : { events: [], labels: [] };
      copied.add(id);
    }
    return installs[id];
  };

  for (const e of events) {
    const problem = eventProblem(e);
    if (problem) {
      rejected.push({ reason: problem });
      continue;
    }
    if (e.simulated === true) {
      ignoredSimulated++;
      continue;
    }
    if (cut !== null && e.eventTimeMs < cut) {
      rejected.push({ reason: 'event is older than the settled horizon' });
      continue;
    }
    let ids = seen.get(e.installId);
    if (!ids) {
      ids = new Set(has(installs, e.installId) ? installs[e.installId].events.map((x) => x[0]) : []);
      seen.set(e.installId, ids);
    }
    if (ids.has(e.seq)) continue; // identity already held (P4)
    ids.add(e.seq);
    part(e.installId).events.push(packEvent(e));
  }

  const labelSeen = new Set<string>();
  for (const l of labels) {
    const problem = labelProblem(l);
    if (problem) {
      rejected.push({ reason: problem });
      continue;
    }
    if (l.simulated === true) {
      ignoredSimulated++;
      continue;
    }
    const code = l.answer === 'NO' ? 1 : 0;
    const key = `${l.installId}\u0000${l.unplugSeq}\u0000${code}`;
    if (labelSeen.has(key)) continue;
    labelSeen.add(key);
    const p = part(l.installId);
    if (!p.labels.some((x) => x[0] === l.unplugSeq && x[1] === code)) p.labels.push([l.unplugSeq, code] as StoredLabel);
  }

  for (const id of copied) {
    installs[id].events.sort(compareStored);
    installs[id].labels.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  return { installs, rejected, ignoredSimulated };
}

/** The answer that applies to an unplug. NO wins over YES so the result does not depend on label order. */
export function labelFor(labels: StoredLabel[], unplugSeq: number): 'YES' | 'NO' | null {
  let yes = false;
  for (const [seq, ans] of labels) {
    if (seq !== unplugSeq) continue;
    if (ans === 1) return 'NO';
    yes = true;
  }
  return yes ? 'YES' : null;
}
