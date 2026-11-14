import type { DeviceLog, Kind, Row } from '../src/types.ts';

/** Build a device log from short tuples: [kind, monoMs, fields?, bootCount?]. Ids follow the order. */
export function log(alias: string, maker: string, items: [Kind, number, Row['fields']?, number?][]): DeviceLog {
  return {
    device: { alias, maker, brand: maker, androidSdk: 34 },
    rows: items.map(([kind, monoMs, fields = {}, bootCount = 1], i) => ({ id: i + 1, kind, monoMs, wallMs: 1_763_100_000_000 + monoMs, bootCount, fields })),
  };
}
export const H = 3_600_000;
type Item = [Kind, number, Row['fields'], number];
export const plugIn = (t: number, boot = 1): Item => ['PLUG', t, { source: 'RECEIVER', action: 'CONNECTED', plug: 'AC', plugAfter1s: 'AC', charging: true }, boot];
export const plugOut = (t: number, boot = 1): Item => ['PLUG', t, { source: 'RECEIVER', action: 'DISCONNECTED', plug: 'NONE', plugAfter1s: 'NONE', charging: false }, boot];
export const start = (t: number, exempt = false, boot = 1): Item => ['JOB_START', t, { charging: true, plug: 'AC', exempt }, boot];
export const stop = (t: number, reason: string, charging: boolean, exempt = false): [Kind, number, Row['fields']] => ['JOB_STOP', t, { charging, plug: charging ? 'AC' : 'NONE', stopReasonName: reason, exempt }];
export const note = (t: number, text: string): [Kind, number, Row['fields']] => ['NOTE', t, { text }];
