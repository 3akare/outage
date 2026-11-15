// Outage ingest Worker (event-ingest). Stateless: routes to area actors (res-7 parents) and the registry.
// Platform notes: https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/
import { AreaActor } from './area-actor.ts';
import { CONFIG } from './config.ts';
import type { Env } from './env.ts';
import { REGISTRY_NAME, TELEMETRY_NAME } from './env.ts';
import { type Deps, handleRequest } from './handlers.ts';
import { RegisterLimiter } from './limiter.ts';
import { PairingActor } from './pairing-actor.ts';
import { RevocationCache } from './registry.ts';
import { RegistryActor } from './registry-actor.ts';
import { TelemetryActor } from './telemetry/actor.ts';
import { hashInstallId } from './token.ts';
import replayFile from '@outage/shared/fixtures/replay.json' with { type: 'json' };
import { PageCache } from './web/cache.ts';
import { CATALOG, LISTED_AREAS } from './web/catalog/index.ts';
import { PublicIndex } from './web/index-actor.ts';
import { INDEX_NAME } from './web/index-core.ts';
import { indexReader } from './web/index-reader.ts';
import type { ReplayData } from './web/judge.ts';
import { handleWeb, isWebPath, type WebDeps } from './web/routes.ts';

export type { Env };
export { AreaActor, PairingActor, PublicIndex, RegistryActor, TelemetryActor };

// Isolate-level state: lenient after an isolate restart, never stricter (same direction as the actors' memory state).
const limiter = new RegisterLimiter(CONFIG.REGISTER_PER_SOURCE_PER_HOUR);
const telemetryLimiter = new RegisterLimiter(CONFIG.TELEMETRY_PER_INSTALL_PER_HOUR); // keyed by install ID, memory only
let cache: RevocationCache | undefined;

function makeDeps(env: Env): Deps {
  const telemetryActor = () => env.TELEMETRY.get(env.TELEMETRY.idFromName(TELEMETRY_NAME));
  const registry = () => env.REGISTRY.get(env.REGISTRY.idFromName(REGISTRY_NAME));
  cache ??= new RevocationCache(CONFIG.REVOCATION_CACHE_MS, () => registry().revokedHashes(Date.now()));
  const revocations = cache;
  return {
    secret: env.INSTALL_TOKEN_SECRET,
    fieldToken: env.FIELD_READ_TOKEN,
    telemetryLimiter,
    telemetry: {
      putDay: (d) => telemetryActor().putDay(d),
      deleteInstall: (installId) => telemetryActor().deleteInstall(installId),
      field: (day) => telemetryActor().field(day),
    },
    now: () => Date.now(),
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    // R2.5 needs a per-source budget. The address is read only to be hashed with the hour into an in-memory key; it is never
    // stored or logged, and the hash cannot be reversed to an address after the hour. Flagged for the human (notes-ingest.md).
    sourceKey: async (req) =>
      hashInstallId(`${req.headers.get('cf-connecting-ip') ?? ''}|${Math.floor(Date.now() / 3_600_000)}`),
    limiter,
    cfg: CONFIG,
    area: {
      ingest: (parent, input) => env.AREA.get(env.AREA.idFromName(parent)).ingest(input),
      deleteInstall: (parent, installId) => env.AREA.get(env.AREA.idFromName(parent)).deleteInstall(installId),
    },
    pairing: {
      createOffer: (shard, input) => env.PAIRING.get(env.PAIRING.idFromName(shard)).createOffer(input),
      claim: (shard, input) => env.PAIRING.get(env.PAIRING.idFromName(shard)).claim(input),
      removePair: (shard, pairId, installId) => env.PAIRING.get(env.PAIRING.idFromName(shard)).removePair(pairId, installId),
      deleteInstall: (shard, installId) => env.PAIRING.get(env.PAIRING.idFromName(shard)).deleteInstall(installId),
    },
    registry: {
      isRevoked: async (installId) => revocations.has(await hashInstallId(installId), Date.now()),
      revoke: async (installId) => {
        const hash = await hashInstallId(installId);
        await registry().revoke(hash, Date.now());
        revocations.add(hash);
      },
      stats: () => registry().stats(Date.now()),
    },
  };
}

// Cache API (`caches.default`): https://developers.cloudflare.com/workers/runtime-apis/cache/ . The isolate fallback in
// PageCache covers runtimes and domains where it does not store (R9.2).
let pageCache: PageCache | undefined;

function webDeps(req: Request, env: Env): WebDeps {
  pageCache ??= new PageCache({ cache: typeof caches === 'undefined' ? null : caches.default });
  const origin = (env.SITE_ORIGIN ?? new URL(req.url).origin).replace(/\/$/, '');
  const apkUrl = env.APK_URL ? env.APK_URL : null;
  return {
    site: { origin, apkUrl },
    install: apkUrl
      ? {
          apkUrl,
          version: env.APK_VERSION ?? '',
          sizeBytes: Number(env.APK_SIZE_BYTES ?? 0),
          sha256: env.APK_SHA256 ?? '',
        }
      : null,
    areas: LISTED_AREAS,
    mapAreas: CATALOG.areas,
    index: indexReader(() => env.PUBLIC_INDEX.get(env.PUBLIC_INDEX.idFromName(INDEX_NAME)).getAll()),
    cache: pageCache,
    replay: () => replayFile as unknown as ReplayData,
    now: () => Date.now(),
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (isWebPath(new URL(req.url).pathname)) return handleWeb(req, webDeps(req, env));
    return handleRequest(req, makeDeps(env));
  },
} satisfies ExportedHandler<Env>;
