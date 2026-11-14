// Membership and moves (area-cells task 3, R3 and R5, property A10). Pure: no storage, no clock, no runtime imports.
// An install is a member of exactly one cell: the cell of its latest event by event time. Ties go to the larger cell
// string so the result does not depend on arrival order.

export const MEMBER_TTL_MS = 7 * 86_400_000; // R3.3
export const RECENTLY_ARMED_MS = 24 * 3_600_000; // glossary: "recently armed"
export const MIN_WEIGHT = 0.5; // R3.4

export type StateOrOther = 'ARMED' | 'DISARMED' | 'UNPLUG' | 'BATTERY_FULL' | 'REPLUG' | 'LABEL';

export interface Member {
  cell: string;
  lastEventMs: number; // event time of the event that decided `cell`
  weight: number;
  armed: boolean; // armed in `cell` now
  armedDecidedMs: number; // event time of the decision behind `armed`
  lastArmedMs: number | null; // last event time at which the install was known armed
  armedSinceMs: number | null;
}
export type Members = ReadonlyMap<string, Member>;

export interface MemberEvent {
  installId: string;
  cell: string;
  type: StateOrOther;
  eventTimeMs: number;
  weight: number;
}

/** Synthetic internal DISARMED (R5.1). Never stored as an uploaded event, never in a report (R5.2). */
export interface SyntheticDisarm {
  installId: string;
  cell: string; // the old cell
  eventTimeMs: number; // the new event's time
  reason: 'MOVED';
}
/** Ask the old parent's actor to forget the install (R5.3). Carries only the install ID, the old cell and the time. */
export interface RemovalRequest {
  installId: string;
  oldCell: string;
  timeMs: number;
}
export interface MemberStep {
  members: Members;
  synthetic: SyntheticDisarm | null;
  removal: RemovalRequest | null;
}

export type ParentOf = (cell: string) => string;

function fresh(ev: MemberEvent): Member {
  const armed = ev.type === 'ARMED';
  return {
    cell: ev.cell,
    lastEventMs: ev.eventTimeMs,
    weight: ev.weight,
    armed,
    armedDecidedMs: ev.eventTimeMs,
    lastArmedMs: armed ? ev.eventTimeMs : null,
    armedSinceMs: armed ? ev.eventTimeMs : null,
  };
}

/** Apply one event (R3.1, R3.2, R5.1). Older events from another cell are ignored. */
export function applyMemberEvent(members: Members, ev: MemberEvent, parentOf: ParentOf): MemberStep {
  const next = new Map(members);
  const prev = members.get(ev.installId);
  if (!prev) {
    next.set(ev.installId, fresh(ev));
    return { members: next, synthetic: null, removal: null };
  }
  if (prev.cell !== ev.cell) {
    const wins = ev.eventTimeMs > prev.lastEventMs || (ev.eventTimeMs === prev.lastEventMs && ev.cell > prev.cell);
    if (!wins) return { members, synthetic: null, removal: null };
    next.set(ev.installId, fresh(ev));
    const synthetic: SyntheticDisarm | null = prev.armed
      ? { installId: ev.installId, cell: prev.cell, eventTimeMs: ev.eventTimeMs, reason: 'MOVED' }
      : null;
    const removal: RemovalRequest | null =
      parentOf(prev.cell) !== parentOf(ev.cell) ? { installId: ev.installId, oldCell: prev.cell, timeMs: ev.eventTimeMs } : null;
    // The old interval ended no later than the move; it still counts as recently armed in the old cell's history only.
    return { members: next, synthetic, removal };
  }
  // Same cell.
  let m: Member = { ...prev, weight: ev.weight, lastEventMs: Math.max(prev.lastEventMs, ev.eventTimeMs) };
  if (ev.type === 'ARMED' || ev.type === 'DISARMED') {
    const wins = ev.eventTimeMs > prev.armedDecidedMs || (ev.eventTimeMs === prev.armedDecidedMs && ev.type === 'DISARMED');
    if (wins) {
      const armed = ev.type === 'ARMED';
      m = {
        ...m,
        armed,
        armedDecidedMs: ev.eventTimeMs,
        armedSinceMs: armed ? (prev.armed ? prev.armedSinceMs : ev.eventTimeMs) : null,
        lastArmedMs: armed ? ev.eventTimeMs : Math.max(prev.lastArmedMs ?? 0, ev.eventTimeMs),
      };
    }
  }
  next.set(ev.installId, m);
  return { members: next, synthetic: null, removal: null };
}

/** Drop installs silent for 7 days (R3.3). */
export function expireMembers(members: Members, nowMs: number): Members {
  const next = new Map<string, Member>();
  for (const [id, m] of members) if (nowMs - m.lastEventMs <= MEMBER_TTL_MS) next.set(id, m);
  return next.size === members.size ? members : next;
}

/** The old actor's handling of a removal request: drop the install only if it is still recorded in `oldCell` and older. */
export function applyRemoval(members: Members, req: RemovalRequest): Members {
  const m = members.get(req.installId);
  if (!m || m.cell !== req.oldCell || m.lastEventMs > req.timeMs) return members;
  const next = new Map(members);
  next.delete(req.installId);
  return next;
}

export const counts = (m: Member): boolean => m.weight >= MIN_WEIGHT;

/** Recently armed: armed now, or armed at any time in the last 24 hours. It does not drop when a phone unplugs (gap G1). */
export function isRecentlyArmed(m: Member, nowMs: number): boolean {
  return m.armed || (m.lastArmedMs !== null && nowMs - m.lastArmedMs <= RECENTLY_ARMED_MS);
}

/** Member count per cell, weight >= 0.5 only (R3.4). Stored and internal; never sent to a client (R3.5). */
export function memberCount(members: Members, cell: string): number {
  let n = 0;
  for (const m of members.values()) if (m.cell === cell && counts(m)) n++;
  return n;
}
export function recentlyArmedCount(members: Members, cell: string, nowMs: number): number {
  let n = 0;
  for (const m of members.values()) if (m.cell === cell && counts(m) && isRecentlyArmed(m, nowMs)) n++;
  return n;
}
