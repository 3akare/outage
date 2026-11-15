// Area reducer (area-cells task 9, R10 to R12, properties A9, A11, A12). Pure: `reduce(state, input, cfg) -> { state, out }`.
// No storage, no clock, no Cloudflare imports. The Durable Object shell (area-actor.ts) persists the state and sends what
// `out` asks for. The detection engine is called as a library, once per scope per request (R11.4).
import {
  type Context,
  type Decision as EngineDecision,
  type EngineEvent,
  type EngineState,
  evaluate,
  initialState,
  type Label,
  type Params,
  removeInstall,
} from '@outage/detection';
import type { IngestedItem } from '../ports.ts';
import { buildContext } from './hints.ts';
import {
  coalesceOutages,
  diffLinks,
  groupsFromLinks,
  linkedPairs,
  type OutageRecord,
  planGroups,
  pruneRecords,
} from './links.ts';
import {
  applyMemberEvent,
  applyRemoval,
  counts,
  expireMembers,
  type Member,
  type MemberStep,
  type RemovalRequest,
} from './members.ts';
import {
  type Level,
  mergeNotice,
  type Notice,
  type NoticeBatch,
  planNotices,
  pruneNotices,
  type ScopeLevelChange,
} from './neighbors.ts';
import { applyPushes, type Episodes, type PassedPush, type PushCandidate, pruneEpisodes } from './pushes.ts';
import {
  cellKey,
  type Group,
  groupKey,
  type OpenOutage,
  parentKey,
  routeScopes,
  type ScopeKey,
  type ScopeRef,
} from './scope.ts';
import {
  buildPublicView,
  HISTORY_MS,
  MIN_PUBLIC_MEMBERS,
  PRECISION_OF,
  type PublicScopeView,
  type ScopeKind,
} from './view.ts';

// ---- state ------------------------------------------------------------------------------------------------------

/** An event as the reducer keeps it. `movedTo` marks a synthetic MOVED disarm (R5.1): never uploaded, never reported. */
export interface LoggedEvent {
  installId: string;
  seq: number;
  type: EngineEvent['type'];
  cell: string;
  eventTimeMs: number;
  confidence: 'HIGH' | 'LOW';
  schedulingDelayMs: number | null;
  movedTo?: string;
}
export interface LoggedLabel {
  installId: string;
  unplugSeq: number;
  answer: 'YES' | 'NO';
  cell: string;
}
export interface ScopeEngine {
  kind: ScopeKind;
  cells: string[];
  state: EngineState;
  /** The hint context of the last evaluation, to find scopes whose hints changed. */
  ctx?: string;
}
export interface HistoryRec {
  scopeKey: ScopeKey;
  startMs: number;
  endMs: number | null;
  level: 'POSSIBLE' | 'CONFIRMED';
  precision: 'CELL' | 'LINKED' | 'COARSE';
}
export interface ScopeLevel {
  level: Level;
  maxK: number;
}

export interface AreaState {
  parent: string;
  members: Record<string, Member>;
  engines: Record<ScopeKey, ScopeEngine>;
  log: LoggedEvent[];
  labels: LoggedLabel[];
  /** Events already in `log` that no engine has seen yet (state-only batches, R11.2). */
  pending: LoggedEvent[];
  pendingLabels: LoggedLabel[];
  pendingSinceMs: number | null;
  records: OutageRecord[];
  links: string[];
  groups: Group[];
  notices: Record<string, Notice>;
  scopeLevels: Record<ScopeKey, ScopeLevel>;
  /** Level of each scope without hints, used as the local hint for other scopes. */
  baseLevels: Record<ScopeKey, ScopeLevel>;
  /** Scope keys of outages that were open at the last evaluation, with their level, for pinning and the alarm. */
  open: { outageId: string; scopeKey: ScopeKey; startMs: number; level: 'POSSIBLE' | 'CONFIRMED' }[];
  episodes: Episodes;
  history: Record<string, HistoryRec>;
  counters: Record<string, number>;
}

export function emptyAreaState(parent: string): AreaState {
  return {
    parent,
    members: {},
    engines: {},
    log: [],
    labels: [],
    pending: [],
    pendingLabels: [],
    pendingSinceMs: null,
    records: [],
    links: [],
    groups: [],
    notices: {},
    scopeLevels: {},
    baseLevels: {},
    open: [],
    episodes: {},
    history: {},
    counters: {},
  };
}

// ---- config, input, output ---------------------------------------------------------------------------------------

export interface AreaConfig {
  params: Params;
  stateFlushMs: number;
  /** R11.2. False evaluates every batch, which the tests use as the reference for A12. */
  deferStateOnly: boolean;
  neighborsOf: (cell: string) => readonly string[];
  childrenOf: (parent: string) => readonly string[];
  parentOf: (cell: string) => string;
}

export type AreaInput =
  | { type: 'EVENTS'; nowMs: number; items: readonly IngestedItem[] }
  | { type: 'TICK'; nowMs: number }
  | { type: 'NOTICES'; nowMs: number; notices: readonly Notice[] }
  | { type: 'REMOVE'; nowMs: number; request: RemovalRequest }
  | { type: 'DELETE'; nowMs: number; installId: string };

export interface ScopeView {
  scopeKey: ScopeKey;
  view: PublicScopeView | null; // null: not publishable (R9.1), the page shows an install invitation
}

export interface AreaOutput {
  /** Pushes after per-cell, per-episode de-duplication, for the alerts system (R10.3). */
  pushes: PassedPush[];
  notices: NoticeBatch[];
  removals: RemovalRequest[];
  views: ScopeView[];
  /** Earliest time the shell must call TICK: a flush of queued state events or an open outage reaching 12 hours (R11.5). */
  nextAlarmMs: number | null;
  /** Scopes evaluated by this call, each at most once (R11.4). */
  evaluated: ScopeKey[];
  rejected: number;
}

const bump = (c: Record<string, number>, k: string, n = 1): Record<string, number> => ({ ...c, [k]: (c[k] ?? 0) + n });

// ---- helpers ----------------------------------------------------------------------------------------------------

const isDetectionItem = (i: IngestedItem): boolean => i.type !== 'ARMED' && i.type !== 'DISARMED';
const membersMap = (s: AreaState): Map<string, Member> => new Map(Object.entries(s.members));

const toEngineEvent = (e: LoggedEvent): EngineEvent => ({
  installId: e.installId,
  seq: e.seq,
  type: e.type,
  eventTimeMs: e.eventTimeMs,
  confidence: e.confidence,
  schedulingDelayMs: e.schedulingDelayMs,
});
const toEngineLabel = (l: LoggedLabel): Label => ({ installId: l.installId, unplugSeq: l.unplugSeq, answer: l.answer });

/** An event belongs to a scope when its cell is in the scope and it is not a MOVED disarm for a move inside the scope. */
const inScope = (cells: ReadonlySet<string>, e: { cell: string; movedTo?: string }): boolean =>
  cells.has(e.cell) && !(e.movedTo !== undefined && cells.has(e.movedTo));

const latestPerOutage = (decisions: readonly EngineDecision[]): Map<string, EngineDecision> => {
  const rank = { OPENED: 0, RAISED: 1, RESTORED: 2, ENDED_UNKNOWN: 3 } as const;
  const by = new Map<string, EngineDecision>();
  for (const d of decisions) {
    const cur = by.get(d.outageId);
    if (!cur || rank[d.kind] > rank[cur.kind]) by.set(d.outageId, d);
  }
  return by;
};

const scopeRefOf = (key: ScopeKey, e: ScopeEngine): ScopeRef => ({
  kind: e.kind,
  key,
  precision: PRECISION_OF[e.kind],
  cells: [...e.cells].sort(),
});

function memberCountIn(state: AreaState, cells: readonly string[]): number {
  const set = new Set(cells);
  let n = 0;
  for (const m of Object.values(state.members)) if (set.has(m.cell) && counts(m)) n++;
  return n;
}

/** Level without hints: a CONFIRMED that a hint raised (`raisedBy`) counts as POSSIBLE. Open outages only. */
function baseLevelOf(decisions: readonly EngineDecision[], maxK: number): ScopeLevel {
  const latest = latestPerOutage(decisions);
  let level: Level = 'NORMAL';
  for (const d of decisions) {
    if (latest.get(d.outageId)?.status !== 'OPEN') continue;
    if (d.level === 'CONFIRMED' && d.explanation.raisedBy === undefined) level = 'CONFIRMED';
    else if (level === 'NORMAL') level = 'POSSIBLE';
  }
  return { level, maxK };
}

// ---- reduce -----------------------------------------------------------------------------------------------------

export function reduce(state: AreaState, input: AreaInput, cfg: AreaConfig): { state: AreaState; out: AreaOutput } {
  const nowMs = input.nowMs;
  const s: AreaState = { ...state };
  const removals: RemovalRequest[] = [];
  let rejected = 0;
  const fresh: LoggedEvent[] = [];
  const freshLabels: LoggedLabel[] = [];
  let hasDetection = false;
  let forceAll = false;
  let deleteId: string | null = null;

  if (input.type === 'EVENTS') {
    let members: ReadonlyMap<string, Member> = membersMap(s);
    for (const it of input.items) {
      if (cfg.parentOf(it.cell) !== s.parent) {
        rejected++; // BAD_ROUTE: the Worker computes the parent, so this is a routing bug (design section 11)
        continue;
      }
      const step: MemberStep = applyMemberEvent(
        members,
        { installId: it.installId, cell: it.cell, type: it.type, eventTimeMs: it.eventTimeMs, weight: 1 },
        cfg.parentOf,
      );
      members = step.members;
      if (step.removal) removals.push(step.removal);
      if (step.synthetic) {
        // R5.1: close the armed interval in the old cell. Same seq as the new event, which no old scope has seen.
        fresh.push({
          installId: it.installId,
          seq: it.seq,
          type: 'DISARMED',
          cell: step.synthetic.cell,
          eventTimeMs: step.synthetic.eventTimeMs,
          confidence: 'HIGH',
          schedulingDelayMs: null,
          movedTo: it.cell,
        });
      }
      if (it.type === 'LABEL') {
        freshLabels.push({ installId: it.installId, unplugSeq: it.refSeq, answer: it.answer, cell: it.cell });
      } else {
        fresh.push({
          installId: it.installId,
          seq: it.seq,
          type: it.type,
          cell: it.cell,
          eventTimeMs: it.eventTimeMs,
          confidence: it.confidence,
          schedulingDelayMs: it.schedulingDelayMs,
        });
      }
      if (isDetectionItem(it)) hasDetection = true;
    }
    members = expireMembers(members, nowMs);
    s.members = Object.fromEntries(members);
    s.counters = bump(s.counters, 'events', input.items.length);
  } else if (input.type === 'NOTICES') {
    const nb = new Set(cfg.childrenOf(s.parent).flatMap((c) => cfg.neighborsOf(c)));
    let table: ReadonlyMap<string, Notice> = new Map(Object.entries(s.notices));
    for (const n of input.notices) {
      const r = mergeNotice(table, n, nowMs, (c) => nb.has(c) && cfg.parentOf(c) !== s.parent);
      table = r.table;
      s.counters = bump(s.counters, r.verdict === 'merged' ? 'notices_received' : 'notices_ignored');
    }
    s.notices = Object.fromEntries(table);
    forceAll = true; // R7.6, refined below to the scopes touching the notice cells
  } else if (input.type === 'REMOVE') {
    s.members = Object.fromEntries(applyRemoval(membersMap(s), input.request));
  } else if (input.type === 'DELETE') {
    deleteId = input.installId;
  }

  // Log and queue (R11.2). State-only batches wait for a detection event or the flush interval.
  if (fresh.length > 0 || freshLabels.length > 0) {
    s.log = [...s.log, ...fresh];
    s.labels = [...s.labels, ...freshLabels];
  }
  let feed = fresh;
  let feedLabels = freshLabels;
  if (input.type === 'EVENTS') {
    if (hasDetection || !cfg.deferStateOnly) {
      feed = [...s.pending, ...fresh];
      feedLabels = [...s.pendingLabels, ...freshLabels];
      s.pending = [];
      s.pendingLabels = [];
      s.pendingSinceMs = null;
    } else {
      s.pending = [...s.pending, ...fresh];
      s.pendingLabels = [...s.pendingLabels, ...freshLabels];
      s.pendingSinceMs = s.pendingSinceMs ?? nowMs;
      feed = [];
      feedLabels = [];
      s.counters = bump(s.counters, 'deferred_batches');
    }
  } else if (input.type === 'TICK') {
    feed = s.pending;
    feedLabels = s.pendingLabels;
    s.pending = [];
    s.pendingLabels = [];
    s.pendingSinceMs = null;
  }

  // Delete my data (R12.1): membership, log, queues and every engine state. Archive and public history stay (R12.2).
  if (deleteId !== null) {
    const id = deleteId;
    const { [id]: _gone, ...members } = s.members;
    s.members = members;
    s.log = s.log.filter((e) => e.installId !== id);
    s.labels = s.labels.filter((l) => l.installId !== id);
    s.pending = s.pending.filter((e) => e.installId !== id);
    s.pendingLabels = s.pendingLabels.filter((l) => l.installId !== id);
    s.engines = Object.fromEntries(
      Object.entries(s.engines).map(([k, e]) => [k, { ...e, state: removeInstall(e.state, id) }]),
    );
    forceAll = true;
  }

  // Which scopes need an evaluation, each once (R11.4).
  const routeCtx = { parent: s.parent, parentCells: [...cfg.childrenOf(s.parent)].sort(), groups: s.groups };
  const touched = new Map<ScopeKey, ScopeRef>();
  for (const e of feed) for (const r of routeScopes(e.cell, routeCtx)) touched.set(r.key, r);
  for (const l of feedLabels) for (const r of routeScopes(l.cell, routeCtx)) touched.set(r.key, r);
  if (input.type === 'TICK' || forceAll) {
    // Unknown-end decisions need a later `nowMs` (R11.5); deletes and notices re-evaluate what they touch.
    for (const [k, e] of Object.entries(s.engines)) {
      const open = s.open.some((o) => o.scopeKey === k);
      if (input.type === 'TICK' ? open : forceAll) touched.set(k, scopeRefOf(k, e));
    }
  }
  if (input.type === 'NOTICES') {
    const nbCells = new Set(Object.keys(s.notices));
    for (const [k, t] of [...touched]) {
      const touchesNotice = t.cells.some((c) => cfg.neighborsOf(c).some((n) => nbCells.has(n)));
      if (!touchesNotice && !s.open.some((o) => o.scopeKey === k)) touched.delete(k);
    }
  }

  const prevLevels = s.scopeLevels;
  // Local hints (same parent, R7.5) use each scope's base level: the level without any hint, a pure function of that
  // scope's events and the time. Hints therefore never chain, and they do not lag behind the evaluation order (A12).
  const baseLevels: Record<ScopeKey, ScopeLevel> = { ...s.baseLevels };
  const localLevel = (cell: string, own: ReadonlySet<string>): ScopeLevel | undefined => {
    let best: ScopeLevel | undefined;
    for (const k of Object.keys(baseLevels).sort()) {
      const lv = baseLevels[k];
      const e = engines[k];
      // A scope that overlaps the one being evaluated pools the same phones. It is not a neighbor and must not hint it.
      if (!e?.cells.includes(cell) || lv.level === 'NORMAL' || e.cells.some((c) => own.has(c))) continue;
      if (
        !best ||
        (lv.level === 'CONFIRMED' && best.level !== 'CONFIRMED') ||
        (lv.level === best.level && lv.maxK > best.maxK)
      )
        best = lv;
    }
    return best;
  };

  // Engines. A new GROUP engine is built by replaying the pooled events (design section 6).
  const evaluated: ScopeKey[] = [];
  const engines: Record<ScopeKey, ScopeEngine> = { ...s.engines };
  type RunResult = {
    decisions: EngineDecision[];
    pushes: ReturnType<typeof evaluate>['outputs']['pushes'];
    level: Level;
    maxK: number;
  };
  const results = new Map<ScopeKey, RunResult>();
  const contextFor = (ref: { kind: ScopeKind; cells: readonly string[] }): Context => {
    const cells = new Set(ref.cells);
    const linkedCells =
      ref.kind === 'CELL'
        ? (s.groups.find((g) => g.cells.includes(ref.cells[0]))?.cells.filter((c) => c !== ref.cells[0]) ?? [])
        : [];
    return buildContext({
      scopeCells: ref.cells,
      nowMs,
      notices: new Map(Object.entries(s.notices)),
      neighborsOf: cfg.neighborsOf,
      localLevels: new Map(
        [...ref.cells.flatMap((c) => cfg.neighborsOf(c)), ...linkedCells].flatMap((c) => {
          const lv = localLevel(c, cells);
          return lv ? [[c, lv] as const] : [];
        }),
      ),
      linkedCells,
      manualInstalls: 0, // R8.3: zero until the manual-report spec defines storage
    });
  };
  /** mode: 'feed' = this request's new events, 'replay' = the whole log (new GROUP), 'rehint' = no new events. */
  const run = (ref: ScopeRef, mode: 'feed' | 'replay' | 'rehint'): void => {
    const cells = new Set(ref.cells);
    const prev = engines[ref.key] ?? { kind: ref.kind, cells: [...ref.cells], state: initialState() };
    const evSrc = mode === 'replay' ? s.log : mode === 'feed' ? feed : [];
    const lbSrc = mode === 'replay' ? s.labels : mode === 'feed' ? feedLabels : [];
    const events = evSrc.filter((e) => inScope(cells, e)).map(toEngineEvent);
    const labels = lbSrc.filter((l) => cells.has(l.cell)).map(toEngineLabel);
    const context = contextFor(ref);
    const r = evaluate(prev.state, { events, labels, context, nowMs }, cfg.params);
    engines[ref.key] = { kind: ref.kind, cells: [...ref.cells], state: r.state, ctx: JSON.stringify(context) };
    const open = [...latestPerOutage(r.outputs.decisions).values()].filter((d) => d.status === 'OPEN');
    const maxK = Math.max(0, ...open.map((d) => d.explanation.k));
    baseLevels[ref.key] = baseLevelOf(r.outputs.decisions, maxK);
    const earlier = results.get(ref.key);
    results.set(ref.key, {
      decisions: r.outputs.decisions,
      // Pushes of an earlier run in this request are kept; the engine records them, so a re-run never repeats one.
      pushes: [...(earlier?.pushes ?? []), ...r.outputs.pushes],
      level: r.outputs.areaStatus.level,
      maxK,
    });
    evaluated.push(ref.key);
  };
  for (const ref of [...touched.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) run(ref, 'feed');

  // Records, history, open outages and links from this evaluation.
  const windowMs = cfg.params.windowMs;
  const newRecords: OutageRecord[] = [];
  const history = { ...s.history };
  const openNow = s.open.filter((o) => !results.has(o.scopeKey));
  const candidates: PushCandidate[] = [];
  const absorb = (keys: readonly ScopeKey[]): void => {
    for (const key of keys) {
      const res = results.get(key);
      if (!res) continue;
      for (let i = openNow.length - 1; i >= 0; i--) if (openNow[i].scopeKey === key) openNow.splice(i, 1);
      const eng = engines[key];
      const cells = new Set(eng.cells);
      const latest = latestPerOutage(res.decisions);
      if (deleteId === null) {
        // An outage that left the engine without a close record (for example after a re-evaluation) is not shown as open.
        for (const [hk, h] of Object.entries(history)) {
          if (h.scopeKey === key && h.endMs === null && !latest.has(hk.slice(key.length + 1))) delete history[hk];
        }
      }
      for (const d of latest.values()) {
        const end = d.status === 'OPEN' ? null : (d.restoredAtMs ?? d.decisionTimeMs);
        // R12.2: a deletion never rewrites the public history.
        if (deleteId === null) {
          history[`${key}|${d.outageId}`] = {
            scopeKey: key,
            startMs: d.startMs,
            endMs: end,
            level: d.level,
            precision: PRECISION_OF[eng.kind],
          };
        }
        if (d.status === 'OPEN')
          openNow.push({ outageId: d.outageId, scopeKey: key, startMs: d.startMs, level: d.level });
        // Private per-cell drop counts for linking: installs with an UNPLUG at the start of the outage (design section 6).
        const drops: Record<string, Set<string>> = {};
        for (const e of s.log) {
          if (e.type !== 'UNPLUG' || !cells.has(e.cell)) continue;
          if (e.eventTimeMs < d.startMs || e.eventTimeMs > d.startMs + windowMs) continue;
          const set = drops[e.cell] ?? new Set<string>();
          set.add(e.installId);
          drops[e.cell] = set;
        }
        const dropsByCell = Object.fromEntries(Object.entries(drops).map(([c, ids]) => [c, ids.size]));
        if (Object.keys(dropsByCell).length >= 2)
          newRecords.push({ outageKey: `${key}|${d.outageId}`, startMs: d.startMs, dropsByCell });
        // Push candidates, one per cell the outage touched (R10.1).
        const touchedCells = Object.keys(dropsByCell).length > 0 ? Object.keys(dropsByCell) : [...eng.cells];
        for (const p of res.pushes.filter((x) => x.outageId === d.outageId)) {
          for (const cell of touchedCells) {
            candidates.push({
              cell,
              kind: p.kind,
              startMs: d.startMs,
              endMs: p.kind === 'RESTORED' ? (d.restoredAtMs ?? d.decisionTimeMs) : null,
            });
          }
        }
      }
      // Closed outages the engine already archived this round still count for history.
      for (const a of engines[key].state.archive) {
        history[`${key}|${a.id}`] ??= {
          scopeKey: key,
          startMs: a.startMs,
          endMs: a.endMs,
          level: a.level,
          precision: PRECISION_OF[eng.kind],
        };
      }
    }
  };
  absorb([...results.keys()]);
  // Links and groups from the outage records (R6). Pure function of the records in the trailing 7 days.
  const byKey = new Map(s.records.map((r) => [r.outageKey, r]));
  for (const r of newRecords) byKey.set(r.outageKey, r);
  s.records = pruneRecords([...byKey.values()], nowMs);
  const pairs = linkedPairs(coalesceOutages(s.records, windowMs), nowMs, cfg.parentOf);
  const lc = diffLinks(s.links, pairs);
  if (lc.formed.length > 0) s.counters = bump(s.counters, 'links_formed', lc.formed.length);
  if (lc.removed.length > 0) s.counters = bump(s.counters, 'links_removed', lc.removed.length);
  s.links = pairs;
  const nextGroups = groupsFromLinks(pairs);
  const plan = planGroups(s.groups, nextGroups);
  const pinned = new Set(openNow.map((o) => o.scopeKey));
  const nextKeys = new Set(nextGroups.map((g) => groupKey(g.cells)));
  // A dissolved group with an open outage keeps its scope until the outage closes (R4.5).
  const carried = s.groups.filter(
    (g) => plan.retire.includes(groupKey(g.cells)) && pinned.has(groupKey(g.cells)) && !nextKeys.has(groupKey(g.cells)),
  );
  for (const key of plan.retire) if (!pinned.has(key)) delete engines[key];
  s.groups = [...nextGroups, ...carried].sort((a, b) => (groupKey(a.cells) < groupKey(b.cells) ? -1 : 1));
  for (const g of plan.create) {
    const ref: ScopeRef = { kind: 'GROUP', key: groupKey(g.cells), precision: 'LINKED', cells: [...g.cells].sort() };
    delete engines[ref.key];
    run(ref, 'replay');
    absorb([ref.key]);
  }

  // Re-hint (A12): a scope whose local hint context changed because another scope's base level changed is evaluated
  // again on its retained events. Base levels do not depend on hints, so one pass reaches the fixed point.
  for (const k of Object.keys(engines).sort()) {
    const eng = engines[k];
    if (eng.ctx === JSON.stringify(contextFor(eng))) continue;
    run(scopeRefOf(k, eng), 'rehint');
    absorb([k]);
  }
  for (const k of Object.keys(baseLevels)) if (!engines[k]) delete baseLevels[k];
  s.baseLevels = baseLevels;
  s.open = openNow.filter(
    (o, i, all) => all.findIndex((x) => x.scopeKey === o.scopeKey && x.outageId === o.outageId) === i,
  );
  s.engines = engines;

  // Public levels, notices (R7.1, R7.2), views (R9) and pushes (R10).
  const scopeLevels: Record<ScopeKey, ScopeLevel> = {};
  for (const k of Object.keys(engines)) {
    const res = results.get(k);
    scopeLevels[k] = res ? { level: res.level, maxK: res.maxK } : (prevLevels[k] ?? { level: 'NORMAL', maxK: 0 });
  }
  const changes: ScopeLevelChange[] = [];
  for (const [k, eng] of Object.entries(engines)) {
    const prev = prevLevels[k]?.level ?? 'NORMAL';
    const cur = scopeLevels[k];
    if (cur.level === prev) continue;
    changes.push({
      cells: eng.cells,
      public: memberCountIn(s, eng.kind === 'PARENT' ? cfg.childrenOf(s.parent) : eng.cells) >= MIN_PUBLIC_MEMBERS,
      prevLevel: prev,
      level: cur.level,
      maxK: cur.maxK,
      asOfMs: nowMs,
    });
  }
  s.scopeLevels = scopeLevels;
  const notices = planNotices(s.parent, changes, (c) => cfg.neighborsOf(c), cfg.parentOf);
  if (notices.length > 0)
    s.counters = bump(
      s.counters,
      'notices_sent',
      notices.reduce((n, b) => n + b.notices.length, 0),
    );

  const pushed = applyPushes(s.episodes, candidates);
  s.episodes = pruneEpisodes(pushed.episodes, nowMs);

  // Retention: nothing older than the engine horizon, except what the engines archive (R12.3).
  const horizon = nowMs - cfg.params.horizonMs;
  s.log = s.log.filter((e) => e.eventTimeMs >= horizon);
  s.labels = s.labels.filter((l) => s.log.some((e) => e.installId === l.installId && e.seq === l.unplugSeq));
  s.notices = Object.fromEntries([...pruneNotices(new Map(Object.entries(s.notices)), nowMs)]);
  for (const [k, h] of Object.entries(history)) if ((h.endMs ?? h.startMs) < nowMs - HISTORY_MS) delete history[k];
  s.history = history;
  for (const k of Object.keys(s.engines)) {
    if (
      memberCountIn(s, s.engines[k].cells) === 0 &&
      !s.open.some((o) => o.scopeKey === k) &&
      s.engines[k].kind !== 'PARENT'
    ) {
      // R12.3: remove state for empty scopes.
      if (!touched.has(k)) delete s.engines[k];
    }
  }
  s.counters = bump(s.counters, 'evaluations', evaluated.length);

  const views: ScopeView[] = Object.entries(s.engines).map(([k, eng]) => ({
    scopeKey: k,
    view: buildPublicView({
      scopeKind: eng.kind,
      parent: s.parent,
      cells: eng.cells,
      members: memberCountIn(s, eng.kind === 'PARENT' ? cfg.childrenOf(s.parent) : eng.cells),
      outages: Object.values(s.history)
        .filter((h) => h.scopeKey === k)
        .map((h) => ({ startMs: h.startMs, endMs: h.endMs, level: h.level, precision: h.precision })),
      nowMs,
    }),
  }));

  return {
    state: s,
    out: {
      pushes: pushed.passed,
      notices,
      removals,
      views,
      nextAlarmMs: nextAlarm(s, cfg),
      evaluated,
      rejected,
    },
  };
}

/** Earliest of: the flush of queued state events, and the first open outage reaching the unknown-end limit (R11.5). */
export function nextAlarm(s: AreaState, cfg: Pick<AreaConfig, 'params' | 'stateFlushMs'>): number | null {
  const times: number[] = [];
  if (s.pendingSinceMs !== null) times.push(s.pendingSinceMs + cfg.stateFlushMs);
  for (const o of s.open) times.push(o.startMs + cfg.params.unknownEndMs);
  return times.length === 0 ? null : Math.min(...times);
}

/** The scopes with an open outage, for the selector (task 4). */
export function openOutages(s: AreaState): OpenOutage[] {
  const out: OpenOutage[] = [];
  for (const o of s.open) {
    const e = s.engines[o.scopeKey];
    if (e) out.push({ outageId: o.outageId, level: o.level, scope: scopeRefOf(o.scopeKey, e) });
  }
  return out;
}

export { cellKey, parentKey };
