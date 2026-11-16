// Follow and unfollow request shapes (alerts-and-light-alarm design 5.4, R6.2, R7.3, R10.1). Strict: any extra field,
// wrong type or out-of-range value is rejected, and nothing is stored from a rejected request. Pure.
import { isCell as isValidRes8Cell } from './h3.ts';
import { isInstallId } from './ingest.ts';

export const PUSH_KINDS = ['CONFIRMED', 'RESTORED'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** FCM registration tokens are about 160 characters in practice; the bound is generous and the alphabet is the token one. */
export const FCM_TOKEN_PATTERN = /^[A-Za-z0-9_:.-]{20,4096}$/;

export interface FollowRequest {
  installId: string;
  cell: string;
  fcmToken: string;
  kinds: PushKind[]; // non-empty, no duplicates, in the order CONFIRMED then RESTORED
  quietStartMin: number | null; // 0..1439, or null together with quietEndMin for no window
  quietEndMin: number | null;
  tzOffsetMin: number; // UTC offset in minutes, -840..840
}
export interface UnfollowRequest {
  installId: string;
  cell: string;
}

export type FollowParsed<T> = { ok: true; value: T } | { ok: false };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const minuteOfDay = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1439;
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));

const FOLLOW_KEYS = ['installId', 'cell', 'fcmToken', 'kinds', 'quietStartMin', 'quietEndMin', 'tzOffsetMin'] as const;

export function parseFollowRequest(raw: unknown): FollowParsed<FollowRequest> {
  if (!isRecord(raw) || !exactKeys(raw, FOLLOW_KEYS)) return { ok: false };
  const { installId, cell, fcmToken, kinds, quietStartMin, quietEndMin, tzOffsetMin } = raw;
  if (!isInstallId(installId) || !isValidRes8Cell(cell)) return { ok: false };
  if (typeof fcmToken !== 'string' || !FCM_TOKEN_PATTERN.test(fcmToken)) return { ok: false };
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > PUSH_KINDS.length) return { ok: false };
  if (!kinds.every((k) => PUSH_KINDS.includes(k as PushKind)) || new Set(kinds).size !== kinds.length) return { ok: false };
  const noWindow = quietStartMin === null && quietEndMin === null;
  if (!noWindow && !(minuteOfDay(quietStartMin) && minuteOfDay(quietEndMin))) return { ok: false };
  if (typeof tzOffsetMin !== 'number' || !Number.isInteger(tzOffsetMin) || tzOffsetMin < -840 || tzOffsetMin > 840) return { ok: false };
  return {
    ok: true,
    value: {
      installId,
      cell,
      fcmToken,
      kinds: PUSH_KINDS.filter((k) => kinds.includes(k)),
      quietStartMin: noWindow ? null : (quietStartMin as number),
      quietEndMin: noWindow ? null : (quietEndMin as number),
      tzOffsetMin,
    },
  };
}

export function parseUnfollowRequest(raw: unknown): FollowParsed<UnfollowRequest> {
  if (!isRecord(raw) || !exactKeys(raw, ['installId', 'cell'])) return { ok: false };
  if (!isInstallId(raw.installId) || !isValidRes8Cell(raw.cell)) return { ok: false };
  return { ok: true, value: { installId: raw.installId, cell: raw.cell } };
}
