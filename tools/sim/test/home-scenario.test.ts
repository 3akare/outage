// home-watch task 9: the router-down scenario of design section 10. The station goes off, the router goes down with it,
// the station reconnects 2 hours later, and the state is corrected from the late events (R2.4 to R2.7, H1, H2).
import { SILENCE_LIMIT_MS } from '@outage/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HEARTBEAT_MS, stationDeliveries, viewerAt } from '../src/home-scenario.ts';
import { NUM_RUNS } from './runs.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const CUT = 3 * HOUR + 7 * MIN; // not on a heartbeat, so the last heard heartbeat is before the cut

describe('Home Watch scenario: router down, late reconnect', () => {
  it('H1_offline_never_off: power off with the router down shows ON, then Station offline, then OFF since the cut after reconnect', () => {
    const d = stationDeliveries({ cutMs: CUT, routerDownMs: 2 * HOUR, powerBackMs: null }, CUT + 4 * HOUR);
    const lastHeard = Math.floor((CUT - 1) / HEARTBEAT_MS) * HEARTBEAT_MS;
    expect(viewerAt(d, CUT + 5 * MIN).status).toBe('ON'); // nothing arrived yet, and less than 30 minutes of silence
    const offline = viewerAt(d, lastHeard + SILENCE_LIMIT_MS);
    expect(offline.status).toBe('OFFLINE');
    expect(offline.lastKnown?.state).toBe('ON'); // "Last known: power on since ...": silence is never "power off"
    const after = viewerAt(d, CUT + 2 * HOUR);
    expect(after).toEqual({ status: 'OFF', sinceMs: CUT, lastKnown: null });
    expect(viewerAt(d, CUT + 3 * HOUR).status).toBe('OFF'); // battery heartbeats keep OFF and its since
    expect(viewerAt(d, CUT + 3 * HOUR).sinceMs).toBe(CUT);
  });

  it('H2_state_order_independent: power back before the router: after reconnect ON since the real return', () => {
    const back = CUT + 95 * MIN;
    const d = stationDeliveries({ cutMs: CUT, routerDownMs: 2 * HOUR, powerBackMs: back }, CUT + 4 * HOUR);
    expect(viewerAt(d, CUT + 2 * HOUR)).toEqual({ status: 'ON', sinceMs: back, lastKnown: null });
  });

  it('every simulated event carries simulated: true', () => {
    const d = stationDeliveries({ cutMs: CUT, routerDownMs: 2 * HOUR, powerBackMs: CUT + 3 * HOUR }, CUT + 5 * HOUR);
    for (const x of d) for (const e of x.events) expect(e.simulated).toBe(true);
  });

  it('H1_offline_never_off and H2_state_order_independent: any cut, outage, router delay and upload order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: HOUR, max: 10 * HOUR }),
        fc.integer({ min: 31 * MIN, max: 8 * HOUR }),
        fc.option(fc.integer({ min: MIN, max: 10 * HOUR }), { nil: null }),
        fc.integer(),
        (cut, down, outage, seed) => {
          const powerBackMs = outage === null ? null : cut + outage;
          const base = { cutMs: cut, routerDownMs: down, powerBackMs };
          const n = stationDeliveries(base, cut + down)
            .filter((x) => x.receiveMs === cut + down)
            .flatMap((x) => x.events).length;
          // A seeded shuffle of the buffered upload.
          const order = [...Array(n).keys()];
          let s = seed >>> 0;
          for (let i = n - 1; i > 0; i--) {
            s = (s * 1103515245 + 12345) >>> 0;
            const j = s % (i + 1);
            [order[i], order[j]] = [order[j], order[i]];
          }
          const end = cut + down + 2 * HOUR;
          const d = stationDeliveries({ ...base, uploadOrder: order }, end);
          // While the router is down nothing says OFF (R2.5).
          for (let t = cut; t < cut + down; t += 7 * MIN) expect(viewerAt(d, t).status).not.toBe('OFF');
          // After reconnect the state is the real one, whatever the upload order (R2.6, R2.7).
          const at = cut + down;
          const v = viewerAt(d, at);
          if (powerBackMs === null || powerBackMs > at) expect(v).toEqual({ status: 'OFF', sinceMs: cut, lastKnown: null });
          else expect(v).toEqual({ status: 'ON', sinceMs: powerBackMs, lastKnown: null });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
