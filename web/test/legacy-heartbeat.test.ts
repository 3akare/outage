// Back-compat (ADR 0055): APKs built with the removed Home Watch feature send DISARMED with reason HEARTBEAT_ON_BATTERY.
// The Worker keeps accepting it as proof of life only, so those phones neither retry it nor log a state change.
import { describe, expect, it } from 'vitest';
import { handleRequest } from '../api/ingest/handlers.ts';
import type { AreaEvent } from '../api/area/core.ts';
import { CELL, ID, makeCore, makeWorld, NOW, PARENT, post, ROOMY, tokenFor, wire } from './helpers.ts';

const ev = (seq: number, type: AreaEvent['type'], eventTimeMs: number, reason?: string): AreaEvent => ({
  installId: ID,
  seq,
  type,
  cell: CELL,
  eventTimeMs,
  confidence: 'HIGH',
  schedulingDelayMs: null,
  ...(reason ? { reason } : {}),
});

describe('legacy HEARTBEAT_ON_BATTERY from old APKs', () => {
  it('keeps the armed flag, refreshes last-seen, never reaches the engine', async () => {
    const { core, port } = makeCore(ROOMY);
    await core.ingest({ parent: PARENT, receiveTimeMs: NOW, events: [ev(1, 'ARMED', NOW)] });
    const before = core.armedState(ID);
    const res = await core.ingest({
      parent: PARENT,
      receiveTimeMs: NOW + 600_000,
      events: [ev(2, 'DISARMED', NOW + 600_000, 'HEARTBEAT_ON_BATTERY')],
    });
    expect(res.results[0]).toEqual({ status: 'accepted' });
    const after = core.armedState(ID);
    expect(after?.armed).toBe(before?.armed);
    expect(after?.armedSinceMs).toBe(before?.armedSinceMs);
    expect(after?.lastSeenMs).toBe(NOW + 600_000);
    expect(port.calls.flatMap((c) => c.items).map((i) => i.seq)).toEqual([1]);
  });

  it('is idempotent by seq', async () => {
    const { core } = makeCore(ROOMY);
    const one = { parent: PARENT, receiveTimeMs: NOW, events: [ev(5, 'DISARMED', NOW, 'HEARTBEAT_ON_BATTERY')] };
    expect((await core.ingest(one)).results[0].status).toBe('accepted');
    expect((await core.ingest(one)).results[0].status).toBe('duplicate');
  });

  it('another DISARMED reason still disarms', async () => {
    const { core } = makeCore(ROOMY);
    await core.ingest({ parent: PARENT, receiveTimeMs: NOW, events: [ev(1, 'ARMED', NOW), ev(2, 'DISARMED', NOW + 1000, 'REBOOT')] });
    expect(core.armedState(ID)?.armed).toBe(false);
  });

  it('the Worker hands the reason to the area actor for this one reason only', async () => {
    const w = makeWorld(ROOMY);
    const events = [
      wire({ seq: 1, type: 'DISARMED', reason: 'HEARTBEAT_ON_BATTERY' }),
      wire({ seq: 2, type: 'DISARMED', reason: 'REBOOT' }),
    ];
    const res = await handleRequest(await post('/v1/events', { installId: ID, events }, await tokenFor()), w.deps);
    expect(res.status).toBe(200);
    const sent = w.areaCalls.flatMap((c) => c.input.events);
    expect(sent.map((e) => e.reason)).toEqual(['HEARTBEAT_ON_BATTERY', undefined]);
  });
});
