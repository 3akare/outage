// Probe log contract: tools/probe/contract/README.md. Keep in step with the Kotlin `ProbeLog` and the Worker.
export type Kind = 'JOB_START' | 'JOB_STOP' | 'PLUG' | 'BATTERY' | 'NOTE' | 'ALARM_TEST' | 'SESSION' | 'UPLOAD';
export const KINDS: readonly Kind[] = ['JOB_START', 'JOB_STOP', 'PLUG', 'BATTERY', 'NOTE', 'ALARM_TEST', 'SESSION', 'UPLOAD'];

export type FieldValue = string | number | boolean | null;
export type Row = { id: number; kind: Kind; monoMs: number; wallMs: number; bootCount: number; fields: Record<string, FieldValue> };
export type Device = { alias: string; maker: string; brand: string; androidSdk: number };
export type DeviceLog = { device: Device; rows: Row[] };
export type Export = { version: 1; devices: DeviceLog[] };
