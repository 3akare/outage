// The reference sweep (design section 4). One pass over the retained events in the total order (time, installId, seq).
// The result is a pure function of the retained event set, never of arrival order (P3, P4, P8).
import { hasOwn, labelFor, T_ARMED, T_BATTERY_FULL, T_DISARMED, T_REPLUG, T_UNPLUG } from './merge.ts';
import type { Params } from './params.ts';
import { DAY_MS, HOUR_MS, dayStartMs, localDay, localHour } from './time.ts';
import { type DayBucket, type EngineState, MAX_DELAY_SAMPLES, type OutageLevel } from './types.ts';
import { classifyWindow, levelRank, type WindowLevel } from './window.ts';

export type Ev = { installId: string; seq: number; type: number; t: number; high: boolean; delay: number | null };

type Interval = { start: number; end: number };
type Open = { start: number; lastSeen: number };

export type Unplug = {
  t: number;
  seq: number;
  /** Labeled "No, I unplugged it". */
  human: boolean;
  wake: boolean;
  /** Weight >= cut at the time of the unplug. */
  eligible: boolean;
  outage: OutageRec | null;
  fromCarry: boolean;
};

export type Rt = {
  id: string;
  intervals: Interval[];
  open: Open | null;
  unplugs: Unplug[];
  replugs: number[];
  hadEvents: boolean;
};

export type WindowRec = {
  t: number;
  k: number;
  n: number;
  lambdaPerSec: number;
  mu: number;
  p: number;
  level: WindowLevel;
  excludedNoisy: number;
  high: number;
  low: number;
};

export type RestoreRec = {
  d: number;
  quorum: number;
  replugs: number;
  wrMs: number;
  p95SampleCount: number;
  p95Ms: number;
  high: number;
  low: number;
};

export type OutageRec = {
  id: string;
  startMs: number;
  level: OutageLevel;
  /** First window that reached each level. */
  openedAt: WindowRec;
  windowAt: { POSSIBLE?: WindowRec; CONFIRMED?: WindowRec };
  maxK: number;
  dropped: Map<string, number>;
  wrMs: number;
  p95Ms: number;
  p95SampleCount: number;
  replugs: { t: number; installId: string; high: boolean }[];
  closedBy: null | 'RESTORED' | 'EXPIRED';
  restoredAtMs?: number;
  evidenceAtMs?: number;
  restore?: RestoreRec;
};

type Drop = { t: number; rt: Rt; seq: number; high: boolean; outage: OutageRec | null };

export type SweepResult = {
  rts: Map<string, Rt>;
  outages: OutageRec[];
  windows: WindowRec[];
  delays: [number, number][];
  /** Local-day buckets finalized during the sweep. */
  finalized: Map<number, DayBucket>;
  computeBucket: (day: number, lo: number, hi: number) => DayBucket;
  lastEventMs: number | null;
};

export const outageEndMs = (o: OutageRec, params: Params): number =>
  o.closedBy === 'RESTORED' ? (o.evidenceAtMs as number) : o.startMs + params.unknownEndMs;

/** FNV-1a, two seeds, to a 16-hex id. Time-free so a time shift keeps ids (P8). */
export function outageIdFor(installId: string, seq: number): string {
  const s = `${installId}:${seq}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdeadbeef;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return `o${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

const cmpEv = (a: Ev, b: Ev): number =>
  a.t - b.t || (a.installId < b.installId ? -1 : a.installId > b.installId ? 1 : 0) || a.seq - b.seq;

export function collectEvents(installs: EngineState['installs']): Ev[] {
  const out: Ev[] = [];
  for (const id of Object.keys(installs)) {
    for (const e of installs[id].events) {
      out.push({ installId: id, seq: e[0], type: e[1], t: e[2], high: e[3] === 0, delay: e[4] });
    }
  }
  return out.sort(cmpEv);
}

/** Nearest-rank p95 of the newest `MAX_DELAY_SAMPLES` delays with time < `beforeMs`. */
export function p95Before(
  delays: [number, number][],
  beforeMs: number,
  params: Params,
): { p95Ms: number; count: number; wrMs: number } {
  let lo = 0;
  let hi = delays.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (delays[mid][0] < beforeMs) lo = mid + 1;
    else hi = mid;
  }
  const sample = delays.slice(Math.max(0, lo - MAX_DELAY_SAMPLES), lo).map((x) => x[1]);
  if (sample.length < params.restore.minSamples) {
    return { p95Ms: params.restore.priorP95Ms, count: sample.length, wrMs: params.restore.baseMs + params.restore.priorP95Ms };
  }
  sample.sort((a, b) => a - b);
  const p95 = sample[Math.ceil(0.95 * sample.length) - 1];
  return { p95Ms: p95, count: sample.length, wrMs: params.restore.baseMs + p95 };
}

const zeros = (): number[] => new Array(24).fill(0);

export function sweep(state: EngineState, installs: EngineState['installs'], params: Params): SweepResult {
  const W = params.windowMs;
  const L = params.weight.lookbackMs;
  const off = params.localOffsetMs;
  const events = collectEvents(installs);
  const cut = state.cutMs;

  const rts = new Map<string, Rt>();
  const rtFor = (id: string): Rt => {
    let r = rts.get(id);
    if (!r) {
      r = { id, intervals: [], open: null, unplugs: [], replugs: [], hadEvents: false };
      rts.set(id, r);
    }
    return r;
  };
  for (const id of Object.keys(installs)) {
    const carry = installs[id].carry;
    const r = rtFor(id);
    if (carry) {
      r.open = carry.armed ? { start: carry.armed.startMs, lastSeen: carry.armed.lastSeenMs } : null;
      for (const t of carry.isolatedMs) {
        r.unplugs.push({ t, seq: -1, human: false, wake: false, eligible: true, outage: null, fromCarry: true });
      }
    }
  }

  const delays: [number, number][] = state.delays.map((x) => [x[0], x[1]]);
  const outages: OutageRec[] = [];
  const windows: WindowRec[] = [];
  let openOutage: OutageRec | null = null;
  let recent: Drop[] = [];
  const finalized = new Map<number, DayBucket>();

  // ---- armed state ----------------------------------------------------------------------------------------------
  const expireStale = (r: Rt, t: number) => {
    if (r.open && t > r.open.lastSeen + params.staleArmedMs) {
      r.intervals.push({ start: r.open.start, end: r.open.lastSeen + params.staleArmedMs });
      r.open = null;
    }
  };
  const armedAt = (r: Rt, tau: number): boolean => {
    for (let i = r.intervals.length - 1; i >= 0; i--) {
      const iv = r.intervals[i];
      if (iv.start <= tau && tau < iv.end) return true;
    }
    return !!r.open && r.open.start <= tau && tau < r.open.lastSeen + params.staleArmedMs;
  };

  // ---- weight ---------------------------------------------------------------------------------------------------
  const isolatedCount = (r: Rt, t: number): number => {
    let u = 0;
    for (const x of r.unplugs) if (x.t > t - L && x.t <= t - W && (x.human || x.outage === null)) u++;
    return u;
  };
  const weightAt = (r: Rt, t: number): number => params.weight.u0 / (params.weight.u0 + isolatedCount(r, t));
  const eligibleAt = (r: Rt, t: number): boolean => weightAt(r, t) >= params.weight.cut;

  // ---- baseline -------------------------------------------------------------------------------------------------
  const sortedRawDays = Object.keys(state.baseline.days)
    .map(Number)
    .sort((a, b) => a - b);
  const lambdaCache = new Map<number, number[]>();
  const b0 = params.baseline.priorExposureSec;
  const a0 = b0 * params.baseline.priorLambdaPerSec;
  const lambdaTable = (D: number): number[] => {
    const hit = lambdaCache.get(D);
    if (hit) return hit;
    const days = new Set<number>(sortedRawDays);
    for (const d of finalized.keys()) days.add(d);
    let c = state.baseline.c.slice();
    let e = state.baseline.e.slice();
    let prev = state.baseline.accDay;
    for (const d of [...days].filter((x) => x < D).sort((a, b) => a - b)) {
      const raw = hasOwn(state.baseline.days, String(d)) ? state.baseline.days[String(d)] : null;
      const live = finalized.get(d) ?? null;
      const dc = zeros().map((_, h) => (raw ? raw.c[h] : 0) + (live ? live.c[h] : 0));
      const de = zeros().map((_, h) => (raw ? raw.e[h] : 0) + (live ? live.e[h] : 0));
      if (prev === null) {
        c = dc;
        e = de;
      } else {
        const f = params.baseline.dailyDecay ** (d - prev);
        c = c.map((x, h) => x * f + dc[h]);
        e = e.map((x, h) => x * f + de[h]);
      }
      prev = d;
    }
    const f = prev === null ? 0 : params.baseline.dailyDecay ** (D - 1 - prev);
    const table = zeros().map((_, h) => (a0 + c[h] * f) / (b0 + (e[h] * f) / 1000));
    lambdaCache.set(D, table);
    return table;
  };
  const lambdaFor = (t: number): number => lambdaTable(localDay(t - W, off))[localHour(t, off)];

  // Exposure: eligible armed time of each install, minus time inside outages, split by local hour (ms).
  const eligibleSegments = (r: Rt, lo: number, hi: number): [number, number][] => {
    const segs: [number, number][] = [];
    const all: Interval[] = [...r.intervals];
    if (r.open) all.push({ start: r.open.start, end: r.open.lastSeen + params.staleArmedMs });
    const armed: [number, number][] = [];
    for (const iv of all) {
      const s = Math.max(iv.start, lo);
      const e = Math.min(iv.end, hi);
      if (e > s) armed.push([s, e]);
    }
    if (armed.length === 0) return segs;
    // eligibility breakpoints from the isolated unplug list
    const marks: [number, number][] = [];
    for (const x of r.unplugs) if (x.human || x.outage === null) marks.push([x.t + W, 1], [x.t + L, -1]);
    marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cuts = [...new Set(marks.map((m) => m[0]))];
    const countAt = (tau: number) => {
      let u = 0;
      for (const x of r.unplugs) if ((x.human || x.outage === null) && x.t + W <= tau && tau < x.t + L) u++;
      return u;
    };
    for (const [s, e] of armed) {
      const pts = [s, ...cuts.filter((c) => c > s && c < e), e];
      for (let i = 0; i + 1 < pts.length; i++) {
        const u = countAt(pts[i]);
        if (params.weight.u0 / (params.weight.u0 + u) >= params.weight.cut) segs.push([pts[i], pts[i + 1]]);
      }
    }
    return segs;
  };
  const subtractOutages = (segs: [number, number][]): [number, number][] => {
    let cur = segs;
    for (const o of outages) {
      const os = o.startMs;
      const oe = o.closedBy === 'RESTORED' ? (o.restoredAtMs as number) : o.closedBy === 'EXPIRED' ? os + params.unknownEndMs : Number.POSITIVE_INFINITY;
      const next: [number, number][] = [];
      for (const [s, e] of cur) {
        if (e <= os || s >= oe) next.push([s, e]);
        else {
          if (s < os) next.push([s, os]);
          if (e > oe) next.push([oe, e]);
        }
      }
      cur = next;
    }
    return cur;
  };

  const computeBucket = (day: number, lo0: number, hi0: number): DayBucket => {
    const lo = Math.max(lo0, dayStartMs(day, off));
    const hi = Math.min(hi0, dayStartMs(day + 1, off));
    const c = zeros();
    const e = zeros();
    if (hi <= lo) return { c, e };
    for (const r of rts.values()) {
      for (const x of r.unplugs) {
        if (x.fromCarry || x.t < lo || x.t >= hi || !x.eligible) continue;
        if (x.human || x.outage === null) c[localHour(x.t, off)]++;
      }
      for (const [s, en] of subtractOutages(eligibleSegments(r, lo, hi))) {
        let a = s;
        while (a < en) {
          const hourEnd = Math.floor((a + off) / HOUR_MS) * HOUR_MS + HOUR_MS - off;
          const b = Math.min(en, hourEnd);
          e[localHour(a, off)] += b - a;
          a = b;
        }
      }
    }
    return { c, e };
  };

  let nextDay: number | null = null;
  // After a settle the carried armed state is activity at the cut: days after it still accrue exposure until it goes stale.
  let lastActiveMs = cut ?? Number.NEGATIVE_INFINITY;
  const finalizeDays = (t: number) => {
    if (nextDay === null) return;
    const skipAfter = Math.ceil(params.staleArmedMs / DAY_MS) + 2;
    while (dayStartMs(nextDay + 1, off) + W <= t) {
      if (nextDay > localDay(lastActiveMs, off) + skipAfter) {
        nextDay = Math.max(nextDay, localDay(t - W, off));
        break;
      }
      const lo = cut ?? Number.NEGATIVE_INFINITY;
      const b = computeBucket(nextDay, lo, Number.POSITIVE_INFINITY);
      if (b.c.some((x) => x > 0) || b.e.some((x) => x > 0)) finalized.set(nextDay, b);
      nextDay++;
    }
  };

  // ---- outages --------------------------------------------------------------------------------------------------
  const closeExpired = (t: number) => {
    if (openOutage && t > openOutage.startMs + params.unknownEndMs) {
      openOutage.closedBy = 'EXPIRED';
      openOutage = null;
    }
  };
  const attach = (d: Drop, o: OutageRec, rec: Unplug | undefined) => {
    d.outage = o;
    if (!o.dropped.has(d.rt.id)) o.dropped.set(d.rt.id, d.t);
    if (rec) rec.outage = o;
  };
  const recOf = (r: Rt, seq: number, t: number): Unplug | undefined => {
    for (let i = r.unplugs.length - 1; i >= 0; i--) if (r.unplugs[i].seq === seq && r.unplugs[i].t === t) return r.unplugs[i];
    return undefined;
  };

  if (events.length > 0) nextDay = localDay(Math.min(events[0].t, cut ?? events[0].t), off);

  for (const ev of events) {
    const t = ev.t;
    closeExpired(t);
    finalizeDays(t);
    lastActiveMs = Math.max(lastActiveMs, t);
    const r = rtFor(ev.installId);
    r.hadEvents = true;
    expireStale(r, t);

    if (ev.type === T_ARMED) {
      if (r.open) r.open.lastSeen = t;
      else r.open = { start: t, lastSeen: t };
    } else if (ev.type === T_BATTERY_FULL) {
      if (r.open) r.open.lastSeen = t;
    } else if (ev.type === T_DISARMED) {
      if (r.open) {
        if (t > r.open.start) r.intervals.push({ start: r.open.start, end: t });
        r.open = null;
      }
    } else if (ev.type === T_REPLUG) {
      if (r.open) r.open.lastSeen = t;
      else r.open = { start: t, lastSeen: t };
      r.replugs.push(t);
      if (ev.delay !== null) delays.push([t, ev.delay]);
      if (openOutage) tryRestore(openOutage, r, ev);
    } else if (ev.type === T_UNPLUG) {
      const label = labelFor(installs[ev.installId].labels, ev.seq);
      const elig = eligibleAt(r, t);
      const rec: Unplug = { t, seq: ev.seq, human: label === 'NO', wake: label === 'YES', eligible: elig, outage: null, fromCarry: false };
      // close the armed interval at the unplug
      if (r.open) {
        if (t > r.open.start) r.intervals.push({ start: r.open.start, end: t });
        r.open = null;
      }
      r.unplugs.push(rec);
      if (!rec.human && elig) processDrop(r, ev, rec);
    }
  }

  function tryRestore(o: OutageRec, r: Rt, ev: Ev): void {
    const first = o.dropped.get(r.id);
    if (first === undefined || first >= ev.t) return;
    o.replugs.push({ t: ev.t, installId: r.id, high: ev.high });
    const d = o.dropped.size;
    const quorum = Math.max(params.restore.minQuorum, Math.ceil(d / 2));
    const span = o.replugs.filter((x) => x.t >= ev.t - o.wrMs);
    const distinct = new Set(span.map((x) => x.installId));
    if (distinct.size < quorum) return;
    o.closedBy = 'RESTORED';
    o.restoredAtMs = span[0].t;
    o.evidenceAtMs = ev.t;
    o.restore = {
      d,
      quorum,
      replugs: distinct.size,
      wrMs: o.wrMs,
      p95SampleCount: o.p95SampleCount,
      p95Ms: o.p95Ms,
      high: span.filter((x) => x.high).length,
      low: span.filter((x) => !x.high).length,
    };
    openOutage = null;
  }

  function processDrop(r: Rt, ev: Ev, rec: Unplug): void {
    const t = ev.t;
    const drop: Drop = { t, rt: r, seq: ev.seq, high: ev.high, outage: null };
    recent = recent.filter((x) => x.t > t - W);
    recent.push(drop);
    const counted = recent.filter((x) => !(x.outage && x.outage.closedBy !== null));
    const byInstall = new Map<string, Drop>();
    for (const x of counted) if (!byInstall.has(x.rt.id)) byInstall.set(x.rt.id, x);
    const k = byInstall.size;
    let n = 0;
    let excluded = 0;
    const seenExcluded = new Set<string>();
    for (const x of rts.values()) {
      if (!armedAt(x, t - W)) continue;
      if (eligibleAt(x, t)) n++;
      else {
        excluded++;
        seenExcluded.add(x.id);
      }
    }
    for (const x of rts.values()) {
      if (seenExcluded.has(x.id)) continue;
      if (x.unplugs.some((u) => u.t > t - W && u.t <= t && !u.human && !u.eligible)) excluded++;
    }
    const stat = classifyWindow(k, n, lambdaFor(t), params);
    let high = 0;
    for (const x of byInstall.values()) if (x.high) high++;
    const win: WindowRec = {
      t,
      k,
      n,
      lambdaPerSec: stat.lambdaPerSec,
      mu: stat.mu,
      p: stat.p,
      level: stat.level,
      excludedNoisy: excluded,
      high,
      low: k - high,
    };
    windows.push(win);

    if (win.level !== 'NONE') {
      if (!openOutage) {
        const members = [...byInstall.values()].sort((a, b) => a.t - b.t);
        const earliest = members[0];
        const p95 = p95Before(delays, earliest.t, params);
        const o: OutageRec = {
          id: outageIdFor(earliest.rt.id, earliest.seq),
          startMs: earliest.t,
          level: win.level,
          openedAt: win,
          windowAt: {},
          maxK: k,
          dropped: new Map(),
          wrMs: p95.wrMs,
          p95Ms: p95.p95Ms,
          p95SampleCount: p95.count,
          replugs: [],
          closedBy: null,
        };
        outages.push(o);
        openOutage = o;
        for (const x of counted) attach(x, o, recOf(x.rt, x.seq, x.t));
      } else if (levelRank(win.level) > levelRank(openOutage.level)) {
        openOutage.level = win.level;
      }
      const o = openOutage as OutageRec;
      if (!o.windowAt[win.level]) o.windowAt[win.level] = win;
      o.maxK = Math.max(o.maxK, k);
    }
    if (openOutage && drop.outage === null) attach(drop, openOutage, rec);
  }

  // The first outage window may reach CONFIRMED directly; keep `level` consistent with windowAt.
  for (const o of outages) o.level = o.windowAt.CONFIRMED ? 'CONFIRMED' : 'POSSIBLE';

  const lastEventMs = events.length > 0 ? events[events.length - 1].t : null;
  return { rts, outages, windows, delays, finalized, computeBucket, lastEventMs };
}
