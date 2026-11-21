import type { AreaActor } from './api/area/actor.ts';
import type { RegistryActor } from './api/registry/actor.ts';
import type { TelemetryActor } from './api/telemetry/actor.ts';
import type { PublicIndex } from './api/public-index/actor.ts';

export interface Env {
  /** This deploy's version (wrangler.jsonc version_metadata); keys the page cache so a deploy shows at once. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  AREA: DurableObjectNamespace<AreaActor>;
  REGISTRY: DurableObjectNamespace<RegistryActor>;
  PUBLIC_INDEX: DurableObjectNamespace<PublicIndex>;
  TELEMETRY: DurableObjectNamespace<TelemetryActor>;
  FIELD_READ_TOKEN?: string; // wrangler secret put FIELD_READ_TOKEN (never in the repo); protects GET /v1/admin/field/:day
  FCM_SERVICE_ACCOUNT?: string; // wrangler secret put FCM_SERVICE_ACCOUNT (the Firebase service-account JSON, never in the repo)
  INSTALL_TOKEN_SECRET?: string; // wrangler secret put INSTALL_TOKEN_SECRET (never in the repo)
  // Public site configuration (web-and-area-pages R7.4): plain vars, set by the release-apk skill. Unset = left out.
  SITE_ORIGIN?: string; // e.g. https://outage.example; defaults to the request's origin
  APK_URL?: string;
  /** Google Play listing. Unset until the app is listed; the landing page then hides the button. */
  PLAY_URL?: string;
  /** Aptoide listing. Unset until the app is listed; the landing page then hides the button. */
  APTOIDE_URL?: string;
  APK_VERSION?: string;
  APK_SIZE_BYTES?: string;
  APK_SHA256?: string;
  STATE_FLUSH_MS?: string; // optional override of the flush interval, used by the integration test; unset in production
}

/** The one registry instance: revocations and daily counters (ADR 0003 addendum). */
export const REGISTRY_NAME = 'registry';

/** The one telemetry instance: device-day rows, outage and miss records (field-telemetry R3.2). */
export const TELEMETRY_NAME = 'telemetry';
