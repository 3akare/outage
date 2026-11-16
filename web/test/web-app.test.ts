// Landing page, the app in the browser and the shared stylesheet (ADR 0027, ADR 0049, ADR 0054). UX1, UX2, UX4, UX9.
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import type { Site } from '../site/layout.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import { handleWeb, type WebDeps } from '../routes.ts';
import { NAV_ORDER } from '../ui/simulate/simulate.ts';
import { stores } from '../landing/landing.ts';
import { AREAS, NOW, SITE } from './web-helpers.ts';
import city from '@outage/shared/fixtures/demo-city.json' with { type: 'json' };
import appJs from '../public/js/app.js?raw';
import chartsJs from '../public/js/charts.js?raw';
import dataJs from '../public/js/data.js?raw';
import landingJs from '../public/js/landing.js?raw';
import mapJs from '../public/js/map.js?raw';
import simJs from '../public/js/sim.js?raw';
import { SEARCH_ORIGIN, TILE_ORIGIN } from '../site/headers.ts';
import { latLngToCell } from 'h3-js';

function deps(site: Site = SITE): WebDeps {
  const index: IndexReader = {
    views: async () => {
      throw new Error('these pages never read the public index');
    },
  };
  return { site, install: null, areas: AREAS, index, cache: new PageCache({ now: () => NOW }), replay: () => null, now: () => NOW };
}
const page = async (path: string, site?: Site) => {
  const res = await handleWeb(new Request(`https://outage.test${path}`), deps(site));
  return { res, body: await res.text() };
};
// Nothing is loaded from another origin: no src, no stylesheet, no form action, no script import. Plain links out are fine.
const LOADS_ELSEWHERE = /(?:src|action)="https?:\/\/|<link[^>]+href="https?:\/\/(?!outage\.test\/)|(?:fetch|import)\(['"]https?:/;
// The page scripts are static files (public/js), served by Workers Static Assets.
const FILES: Record<string, string> = { 'app.js': appJs, 'map.js': mapJs, 'data.js': dataJs, 'charts.js': chartsJs, 'landing.js': landingJs, 'sim.js': simJs };
const client = (f: string) => FILES[f];
const CLIENT = Object.keys(FILES);

describe('landing /', () => {
  it('UX9: the pitch, the app in the browser, the GitHub download, and no hardware-sensor claim', async () => {
    const { res, body } = await page('/');
    expect(res.status).toBe(200);
    expect(body).toContain('<h1 id="hero-h">Know the moment the power goes. And when it’s back.</h1>');
    expect(body).toContain('power-grid sensor');
    // Outage is for anywhere: the page never frames it as one city's app (steering product.md).
    expect(body).not.toMatch(/Lagos/);
    expect(body).toContain('href="/app/simulate"');
    expect(body).toContain('Try the app in your browser');
    expect(body).toContain('GitHub');
    expect(body).not.toMatch(/undercount|100 ?%/i);
    expect(body).not.toMatch(/judge/i);
    // One script only: the live street map and chart (ADR 0053).
    expect([...body.matchAll(/<script[^>]*>/g)].map((m) => m[0])).toEqual(['<script type="module" src="/js/landing.js">']);
    expect(body).toContain('id="heromap"');
    expect(body).toContain('OpenStreetMap contributors');
  });

  it('store buttons appear only for the links that are configured', async () => {
    // Without links, Play and Aptoide show as "Coming soon" badges that link nowhere; GitHub always links.
    const none = await page('/');
    expect(none.body).toContain('Get it on Google Play: coming soon');
    expect(none.body).not.toContain('href="https://play.google.com');
    expect(none.body).toMatch(/<a class="badge badge-github" href="[^"]+"/);
    const play = 'https://play.google.com/store/apps/details?id=app.outage';
    const all = await page('/', { ...SITE, playUrl: play, aptoideUrl: 'https://outage.en.aptoide.com/app' });
    expect(all.body).toContain(`href="${play}"`);
    expect(all.body).toContain('href="https://outage.en.aptoide.com/app"');
    expect(all.body).not.toContain('coming soon');
    // The Play badge is Google's own image, served from this origin.
    expect(all.body).toContain('src="/badges/google-play.png"');
    expect(stores({ ...SITE, playUrl: 'javascript:alert(1)' }).find((s) => s.id === 'play')?.href).toBeNull();
  });
});

describe('the app in the browser /app/simulate', () => {
  it('UX1: the dock is Insights, Home, Settings, with Home in the middle and selected', async () => {
    const { res, body } = await page('/app/simulate');
    expect(res.status).toBe(200);
    expect(NAV_ORDER).toEqual(['Insights', 'Home', 'Settings']);
    const nav = /<nav class="rail"[^>]*>(.*?)<\/nav>/.exec(body)?.[1] ?? '';
    expect([...nav.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1])).toEqual(['insights', 'home', 'settings']);
    expect(nav).toMatch(/data-tab="home" aria-current="page"/);
  });

  it('ADR 0054: a real street map around your own location, quietly labelled simulated', async () => {
    const { body } = await page('/app/simulate');
    expect(body).toContain('class="sim-banner"');
    expect(body).toContain('Simulation: simulated data, not live.');
    expect(body).toContain('<div class="map" id="map"');
    expect(body).toContain('<script type="module" src="/js/app.js">');
    expect(body).toContain('href="/vendor/maplibre-gl/maplibre-gl.css"');
    expect(body).not.toMatch(/Lagos/);
    expect(client('map.js')).toContain("from '/vendor/maplibre-gl/maplibre-gl.mjs'");
    expect(client('map.js')).toContain(`${TILE_ORIGIN}/styles/liberty`);
    // Built around the browser's own location, with h3-js from this origin; other places only through search.
    expect(client('app.js')).toContain('navigator.geolocation.getCurrentPosition');
    expect(client('app.js')).toContain("from '/vendor/h3-js/h3-js.es.js'");
    expect(client('app.js')).toContain(`${SEARCH_ORIGIN}/search?`);
  });

  it('ADR 0052: the simulated city puts real Lagos areas at their real places', () => {
    const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
      Math.hypot((a.lat - b.lat) * 111.32, (a.lng - b.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180));
    const area = (slug: string) => city.areas.find((a) => a.slug === slug) as (typeof city.areas)[number];
    // Yaba (mainland) and Lekki (on the island side) are about 11 km apart, not neighbours.
    expect(km(area('yaba'), area('lekki'))).toBeGreaterThan(9);
    expect(km(area('ikeja'), area('ajah'))).toBeGreaterThan(20);
    // Each area's centre block is the real H3 cell at its catalog coordinates, and its blocks sit around it.
    for (const a of city.areas) {
      expect(a.centre).toBe(`sim-${latLngToCell(a.lat, a.lng, 8)}`);
      for (const id of a.cells) {
        const c = city.cells.find((x) => x.id === id) as (typeof city.cells)[number];
        const [lat, lng] = [c.ring.reduce((s, p) => s + p[0], 0) / 6, c.ring.reduce((s, p) => s + p[1], 0) / 6];
        expect(km(a, { lat, lng })).toBeLessThan(3);
      }
    }
  });

  it('the old web-app addresses send people to the app in the browser', async () => {
    for (const p of ['/app', '/app/insights', '/app/settings']) {
      const { res } = await page(p);
      expect(res.status, p).toBe(301);
      expect(res.headers.get('Location'), p).toBe('/app/simulate');
    }
  });
});

describe('shared assets', () => {
  it('serves the stylesheet (tokens, Inter from this origin) and the favicon', async () => {
    const css = await page('/app.css');
    expect(css.res.headers.get('content-type')).toContain('text/css');
    expect(css.body).toContain('--c-paper:#ffffff');
    expect(css.body).toContain('--map-confirmed:');
    expect([...css.body.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1])).toEqual(['/fonts/inter-latin.woff2']);
    const icon = await page('/favicon.svg');
    expect(icon.res.headers.get('content-type')).toContain('image/svg+xml');
    expect(icon.body).toContain('<svg');
  });

  it('UX4: pages load nothing from another origin; scripts reach only the map tiles', async () => {
    for (const p of ['/', '/app/simulate', '/app.css', '/install', '/privacy']) {
      const { body } = await page(p);
      expect(body, p).not.toMatch(LOADS_ELSEWHERE);
    }
    for (const f of CLIENT) {
      // Comment links (docs) aside, the code reaches only the tiles and, in the app, place search.
      const code = client(f).replace(/\/\/ .*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const origins = [...code.matchAll(/https?:\/\/[a-z0-9.-]+/g)].map((m) => m[0]);
      expect(origins.every((o) => o === TILE_ORIGIN || (f === 'app.js' && o === SEARCH_ORIGIN)), `${f}: ${origins}`).toBe(true);
    }
  });

  it('CSP: same-origin scripts and styles; only map pages may reach OpenFreeMap', async () => {
    for (const p of ['/app/simulate', '/']) {
      const csp = (await page(p)).res.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("default-src 'none'");
      expect(csp).toMatch(/script-src 'nonce-[^']+' 'self'(;|$)/);
      expect(csp).toMatch(/style-src 'nonce-[^']+' 'self'(;|$)/);
      expect(csp).toContain(`connect-src 'self' ${TILE_ORIGIN}`);
      expect(csp.replace(TILE_ORIGIN, '').replace(SEARCH_ORIGIN, '')).not.toMatch(/https?:|unsafe-/);
      // Only the app has place search.
      expect(csp.includes(SEARCH_ORIGIN), p).toBe(p === '/app/simulate');
    }
    const plain = (await page('/privacy')).res.headers.get('content-security-policy') ?? '';
    expect(plain).not.toContain(TILE_ORIGIN);
  });

  it('no inline style attributes, so the CSP never has to allow them', async () => {
    for (const p of ['/', '/app/simulate']) {
      const { body } = await page(p);
      expect(body, p).not.toMatch(/\sstyle="/);
    }
    for (const f of CLIENT) expect(client(f), f).not.toMatch(/\sstyle="/);
  });

  it('the app in the browser stays under 200 KB without MapLibre: page, city, scripts and stylesheet', async () => {
    let bytes = 0;
    for (const p of ['/app/simulate', '/app.css']) bytes += new TextEncoder().encode((await page(p)).body).length;
    for (const f of CLIENT) bytes += client(f).length;
    expect(bytes).toBeLessThan(200 * 1024);
  });
});
