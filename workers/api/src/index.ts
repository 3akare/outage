// Outage ingest Worker (event-ingest). Stateless: routes to area actors (res-7 parents) and the registry.
// Platform notes: https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/
import { AreaActor } from './area-actor.ts';
import { CONFIG } from './config.ts';
import type { Env } from './env.ts';
import { REGISTRY_NAME } from './env.ts';
import { type Deps, handleRequest } from './handlers.ts';
import { RegisterLimiter } from './limiter.ts';
import { RevocationCache } from './registry.ts';
import { RegistryActor } from './registry-actor.ts';
import { hashInstallId } from './token.ts';
import { PublicIndex } from './web/index-actor.ts';

export type { Env };
export { AreaActor, PublicIndex, RegistryActor };

// Isolate-level state: lenient after an isolate restart, never stricter (same direction as the actors' memory state).
const limiter = new RegisterLimiter(CONFIG.REGISTER_PER_SOURCE_PER_HOUR);
let cache: RevocationCache | undefined;

function makeDeps(env: Env): Deps {
  const registry = () => env.REGISTRY.get(env.REGISTRY.idFromName(REGISTRY_NAME));
  cache ??= new RevocationCache(CONFIG.REVOCATION_CACHE_MS, () => registry().revokedHashes(Date.now()));
  const revocations = cache;
  return {
    secret: env.INSTALL_TOKEN_SECRET,
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, makeDeps(env));
  },
} satisfies ExportedHandler<Env>;
