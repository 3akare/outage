import type { AreaPush, Subscription } from '../src/alerts/planner.ts';
import { CELL, ID, NOW } from './helpers.ts';

const TOKEN = 'x'.repeat(40); // built at run time, not a real token

export const sub = (over: Partial<Subscription> = {}): Subscription => ({
  installId: ID,
  cell: CELL,
  fcmToken: TOKEN,
  kinds: ['CONFIRMED', 'RESTORED'],
  quietStartMin: null,
  quietEndMin: null,
  tzOffsetMin: 0,
  createdMs: NOW,
  ...over,
});
export const push = (over: Partial<AreaPush> = {}): AreaPush => ({
  cell: CELL,
  episodeId: `${CELL}|1`,
  kind: 'CONFIRMED',
  decisionTimeMs: NOW,
  precision: 'CELL',
  ...over,
});
