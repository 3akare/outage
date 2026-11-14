import type { AreaActor } from './area-actor.ts';
import type { RegistryActor } from './registry-actor.ts';

export interface Env {
  AREA: DurableObjectNamespace<AreaActor>;
  REGISTRY: DurableObjectNamespace<RegistryActor>;
  INSTALL_TOKEN_SECRET?: string; // wrangler secret put INSTALL_TOKEN_SECRET (never in the repo)
  STATE_FLUSH_MS?: string; // optional override of the flush interval, used by the integration test; unset in production
}

/** The one registry instance: revocations and daily counters (ADR 0003 addendum). */
export const REGISTRY_NAME = 'registry';
