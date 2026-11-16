// @outage/shared: event schema, H3 helpers and contract fixtures shared by the Worker and the tools.
// The validator (event-ingest task 2) and the install token (task 3) are added next.
export const SCHEMA_VERSION = 1;
export * from './h3.ts';
export * from './ingest.ts';
export * from './device-day.ts';
export * from './field-metrics.ts';
export * from './field-outage.ts';
export * from './pairing.ts';
export * from './follow.ts';
export * from './field-dump.ts';
export * from './map.ts';
export * from './sensor.ts';
