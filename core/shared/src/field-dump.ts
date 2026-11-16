// The admin endpoint's answer for one day (field-telemetry R6.6, R7.3, design section 4). Shared by the Worker that builds
// it and by tools/field that reads it. No install ID, no cell: devices carry per-request aliases only.
import type { DeviceDay, Maker } from './device-day.ts';
import type { MissRecordOut, OutageRecordOut } from './field-outage.ts';

export const ALIAS_PATTERN = /^D[1-9]\d{0,3}$/;

/** A device-day with the install ID replaced by an alias that is valid for this response only. */
export type AliasedDeviceDay = Omit<DeviceDay, 'installId'> & { alias: string };

/** A phone that uploaded in the 7 days before `day` but not on `day` (input to the UPLOAD_GAP check). */
export interface SilentDevice {
  alias: string;
  maker: Maker;
  androidMajor: number;
  /** Local date of its newest upload before `day`. */
  lastDay: string;
}

export interface FieldDump {
  v: 1;
  day: string;
  devices: AliasedDeviceDay[];
  silent: SilentDevice[];
  /** Outages whose start falls in the UTC day `day`. */
  outages: OutageRecordOut[];
  /** Misses whose unplug falls in the UTC day `day`. */
  misses: MissRecordOut[];
}

/** Aliases D1, D2, ... in the order of the sorted install IDs, so one request is stable. The map is never stored. */
export function assignAliases(installIds: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of [...new Set(installIds)].sort()) out.set(id, `D${out.size + 1}`);
  return out;
}
