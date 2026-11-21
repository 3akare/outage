// The simulation offers every place in Lagos (ADR 0060): 20 LGAs, 376 wards and 4,968 blocks, and the tab bar is centred.
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import { handleWeb, type WebDeps } from '../routes.ts';
import designSrc from '../ui/app/design.ts?raw';
import appJs from '../public/js/app.js?raw';
import { NAV_ORDER } from '../ui/simulate/simulate.ts';
// @ts-expect-error plain browser script, no types
import { buildPlaces, targetBlocks } from '../public/js/places.js';
import { AREAS, NOW, SITE } from './web-helpers.ts';

const index: IndexReader = {
  views: async () => {
    throw new Error('never read');
  },
};
const deps: WebDeps = { site: SITE, install: null, areas: AREAS, index, cache: new PageCache({ now: () => NOW }), replay: () => null, now: () => NOW };
const get = async (path: string) => handleWeb(new Request(`https://outage.test${path}`), deps);
const load = async () => buildPlaces(await (await get('/lagos-sim.json')).json());

describe('every Lagos place is an option for the simulation', () => {
  it('serves 20 LGAs, 376 wards and 4,968 blocks, cached for a day', async () => {
    const res = await get('/lagos-sim.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=86400');
    const p = await load();
    expect(p.lgas).toHaveLength(20);
    expect(p.wards).toHaveLength(376);
    expect(p.cells).toHaveLength(4968);
    expect(new Set(p.cells.map((c: { id: string }) => c.id)).size).toBe(4968);
    expect(JSON.stringify(await (await get('/lagos-sim.json')).clone().json()).length).toBeLessThan(600 * 1024);
    expect(p.cells.every((c: { id: string; ring: unknown[] }) => c.id.startsWith('sim-') && c.ring.length === 6)).toBe(true);
  });

  it('the picker reaches all of them: every LGA, then its wards, then each ward block', async () => {
    const p = await load();
    expect(p.lgas.reduce((n: number, l: { slug: string }) => n + p.wardsOf(l.slug).length, 0)).toBe(376);
    const reached = new Set<string>();
    for (const l of p.lgas) for (const id of p.areas[l.slug].cells) reached.add(id);
    for (const w of p.wards) for (const id of w.cells) reached.add(id);
    expect(reached.size).toBe(4968);
  });

  it('search finds any LGA or ward by name', async () => {
    const p = await load();
    for (const a of [...p.lgas, ...p.wards]) expect(p.search(a.name).map((x: { slug: string }) => x.slug)).toContain(a.slug);
    expect(p.search('')).toEqual([]);
  });

  it('a blackout can run on any block, ward or LGA: the spot comes first and every block is real', async () => {
    const p = await load();
    for (const a of [...p.lgas, ...p.wards]) {
      const t = targetBlocks(p, a.slug, null);
      expect(t[0]).toBe(a.centre);
      expect(new Set(t)).toEqual(new Set(a.cells));
    }
    for (const c of p.cells) {
      const t = targetBlocks(p, c.area, c.id);
      expect(t[0]).toBe(c.id);
      expect(t.length).toBeLessThanOrEqual(7);
    }
  });

  it('the script offers the picker, the map tap and the search for every place', () => {
    for (const id of ['plga', 'pward', 'pcell', 'usepick']) expect(appJs).toContain(`id="${id}"`);
    expect(appJs).toContain("fetch('/lagos-sim.json')");
    expect(appJs).toContain("M.on('cell'");
    expect(appJs).toContain('places.search(');
    expect(appJs).not.toMatch(/Yaba/);
  });
});

describe('the tab bar sits in the middle', () => {
  it('has exactly as many columns as tabs, so the buttons fill the bar', () => {
    const phone = /\.rail\{[^}]*grid-template-columns:repeat\((\d+),minmax\(0,1fr\)\)/.exec(designSrc);
    expect(phone, 'phone tab bar rule').not.toBeNull();
    expect(Number(phone?.[1])).toBe(NAV_ORDER.length);
  });
});
