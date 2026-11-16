// Landing page, the app in the browser and the shared stylesheet (ADR 0027, ADR 0048, ADR 0049). UX1, UX2, UX4, UX9.
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import type { Site } from '../site/layout.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import { handleWeb, type WebDeps } from '../routes.ts';
import { NAV_ORDER } from '../ui/simulate/simulate.ts';
import { stores } from '../landing/landing.ts';
import { AREAS, NOW, SITE } from './web-helpers.ts';

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
    expect(body).toContain('Your phone charger is a <em>power-grid sensor</em>.');
    expect(body).toContain('href="/app/simulate"');
    expect(body).toContain('Try the app in your browser');
    expect(body).toContain('GitHub');
    expect(body).not.toMatch(/undercount|100 ?%/i);
    expect(body).not.toMatch(/judge/i);
    expect(body).not.toContain('<script');
  });

  it('store buttons appear only for the links that are configured', async () => {
    const none = await page('/');
    expect(none.body).not.toContain('Google Play');
    expect(none.body).not.toContain('Aptoide');
    const all = await page('/', { ...SITE, playUrl: 'https://play.google.com/store/apps/details?id=app.outage', aptoideUrl: 'https://outage.en.aptoide.com/app' });
    expect(all.body).toContain('Google Play');
    expect(all.body).toContain('Aptoide');
    expect(stores({ ...SITE, playUrl: 'javascript:alert(1)' }).map((s) => s.name)).toEqual(['GitHub']);
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

  it('draws the simulated city with the spot, and says it is simulated', async () => {
    const { body } = await page('/app/simulate');
    expect(body).toContain('class="sim-banner"');
    const ids = [...body.matchAll(/<path class="hx[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(21);
    expect(ids.every((id) => id.startsWith('sim-'))).toBe(true);
    expect(body).toContain('class="hx spot" data-id="sim-0,0"');
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
  it('serves the stylesheet with the Material 3 tokens and the favicon from the same origin', async () => {
    const css = await page('/app.css');
    expect(css.res.headers.get('content-type')).toContain('text/css');
    expect(css.body).toContain('--md-sys-color-primary:');
    expect(css.body).toContain('--md-map-confirmed:');
    const icon = await page('/favicon.svg');
    expect(icon.res.headers.get('content-type')).toContain('image/svg+xml');
    expect(icon.body).toContain('<svg');
  });

  it('UX4: no page or asset loads anything from another origin', async () => {
    for (const p of ['/', '/app/simulate', '/simulate.js', '/app.css', '/install', '/privacy']) {
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
    for (const p of ['/', '/app/simulate', '/simulate.js']) {
      const { body } = await page(p);
      expect(body, p).not.toMatch(/\sstyle="/);
    }
  });

  it('the app in the browser stays under 150 KB with its script and stylesheet', async () => {
    let bytes = 0;
    for (const p of ['/app/simulate', '/simulate.js', '/app.css']) bytes += new TextEncoder().encode((await page(p)).body).length;
    expect(bytes).toBeLessThan(150 * 1024);
  });
});
