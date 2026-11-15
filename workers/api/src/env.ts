import type { AreaActor } from './area/actor.ts';
import type { PairingActor } from './pairing/actor.ts';
import type { RegistryActor } from './registry/actor.ts';
import type { TelemetryActor } from './telemetry/actor.ts';
import type { PublicIndex } from './public-index/actor.ts';

export interface Env {
  AREA: DurableObjectNamespace<AreaActor>;
  REGISTRY: DurableObjectNamespace<RegistryActor>;
  PAIRING: DurableObjectNamespace<PairingActor>;
  PUBLIC_INDEX: DurableObjectNamespace<PublicIndex>;
  TELEMETRY: DurableObjectNamespace<TelemetryActor>;
  FIELD_READ_TOKEN?: string; // wrangler secret put FIELD_READ_TOKEN (never in the repo); protects GET /v1/admin/field/:day
  INSTALL_TOKEN_SECRET?: string; // wrangler secret put INSTALL_TOKEN_SECRET (never in the repo)
  // Public site configuration (web-and-area-pages R7.4): plain vars, set by the release-apk skill. Unset = left out.
  SITE_ORIGIN?: string; // e.g. https://outage.example; defaults to the request's origin
  APK_URL?: string;
  APK_VERSION?: string;
  APK_SIZE_BYTES?: string;
  APK_SHA256?: string;
  STATE_FLUSH_MS?: string; // optional override of the flush interval, used by the integration test; unset in production
}

/** The one registry instance: revocations and daily counters (ADR 0003 addendum). */
export const REGISTRY_NAME = 'registry';

/** The one telemetry instance: device-day rows, outage and miss records (field-telemetry R3.2). */
export const TELEMETRY_NAME = 'telemetry';
