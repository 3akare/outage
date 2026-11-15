import { latLngToCell, cellToChildren } from 'h3-js';
import { res7Parent, type WireEvent } from '@outage/shared';
import type { InstallState } from '../src/armed.ts';
import { AreaCore, type AreaIngestInput, type AreaResponse, type AreaStore, type DetectionRow } from '../src/area-core.ts';
import { CONFIG, type Tunables } from '../src/config.ts';
import type { Deps } from '../src/handlers.ts';
import { RegisterLimiter } from '../src/limiter.ts';
import { NoopDetectionPort } from '../src/ports.ts';
import { fieldDump, uploadDay } from '../src/telemetry/core.ts';
import { mintToken } from '../src/token.ts';
import { MemoryTelemetryStore } from './telemetry-store.ts';

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
  const telemetryStore = new MemoryTelemetryStore();
  const world = {
    telemetryStore,
    now: NOW,
    failParents: new Set<string>(),
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
        return world.area(parent).core.ingest(input);
      },
      async deleteInstall(parent, installId) {
        if (world.failParents.has(parent)) throw new Error('actor down');
        return world.area(parent).core.deleteInstall(installId);
      },
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
