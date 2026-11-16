// Landing page, the app in the browser and the shared stylesheet (ADR 0027, ADR 0048, ADR 0049). UX1, UX2, UX4, UX9.
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import type { Site } from '../site/layout.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import { handleWeb, type WebDeps } from '../routes.ts';
import { NAV_ORDER } from '../ui/simulate/simulate.ts';
import { stores } from '../landing/landing.ts';
import { AREAS, NOW, SITE } from './web-helpers.ts';
import city from '@outage/shared/fixtures/demo-city.json' with { type: 'json' };
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

describe('landing /', () => {
  it('UX9: the pitch, the app in the browser, the GitHub download, and no hardware-sensor claim', async () => {
    const { res, body } = await page('/');
    expect(res.status).toBe(200);
    expect(body).toContain('<h1 id="hero-h">Your phone charger is a power-grid sensor.</h1>');
    expect(body).toContain('href="/app/simulate"');
    expect(body).toContain('Try the app in your browser');
    expect(body).toContain('GitHub');
    expect(body).not.toMatch(/undercount|100 ?%/i);
    expect(body).not.toMatch(/judge/i);
    // One script only: the globe in the hero (ADR 0051).
    expect([...body.matchAll(/<script[^>]*>/g)].map((m) => m[0])).toEqual(['<script src="/globe.js" defer>']);
    expect(body).toContain('data-globe="hero"');
  });

  it('store buttons appear only for the links that are configured', async () => {
    const none = await page('/');
    expect(none.body).not.toContain('Google Play');
    expect(none.body).not.toContain('Aptoide');
    const all = await page('/', { ...SITE, playUrl: 'https://play.google.com/store/apps/details?id=app.outage', aptoideUrl: 'https://outage.en.aptoide.com/app' });
    expect(all.body).toContain('Google Play');
    expect(all.body).toContain('Aptoide');
    expect(stores({ ...SITE, playUrl: 'javascript:alert(1)' }).map((s) => s.label)).toEqual(['Download the APK from GitHub']);
  });
});

describe('the app in the browser /app/simulate', () => {
  it('UX1: the dock is Insights, Home, Settings, with Home in the middle and selected', async () => {
    const { res, body } = await page('/app/simulate');
    expect(res.status).toBe(200);
    expect(NAV_ORDER).toEqual(['Insights', 'Home', 'Settings']);
    const nav = /<nav class="navbar"[^>]*>(.*?)<\/nav>/.exec(body)?.[1] ?? '';
    expect([...nav.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1])).toEqual(['insights', 'home', 'settings']);
    expect(nav).toMatch(/data-tab="home" aria-current="page"/);
  });

  it('draws the simulated city on the globe, with the spot, and says it is simulated', async () => {
    const { body } = await page('/app/simulate');
    expect(body).toContain('class="sim-banner"');
    expect(body).toContain('<canvas id="globe"');
    // The globe engine loads before the app script.
    expect(body.indexOf('src="/globe.js"')).toBeLessThan(body.indexOf('src="/simulate.js"'));
    const js = (await page('/simulate.js')).body;
    const cells = JSON.parse(/var CELLS=(\[.*?\]),AREA=/.exec(js)?.[1] ?? '[]') as { id: string; ring: number[][] }[];
    expect(cells.length).toBe(city.cells.length);
    expect(cells.every((c) => c.id.startsWith('sim-') && c.ring.length === 6)).toBe(true);
    expect(js).toContain(`var SPOT='${city.spot}'`);
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

  it('serves the globe with the land dots and no request elsewhere', async () => {
    const { res, body } = await page('/globe.js');
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(body).toContain('window.OutageGlobe=Globe');
    expect(body.length).toBeGreaterThan(40_000); // the Natural Earth dot grid is inlined
    expect(body).not.toMatch(/fetch\(|https?:\/\//);
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
  it('serves the stylesheet (Hallmark stamp, Midnight tokens), the font and the favicon from the same origin', async () => {
    const css = await page('/app.css');
    expect(css.res.headers.get('content-type')).toContain('text/css');
    expect(css.body.split('\n')[0]).toMatch(/^\/\* Hallmark · /); // the Hallmark stamp opens the stylesheet
    expect(css.body).toContain('--c-paper:');
    expect(css.body).toContain('--map-confirmed:');
    const font = await handleWeb(new Request('https://outage.test/fonts/mona-sans.woff2'), deps());
    expect(font.headers.get('content-type')).toBe('font/woff2');
    expect(new Uint8Array(await font.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([0x77, 0x4f, 0x46, 0x32])); // "wOF2"
    const icon = await page('/favicon.svg');
    expect(icon.res.headers.get('content-type')).toContain('image/svg+xml');
    expect(icon.body).toContain('<svg');
  });

  it('UX4: no page or asset loads anything from another origin', async () => {
    for (const p of ['/', '/app/simulate', '/simulate.js', '/globe.js', '/app.css', '/install', '/privacy']) {
      const { body } = await page(p);
      expect(body, p).not.toMatch(LOADS_ELSEWHERE);
    }
  });

  it('CSP allows same-origin scripts and styles, and nothing else', async () => {
    const { res } = await page('/app/simulate');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'nonce-[^']+' 'self'(;|$)/);
    expect(csp).toMatch(/style-src 'nonce-[^']+' 'self'(;|$)/);
    expect(csp).not.toMatch(/https?:|unsafe-/);
  });

  it('no inline style attributes, so the CSP never has to allow them', async () => {
    for (const p of ['/', '/app/simulate', '/simulate.js', '/globe.js']) {
      const { body } = await page(p);
      expect(body, p).not.toMatch(/\sstyle="/);
    }
  });

  it('the app in the browser stays under 200 KB with the globe, its script and stylesheet', async () => {
    let bytes = 0;
    for (const p of ['/app/simulate', '/simulate.js', '/globe.js', '/app.css']) bytes += new TextEncoder().encode((await page(p)).body).length;
    expect(bytes).toBeLessThan(200 * 1024);
  });
});
