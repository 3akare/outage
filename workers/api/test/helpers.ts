import { latLngToCell, cellToChildren } from 'h3-js';
import { res7Parent, type WireEvent } from '@outage/shared';
import type { InstallState } from '../src/ingest/armed.ts';
import { AreaCore, type AreaIngestInput, type AreaResponse, type AreaStore, type DetectionRow } from '../src/area/core.ts';
import { CONFIG, type Tunables } from '../src/config.ts';
import type { Deps } from '../src/ingest/handlers.ts';
import { RegisterLimiter } from '../src/ingest/limiter.ts';
import { type OfferRow, type PairRow, PairingCore, type PairStore } from '../src/pairing/core.ts';
import { forwardable } from '../src/home/forward.ts';
import { HomeCore, type StationRow } from '../src/home/core.ts';
import { HomeViewCache } from '../src/home/cache.ts';
import type { HomeKind } from '../src/home/planner.ts';
import type { FcmOutgoing, PushSender, SendResult } from '../src/alerts/fcm.ts';
import { NoopDetectionPort } from '../src/ingest/ports.ts';
import { fieldDump, uploadDay } from '../src/telemetry/core.ts';
import { mintToken } from '../src/ingest/token.ts';
import { MemoryTelemetryStore } from './telemetry-store.ts';
import { AlertsCore } from '../src/alerts/core.ts';
import { MemAlertsStore } from './alerts-memory-store.ts';

export const SECRET = 'test-secret';
export const FIELD_BEARER = 'field-test-bearer';
export const ID = 'kg4yq7mxwb2ndpr3tfhj5vcsaz';
export const CELL = latLngToCell(6.5244, 3.3792, 8);
export const PARENT = res7Parent(CELL);
/** The seven res-8 children of PARENT: events for all of them route to one actor. */
export const SIBLINGS = cellToChildren(PARENT, 8);
export const NOW = 1_800_000_000_000;

/** Roomy limits so properties about idempotency and write-behind are not confused with rate limiting. */
export const ROOMY: Tunables = { ...CONFIG, BUCKET_CAPACITY: 1_000_000, MAX_BATCH_EVENTS: 1000, MAX_BODY_BYTES: 4_000_000, TELEMETRY_PER_INSTALL_PER_HOUR: 1_000_000 };

export class MemoryStore implements AreaStore {
  detection = new Map<string, DetectionRow>();
  installs = new Map<string, InstallState>();
  meta = new Map<string, string>();
  installWrites = 0;
  hasDetection(i: string, s: number) {
    return this.detection.has(`${i}|${s}`);
  }
  insertDetection(r: DetectionRow) {
    const k = `${r.installId}|${r.seq}`;
    if (this.detection.has(k)) return 0;
    this.detection.set(k, r);
    return 1;
  }
  getInstall(i: string) {
    return this.installs.get(i);
  }
  putInstall(i: string, s: InstallState) {
    this.installs.set(i, s);
    this.installWrites += 1;
    return 1;
  }
  deleteInstall(i: string) {
    let n = this.installs.delete(i) ? 1 : 0;
    for (const k of [...this.detection.keys()]) {
      if (!k.startsWith(`${i}|`)) continue;
      this.detection.delete(k);
      n++;
    }
    return n;
  }
  prune(before: number) {
    let n = 0;
    for (const [k, r] of this.detection) {
      if (r.receiveTimeMs >= before) continue;
      this.detection.delete(k);
      n++;
    }
    for (const [k, s] of this.installs) {
      if (s.lastSeenMs >= before) continue;
      this.installs.delete(k);
      n++;
    }
    return n;
  }
  getMeta(k: string) {
    return this.meta.get(k);
  }
  setMeta(k: string, v: string) {
    this.meta.set(k, v);
    return 1;
  }
}

/** A push sender that records what it was given and answers from a script (default: ok). */
export class FakeSender implements PushSender {
  sent: FcmOutgoing[] = [];
  results: SendResult[] = [];
  async send(msg: FcmOutgoing): Promise<SendResult> {
    this.sent.push(msg);
    return this.results.shift() ?? { kind: 'ok', name: 'projects/x/messages/1' };
  }
}

export class MemoryPairStore implements PairStore {
  offers = new Map<string, OfferRow>();
  pairs = new Map<string, PairRow>();
  stations = new Map<string, StationRow>();
  sentKeys = new Set<string>();
  stationWrites = 0;
  listStations() {
    return [...this.stations.values()];
  }
  putStation(row: StationRow) {
    this.stations.set(row.stationInstall, row);
    this.stationWrites += 1;
    return 1;
  }
  deleteStation(id: string) {
    return this.stations.delete(id) ? 1 : 0;
  }
  pairsOfStation(id: string) {
    return [...this.pairs.values()].filter((p) => p.stationInstall === id);
  }
  hasSent(pairId: string, version: number, kind: HomeKind) {
    return this.sentKeys.has(`${pairId}|${version}|${kind}`);
  }
  markSent(pairId: string, version: number, kind: HomeKind) {
    this.sentKeys.add(`${pairId}|${version}|${kind}`);
    return 1;
  }
  pruneSent(before: number) {
    let n = 0;
    for (const k of [...this.sentKeys]) if (Number(k.split('|')[1]) < before) n += this.sentKeys.delete(k) ? 1 : 0;
    return n;
  }
  markPushFailed(pairId: string, at: number) {
    const p = this.pairs.get(pairId);
    if (!p || p.pushFailedMs !== null) return 0;
    this.pairs.set(pairId, { ...p, pushFailedMs: at });
    return 1;
  }
  removePairsFailedBefore(before: number) {
    return this.dropPairs((p) => p.pushFailedMs !== null && p.pushFailedMs < before);
  }
  getOffer(key: string) {
    return this.offers.get(key);
  }
  putOffer(row: OfferRow) {
    this.offers.set(row.key, row);
  }
  deleteOffer(key: string) {
    return this.offers.delete(key) ? 1 : 0;
  }
  deleteOffersOfStation(id: string) {
    return this.dropOffers((o) => o.stationInstall === id);
  }
  deleteExpiredOffers(now: number) {
    return this.dropOffers((o) => o.expiresMs <= now);
  }
  nextOfferExpiry() {
    const all = [...this.offers.values()].map((o) => o.expiresMs);
    return all.length ? Math.min(...all) : null;
  }
  countViewers(station: string, except: string) {
    return [...this.pairs.values()].filter((p) => p.stationInstall === station && p.viewerInstall !== except).length;
  }
  getPair(id: string) {
    return this.pairs.get(id);
  }
  putPair(row: PairRow) {
    this.pairs.set(row.pairId, row);
  }
  deletePair(id: string) {
    return this.dropPairs((p) => p.pairId === id);
  }
  deletePairsBetween(station: string, viewer: string) {
    return this.dropPairs((p) => p.stationInstall === station && p.viewerInstall === viewer);
  }
  deleteInstall(id: string) {
    const stations = this.stations.delete(id) ? 1 : 0;
    return this.dropOffers((o) => o.stationInstall === id) + stations + this.dropPairs((p) => p.stationInstall === id || p.viewerInstall === id);
  }
  private dropOffers(f: (o: OfferRow) => boolean) {
    let n = 0;
    for (const [k, o] of this.offers) if (f(o)) n += this.offers.delete(k) ? 1 : 0;
    return n;
  }
  private dropPairs(f: (p: PairRow) => boolean) {
    let n = 0;
    for (const [k, p] of this.pairs) {
      if (!f(p)) continue;
      n += this.pairs.delete(k) ? 1 : 0;
      for (const s of [...this.sentKeys]) if (s.startsWith(`${k}|`)) this.sentKeys.delete(s);
    }
    return n;
  }
}

export function makeCore(cfg: Tunables = CONFIG) {
  const store = new MemoryStore();
  const port = new NoopDetectionPort();
  return { store, port, core: new AreaCore(store, port, cfg) };
}

/** A whole Worker in memory: one AreaCore per parent, a revocation set, a settable clock. */
export function makeWorld(cfg: Tunables = ROOMY, secret: string | null = SECRET) {
  const areas = new Map<string, ReturnType<typeof makeCore>>();
  const areaCalls: { parent: string; input: AreaIngestInput }[] = [];
  const revoked = new Set<string>();
  const shards = new Map<string, { store: MemoryPairStore; core: PairingCore; home: HomeCore }>();
  const sender = new FakeSender();
  const watched = new Map<string, Map<string, string>>(); // parent -> install -> shard (the area actor's WatchList)
  const homeCache = new HomeViewCache();
  const telemetryStore = new MemoryTelemetryStore();
  const alertStores = new Map<string, MemAlertsStore>();
  const alertsOf = (parent: string) => {
    let a = alertStores.get(parent);
    if (!a) {
      a = new MemAlertsStore();
      alertStores.set(parent, a);
    }
    return a;
  };
  const world = {
    telemetryStore,
    alertsOf,
    now: NOW,
    sender,
    watched,
    shards,
    shard(name: string) {
      let s = shards.get(name);
      if (!s) {
        const store = new MemoryPairStore();
        s = { store, core: new PairingCore(store, cfg), home: new HomeCore(store, sender, world.now) };
        shards.set(name, s);
      }
      return s;
    },
    failParents: new Set<string>(),
    failShards: new Set<string>(),
    areaCalls,
    areas,
    revoked,
    area(parent: string) {
      let a = areas.get(parent);
      if (!a) {
        a = makeCore(cfg);
        areas.set(parent, a);
      }
      return a;
    },
    deps: undefined as unknown as Deps,
  };
  world.deps = {
    secret: secret ?? undefined,
    fieldToken: FIELD_BEARER as string | undefined,
    telemetryLimiter: new RegisterLimiter(cfg.TELEMETRY_PER_INSTALL_PER_HOUR),
    telemetry: {
      async putDay(d) {
        uploadDay(telemetryStore, d, world.now);
      },
      async deleteInstall(id) {
        return telemetryStore.deleteInstall(id);
      },
      async field(day) {
        return fieldDump(telemetryStore, day, cfg.TELEMETRY_SILENT_LOOKBACK_DAYS);
      },
    },
    now: () => world.now,
    randomBytes: (n) => new Uint8Array(n).map((_, i) => (i * 37 + world.now) & 255),
    sourceKey: (req) => req.headers.get('x-source') ?? 'src',
    limiter: new RegisterLimiter(cfg.REGISTER_PER_SOURCE_PER_HOUR),
    cfg,
    area: {
      async ingest(parent, input): Promise<AreaResponse> {
        areaCalls.push({ parent, input });
        if (world.failParents.has(parent)) throw new Error('actor down');
        const res = await world.area(parent).core.ingest(input);
        // The area actor's forwarding to the pairing shard (workers/api/src/area/actor.ts `forwardToHome`).
        const watch = watched.get(parent) ?? new Map<string, string>();
        for (const [install, events] of forwardable(watch, input.events, res.results)) {
          const needed = await world.shard(watch.get(install) as string).home.observe(install, events, input.receiveTimeMs);
          if (!needed) watch.delete(install);
        }
        return res;
      },
      async watchStation(parent, installId, shard) {
        const m = watched.get(parent) ?? new Map<string, string>();
        m.set(installId, shard);
        watched.set(parent, m);
      },
      async deleteInstall(parent, installId) {
        if (world.failParents.has(parent)) throw new Error('actor down');
        watched.get(parent)?.delete(installId);
        return world.area(parent).core.deleteInstall(installId) + alertsOf(parent).deleteInstall(installId);
      },
    },
    alerts: {
      async follow(parent, request) {
        if (world.failParents.has(parent)) throw new Error('actor down');
        new AlertsCore(alertsOf(parent)).follow(request, world.now);
      },
      async unfollow(parent, installId, cell) {
        new AlertsCore(alertsOf(parent)).unfollow(installId, cell);
      },
    },
    followLimiter: new RegisterLimiter(cfg.FOLLOW_PER_INSTALL_PER_HOUR),
    pairing: {
      async createOffer(shard, input) {
        return world.shard(shard).core.createOffer(input);
      },
      async claim(shard, input) {
        return world.shard(shard).core.claim(input);
      },
      async removePair(shard, pairId, installId) {
        const s = world.shard(shard);
        const pair = s.store.getPair(pairId);
        const removed = s.core.removePair(pairId, installId);
        if (removed && pair) s.home.dropIfUnpaired(pair.stationInstall);
        return removed;
      },
      async deleteInstall(shard, installId) {
        if (world.failShards.has(shard)) throw new Error('shard down');
        const s = world.shard(shard);
        const n = s.core.deleteInstall(installId);
        s.home.forget(installId);
        s.home.sweep();
        return n;
      },
      async home(shard, pairId, viewerInstall, nowMs) {
        const hit = homeCache.get(pairId, viewerInstall, nowMs);
        if (hit) return hit;
        const view = world.shard(shard).home.view(pairId, viewerInstall, nowMs);
        if (view) homeCache.put(pairId, viewerInstall, view, nowMs);
        return view;
      },
      forgetPair: (pairId) => homeCache.drop(pairId),
    },
    registry: {
      async isRevoked(id) {
        return revoked.has(id);
      },
      async revoke(id) {
        revoked.add(id);
      },
      async stats() {
        return { day: 0, rowsWritten: 0, counters: {} };
      },
    },
  } satisfies Deps;
  return world;
}

export async function post(path: string, body: unknown, token?: string, headers: Record<string, string> = {}): Promise<Request> {
  const h: Record<string, string> = { ...headers };
  if (token !== undefined) h.authorization = `Bearer ${token}`;
  return new Request(`https://api.test${path}`, { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

export const tokenFor = (id = ID) => mintToken(SECRET, id);

export function wire(over: Partial<WireEvent> & { seq: number }): WireEvent {
  return { installId: ID, type: 'UNPLUG', elapsedMs: 1000, cell: CELL, confidence: 'HIGH', timeQuality: 'OK', ...over } as WireEvent;
}
