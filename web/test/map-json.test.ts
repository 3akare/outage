// app-map-insights task 1: GET /api/map.json. The privacy floor holds at the Worker (ADR 0007, review issue 4),
// and the same fixture is read by the Kotlin parser test (structure.md).

import fixture from '@outage/shared/fixtures/map/map.json' with { type: 'json' };
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import { buildCatalog } from '../areas/catalog/build.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import { buildMapJson, cityFrom } from '../api/map/map-json.ts';
import type { PublicScopeView } from '../api/public-index/public-view.ts';
import { handleWeb, type WebDeps } from '../routes.ts';
import { NUM_RUNS } from './runs.ts';
import { cellView, confirmedNow, HOUR, NOW, SITE } from './web-helpers.ts';

const AREAS = buildCatalog({
  areas: [
    {
      slug: 'yaba',
      name: 'Yaba',
      lat: 6.5068,
      lng: 3.3755,
      rings: 1,
      tzOffsetMin: 60,
      country: 'NG',
      source: 'https://example.test/source',
      checkedBy: 'test person 2026-11-20',
    },
  ],
}).areas;
const CELLS = AREAS[0]?.cells ?? [];
const [A, B, C, D] = CELLS as [string, string, string, string];

const FIXTURE_VIEWS: PublicScopeView[] = [
  cellView(A, confirmedNow(NOW - 2 * HOUR)),
  cellView(B, {
    status: 'NORMAL',
    lastRestoredAtMs: NOW - HOUR,
    history30d: [{ startMs: NOW - 5 * HOUR, endMs: NOW - HOUR, level: 'CONFIRMED', precision: 'CELL' }],
  }),
  cellView(C),
];

function deps(views: readonly PublicScopeView[] | null): WebDeps {
  const index: IndexReader = { views: async () => views };
  return {
    site: SITE,
    install: null,
    areas: AREAS,
    index,
    cache: new PageCache({ now: () => NOW }),
    replay: () => null,
    now: () => NOW,
  };
}

describe('map.json', () => {
  it('matches the shared fixture the Kotlin parser reads', () => {
    expect(JSON.parse(JSON.stringify(buildMapJson('lagos', AREAS, FIXTURE_VIEWS, NOW)))).toEqual(fixture);
  });

  it('M1_floor: a cell with no public view has no state, no times and no history', () => {
    const m = buildMapJson('lagos', AREAS, FIXTURE_VIEWS, NOW);
    const d = m.cells.find((c) => c.id === D);
    expect(d).toMatchObject({ state: 'NO_DATA', sinceMs: null, restoredMs: null, history30d: [] });
  });

  it('M1_floor: property, any cell not covered by a view is NO_DATA and the output has no count keys', () => {
    fc.assert(
      fc.property(fc.subarray(CELLS), (covered) => {
        const views = covered.map((c) => cellView(c, confirmedNow()));
        const m = buildMapJson('lagos', AREAS, views, NOW);
        for (const cell of m.cells) {
          if (!covered.includes(cell.id)) {
            expect(cell.state).toBe('NO_DATA');
            expect(cell.history30d).toEqual([]);
            expect(cell.sinceMs).toBeNull();
          }
        }
        const text = JSON.stringify(m);
        expect(text).not.toMatch(/members|phones|count|installId/i);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('every ring has six [lat, lng] pairs and only catalog cells appear', () => {
    const m = buildMapJson('lagos', AREAS, FIXTURE_VIEWS, NOW);
    expect(m.cells.map((c) => c.id).sort()).toEqual([...CELLS].sort());
    for (const c of m.cells) expect(c.ring).toHaveLength(6);
  });

  it('cityFrom accepts a slug and falls back otherwise', () => {
    expect(cityFrom('abuja')).toBe('abuja');
    expect(cityFrom('Bad City!')).toBe('lagos');
    expect(cityFrom(null)).toBe('lagos');
  });

  it('route: 200 JSON, and 503 when the index is unreachable', async () => {
    const ok = await handleWeb(new Request('https://outage.test/api/map.json?city=lagos'), deps(FIXTURE_VIEWS));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('application/json');
    expect(((await ok.json()) as { city: string }).city).toBe('lagos');
    const down = await handleWeb(new Request('https://outage.test/api/map.json'), deps(null));
    expect(down.status).toBe(503);
    const post = await handleWeb(new Request('https://outage.test/api/map.json', { method: 'POST' }), deps([]));
    expect(post.status).toBe(405);
  });
});

describe('map.json with an unlisted catalog (live fix: empty map)', () => {
  it('serves catalog cells as NO_DATA when no area is listed yet', async () => {
    const d = { ...deps([]), areas: [], mapAreas: AREAS };
    const res = await handleWeb(new Request('https://outage.test/api/map.json?city=lagos'), d);
    const body = (await res.json()) as { city: string; areas: unknown[]; cells: { state: string }[] };
    expect(body.city).toBe('lagos');
    expect(body.areas).toHaveLength(1);
    expect(body.cells.length).toBe(CELLS.length);
    expect(body.cells.every((c) => c.state === 'NO_DATA')).toBe(true);
  });

  it('keeps unlisted areas out of /area/<slug> (W7)', async () => {
    const d = { ...deps([]), areas: [], mapAreas: AREAS };
    const res = await handleWeb(new Request('https://outage.test/area/yaba'), d);
    expect(res.status).toBe(404);
  });
});
