// Landing page and web app replica (ux-redesign task 2, ADR 0027). UX1, UX4, UX6, UX7, UX9 and the web part of UX2.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PageCache } from '../src/web/site/cache.ts';
import { APP_TABS, EMPTY_TEXT, hexLayout, LOAD_ERROR_TEXT } from '../src/web/app/app.ts';
import type { IndexReader } from '../src/public-index/reader.ts';
import type { PublicScopeView } from '../src/public-index/public-view.ts';
import { handleWeb, type WebDeps } from '../src/web/routes.ts';
import { NUM_RUNS } from './runs.ts';
import { AREAS, cellView, confirmedNow, NOW, SITE, YABA } from './web-helpers.ts';

function deps(views: readonly PublicScopeView[] | null): WebDeps {
  const index: IndexReader = { views: async () => views };
  return { site: SITE, install: null, areas: AREAS, index, cache: new PageCache({ now: () => NOW }), replay: () => null, now: () => NOW };
}
const page = async (path: string, views: readonly PublicScopeView[] | null = []) => {
  const res = await handleWeb(new Request(`https://outage.test${path}`), deps(views));
  return { res, body: await res.text() };
};
// The APK download is a link the person taps, not something the page loads.
const ORIGIN = /(?:src|action)="https?:\/\/|href="https?:\/\/(?!outage\.test\/)(?![^"]*\.apk")/;

describe('landing /', () => {
  it('UX9: has the three actions, the pitch, and no hardware-sensor claim', async () => {
    const { res, body } = await page('/');
    expect(res.status).toBe(200);
    expect(body).toContain('Your phone charger is a power-grid sensor.');
    expect(body).toContain('href="/app">Open web app');
    expect(body).toContain('href="/app/simulate">Watch a blackout');
    expect(body).toContain('Install on Android');
    expect(body).not.toMatch(/undercount|100 ?%/i);
    expect(body).not.toMatch(/judge/i);
  });
});

describe('web app /app', () => {
  it('UX1: every tab has the same dock, three links in the same order, with the current tab marked', async () => {
    for (const tab of APP_TABS) {
      const { res, body } = await page(tab.path);
      expect(res.status).toBe(200);
      const dock = /<nav class="dock"[^>]*>(.*?)<\/nav>/.exec(body)?.[1] ?? '';
      const links = [...dock.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      expect(links).toEqual(['/app', '/app/insights', '/app/settings']);
      expect(dock.match(/aria-current="page"/g)?.length).toBe(1);
      expect(dock).toContain(`href="${tab.path}" aria-current="page"`);
    }
  });

  it('UX6: with no data it draws a map of grey cells and says no phones are reporting', async () => {
    const { body } = await page('/app', []);
    expect(body).toContain(EMPTY_TEXT);
    expect(body).toContain('id="hexmap"');
    expect(body).toContain('href="/app/simulate">Watch a blackout');
    const states = [...body.matchAll(/<path class="hx"[^>]*data-state="([A-Z_]+)"/g)].map((m) => m[1]);
    expect(states.length).toBeGreaterThan(0);
    expect(new Set(states)).toEqual(new Set(['NO_DATA']));
  });

  it('shows a real outage from the index and links no area page', async () => {
    const { body } = await page('/app', [cellView(YABA.cells[0] as string, confirmedNow())]);
    expect(body).toContain('data-state="CONFIRMED"');
    expect(body).not.toContain(EMPTY_TEXT.concat('</h2>'));
    expect(body).not.toContain('href="/area/');
  });

  it('UX7: a cell with no public view renders as NO_DATA, whatever the other cells do', async () => {
    const cells = YABA.cells;
    await fc.assert(
      fc.asyncProperty(fc.subarray([...cells], { minLength: 0, maxLength: cells.length }), async (listed) => {
        const { body } = await page('/app', listed.map((c) => cellView(c, confirmedNow())));
        const drawn = new Map([...body.matchAll(/<path class="hx"[^>]*data-id="([0-9a-f]+)"[^>]*data-state="([A-Z_]+)"/g)].map((m) => [m[1], m[2]]));
        for (const c of cells) expect(drawn.get(c)).toBe(listed.includes(c) ? 'CONFIRMED' : 'NO_DATA');
      }),
      { numRuns: Math.min(NUM_RUNS, 25) },
    );
  });

  it('shows the error card when the index is unavailable', async () => {
    const { body } = await page('/app', null);
    expect(body).toContain(LOAD_ERROR_TEXT);
    expect(body).not.toContain('id="hexmap"');
  });

  it('serves the script and stylesheet from the same origin; the script reads only map.json (UX2)', async () => {
    const js = await page('/app.js');
    expect(js.res.headers.get('content-type')).toContain('javascript');
    expect(js.body).toContain('/api/map.json');
    expect(js.body).not.toMatch(/replay|judge|simulate/i);
    const css = await page('/app.css');
    expect(css.res.headers.get('content-type')).toContain('text/css');
    expect(css.body).toContain('--confirmed');
  });

  it('UX4: no page or asset names another origin', async () => {
    const all = ['/', '/app', '/app/insights', '/app/settings', '/areas', '/app.js', '/app.css'];
    for (const p of all) {
      const { res, body } = await page(p);
      expect(body, p).not.toMatch(ORIGIN);
      expect(body, p).not.toMatch(/(?:fetch|import)\(['"]https?:/);
      expect(res.headers.get('content-security-policy'), p).toContain("default-src 'none'");
    }
  });

  it('CSP allows the same-origin script and stylesheet, and nothing else', async () => {
    const { res } = await page('/app');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/script-src 'nonce-[^']+' 'self'(;|$)/);
    expect(csp).toMatch(/style-src 'nonce-[^']+' 'self'(;|$)/);
    expect(csp).not.toMatch(/https?:|unsafe-/);
  });

  it('app pages stay under 100 KB each with the script and stylesheet', async () => {
    const { body } = await page('/app', [cellView(YABA.cells[0] as string, confirmedNow())]);
    const total = ['/app', '/app.js', '/app.css'];
    let bytes = new TextEncoder().encode(body).length;
    for (const p of total.slice(1)) bytes += new TextEncoder().encode((await page(p)).body).length;
    expect(bytes).toBeLessThan(100 * 1024);
  });

  it('hexLayout is empty for an empty map', () => {
    expect(hexLayout({ city: 'lagos', generatedMs: 0, simulated: false, areas: [], cells: [] }).cells).toEqual([]);
  });
});
