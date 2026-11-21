// The simulation offers every place in Lagos (ADR 0060): 20 LGAs, 376 wards and 4,968 blocks, and the tab bar is centred.
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import { handleWeb, type WebDeps } from '../routes.ts';
import designSrc from '../ui/app/design.ts?raw';
import { APP_CSS_HREF, CSS_VERSION } from '../ui/app/design.ts';
import lagosStates from '@outage/shared/fixtures/places/lagos-states.json' with { type: 'json' };
import landingJs from '../public/js/landing.js?raw';
import headersFile from '../public/_headers?raw';
import mapJs from '../public/js/map.js?raw';
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
  it('lays the phone bar out as equal columns for however many tabs there are, so it never needs a count', () => {
    const phone = /\.rail\{[^}]*grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax\(0,1fr\)/.exec(designSrc);
    expect(phone, 'phone tab bar rule').not.toBeNull();
    expect(designSrc).not.toMatch(/\.rail\{[^}]*repeat\(\d/);
    expect(NAV_ORDER.length).toBeGreaterThan(0);
  });

  it('keeps landscape phones centred with the safe-area insets, and the computer rail a vertical list', () => {
    expect(designSrc).toContain('max(8px,env(safe-area-inset-left))');
    expect(designSrc).toContain('max(8px,env(safe-area-inset-right))');
    expect(designSrc).toMatch(/@media \(min-width:900px\)\{[\s\S]*\.rail\{grid-template-columns:none;grid-auto-flow:row;/);
  });
});

describe('a deploy always reaches people (no old stylesheet or script)', () => {
  it('links the stylesheet with its fingerprint on the app, the landing page and the area pages', async () => {
    expect(APP_CSS_HREF).toBe(`/app.css?v=${CSS_VERSION}`);
    for (const path of ['/app/simulate', '/']) expect((await get(path)).headers && (await (await get(path)).text())).toContain(`href="${APP_CSS_HREF}"`);
  });

  it('serves the stylesheet at its fingerprinted address and names the service worker cache after it', async () => {
    const css = await get(APP_CSS_HREF);
    expect(css.status).toBe(200);
    const sw = await (await get('/judge-sw.js')).text();
    expect(sw).toContain(`'sim-${CSS_VERSION}'`);
    expect(sw).toContain("cache:'no-cache'");
  });

  it('asks for the scripts every time', () => {
    expect(headersFile).toMatch(/\/js\/\*\n\s+! Cache-Control\n\s+Cache-Control: no-cache/);
  });
});

describe('every Lagos block has a made-up power colour', () => {
  it('the shared file has a state for each of the 4,968 blocks, under 15% with no data, and colour in every LGA', async () => {
    const states = lagosStates.states as Record<string, string>;
    expect(Object.keys(states)).toHaveLength(4968);
    const noData = Object.values(states).filter((s) => s === 'NO_DATA').length;
    expect(noData / 4968).toBeLessThan(0.15);
    const p = await load();
    for (const l of p.lgas) {
      const own = p.areas[l.slug].cells as string[];
      expect(own.some((id) => p.byId[id].state !== 'NO_DATA'), l.name).toBe(true);
      expect(own.some((id) => ['POSSIBLE', 'CONFIRMED', 'RESTORED'].includes(p.byId[id].state)), l.name).toBe(true);
    }
  });

  it('the sim file carries those states and places.js uses them, not NO_DATA for everything', async () => {
    const states = lagosStates.states as Record<string, string>;
    const p = await load();
    for (const c of p.cells as { id: string; state: string }[]) expect(c.state).toBe(states[c.id.slice(4)]);
    expect(p.cells.filter((c: { state: string }) => c.state === 'NO_DATA').length).toBeLessThan(4968 / 2);
  });

  it('the chosen place starts on, the rest of Lagos keeps its colours, and the landing map draws all of it', () => {
    expect(appJs).toContain("on.has(c.id) ? 'NORMAL' : c.state");
    expect(landingJs).toContain('/lagos-sim.json');
    expect(landingJs).not.toContain('demo-city');
  });
});

describe('every web map opens on Lagos', () => {
  it('is built with the Lagos box, never a world view', () => {
    expect(mapJs).toContain('bounds: LAGOS_BOUNDS');
    expect(mapJs).toMatch(/minZoom: MIN_ZOOM/);
    expect(appJs).not.toMatch(/center: \[8, 12\]|zoom: 1\.6/);
    expect(landingJs).not.toMatch(/center:/);
  });
});
