// Visual check at 390 x 844 (web-and-area-pages task 11, steering judge-demo.md).
// Usage: BASE=http://localhost:8787 SHOTS=../../docs/visual node visual/check.mjs
// Drives headless Chromium with Playwright: https://playwright.dev/docs/api/class-browsercontext
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const SHOTS = process.env.SHOTS ?? '../../docs/visual';
const W = 390;
const H = 844;
mkdirSync(SHOTS, { recursive: true });

const pages = [
  { path: '/', name: 'landing', expect: ['Open web app', 'Watch a blackout', 'Install on Android'] },
  { path: '/app', name: 'app-home', expect: ['Home', 'Insights', 'Settings', 'No phones reporting here yet'], app: true },
  { path: '/app/insights', name: 'app-insights', expect: ['Insights', 'No outages recorded yet'], app: true },
  { path: '/app/settings', name: 'app-settings', expect: ['Settings', 'Privacy'], app: true },
  { path: '/areas', name: 'areas', expect: ['Install Outage'] },
  { path: '/app/simulate', name: 'simulate', expect: ['Simulated, not live data', 'Simulate a blackout', 'Power on'], app: true },
  // No area is listed until a person fills in `checkedBy` in the catalog (R10.3), so /area/yaba is the 404 page for now.
  { path: '/area/yaba', name: 'area-yaba', expect: ['Install Outage'], status: [200, 404] },
  { path: '/c/88589c9861fffff', name: 'cell', expect: ['Install Outage'] },
  { path: '/install', name: 'install', expect: ['Install Outage'] },
  { path: '/privacy', name: 'privacy', expect: ['cookies'] },
];
const SIZES = [
  { w: 390, h: 844, tag: '' },
  { w: 1280, h: 800, tag: '-desktop' },
];

const failures = [];
const fail = (where, what) => {
  failures.push(`${where}: ${what}`);
  console.log(`FAIL ${where}: ${what}`);
};
const ok = (where, what) => console.log(`ok   ${where}: ${what}`);

/** Runs in the page: layout measurements. */
function measure() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const small = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const px = Number.parseFloat(getComputedStyle(el).fontSize);
    if (px < (el.closest('.dock') ? 14 : 16)) small.push(`${el.tagName.toLowerCase()}.${el.className} ${px}px "${el.textContent.trim().slice(0, 30)}"`);
  }
  const smallTargets = [];
  for (const el of document.querySelectorAll('button, a')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const inText = el.tagName === 'A' && !el.classList.contains('btn') && el.closest('p, li') !== null;
    // Inline links inside a sentence are exempt (WCAG 2.5.8 inline exception); everything else must be 44 px.
    if (inText) continue;
    if (r.height < 44 || r.width < 44) {
      smallTargets.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, small, smallTargets };
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const origins = new Set();
  const expected404 = new Set(pages.filter((p) => p.status?.includes(404)).map((p) => BASE + p.path));
  page.on('console', (m) => {
    // The browser logs "Failed to load resource" for a 404 page; that is not a script error.
    if (m.type() === 'error' && !expected404.has(m.location().url)) consoleErrors.push(`${m.text()} ${m.location().url}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('request', (r) => origins.add(new URL(r.url()).origin));

  for (const p of pages) {
    const res = await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
    if (!(p.status ?? [200]).includes(res.status())) fail(p.path, `status ${res.status()}`);
    const m = await page.evaluate(measure);
    if (m.scrollWidth > W) fail(p.path, `horizontal scroll, scrollWidth ${m.scrollWidth}`);
    else ok(p.path, `scrollWidth ${m.scrollWidth}`);
    if (m.small.length) fail(p.path, `text under 16 px: ${m.small.join('; ')}`);
    else ok(p.path, 'text >= 16 px');
    if (m.smallTargets.length) fail(p.path, `tap targets under 44 px: ${m.smallTargets.join('; ')}`);
    else ok(p.path, 'tap targets >= 44 px');
    const text = await page.innerText('body');
    for (const s of p.expect) if (!text.includes(s)) fail(p.path, `missing text "${s}"`);
    await page.screenshot({ path: `${SHOTS}/${p.name}.png`, fullPage: false });
  }

  // Laptop width: landing and the app, with the rail dock. Same checks, other screenshots.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const dp = await desk.newPage();
  dp.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${m.text()} ${m.location().url}`);
  });
  dp.on('pageerror', (e) => consoleErrors.push(String(e)));
  dp.on('request', (r) => origins.add(new URL(r.url()).origin));
  for (const p of pages.filter((x) => x.app || x.path === '/')) {
    await dp.goto(BASE + p.path, { waitUntil: 'networkidle' });
    const sw = await dp.evaluate(() => document.documentElement.scrollWidth);
    if (sw > 1280) fail(`${p.path} (1280)`, `horizontal scroll, scrollWidth ${sw}`);
    else ok(`${p.path} (1280)`, `scrollWidth ${sw}`);
    const t = await dp.innerText('body');
    for (const x of p.expect) if (!t.includes(x)) fail(`${p.path} (1280)`, `missing text "${x}"`);
    await dp.screenshot({ path: `${SHOTS}/${p.name}-desktop.png`, fullPage: false });
  }
  await desk.close();
  const desk2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  // App: the map is drawn, a tap on a hex opens the sheet, the dock moves between the three tabs.
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  const hexes = await page.locator('svg#hexmap .hx').count();
  if (hexes < 1) fail('/app', 'no hexagons drawn');
  else ok('/app', `${hexes} hexagons drawn`);
  const bb = await page.locator('svg#hexmap').boundingBox();
  if (!bb || bb.width < 300 || bb.height < 150) fail('/app', 'map is too small to be the hero');
  const vb0 = await page.getAttribute('svg#hexmap', 'viewBox');
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.locator('svg#hexmap .hx').first().click({ force: true });
  const vb1 = await page.getAttribute('svg#hexmap', 'viewBox');
  if (vb0 === vb1) fail('/app', `tapping a hex did not zoom the map (${vb0})`);
  else ok('/app', 'tapping a hex zooms to its area');
  if (await page.locator('#sheet').isHidden()) fail('/app', 'tapping a hex did not open the sheet');
  else ok('/app', 'tapping a hex opens the sheet');
  await page.screenshot({ path: `${SHOTS}/app-home-sheet.png` });
  const dockLinks = await page.locator('nav.dock a').allInnerTexts();
  if (dockLinks.join(',') !== 'Home,Insights,Settings') fail('/app', `dock is ${dockLinks.join(',')}`);
  else ok('/app', 'dock is Home, Insights, Settings');
  await page.click('nav.dock a[href="/app/insights"]');
  await page.waitForURL('**/app/insights');
  ok('/app', 'dock opens Insights');

  // Simulation: one button plays Possible, Confirmed, Restored with counts. Screenshots of each state.
  async function playSim(pg, tag) {
    await pg.goto(`${BASE}/app/simulate`, { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => !document.getElementById('go').disabled);
    const dots = await pg.locator('#dots circle').count();
    if (dots < 3) fail(`/app/simulate${tag}`, `only ${dots} phones drawn`);
    await pg.screenshot({ path: `${SHOTS}/simulate-ready${tag}.png` });
    await pg.click('#go');
    for (const [state, name] of [['POSSIBLE', 'possible'], ['CONFIRMED', 'confirmed'], ['RESTORED', 'restored']]) {
      try {
        await pg.waitForSelector(`#simstate[data-state=${state}]`, { timeout: 15000 });
        await pg.waitForTimeout(100);
        await pg.evaluate(() => window.scrollTo(0, 0));
        const c = await pg.innerText('#simcount');
        if (!/\d+ of \d+ phones/.test(c)) fail(`/app/simulate${tag}`, `no count in ${state}: ${c}`);
        await pg.screenshot({ path: `${SHOTS}/simulate-${name}${tag}.png` });
        ok(`/app/simulate${tag}`, `${state}: ${c}`);
      } catch {
        fail(`/app/simulate${tag}`, `never reached ${state}`);
      }
    }
    await pg.waitForFunction(() => document.getElementById('go').textContent === 'Simulate again', null, { timeout: 15000 });
    const banner = await pg.locator('.sim-banner').boundingBox();
    if (!banner || banner.y > 1) fail(`/app/simulate${tag}`, 'banner is not pinned at the top');
  }
  await playSim(page, '');
  const sp = await desk2.newPage();
  await playSim(sp, '-desktop');
  await desk2.close();
  const jr = await page.request.get(`${BASE}/judge`, { maxRedirects: 0 });
  if (jr.status() !== 301) fail('/judge', `status ${jr.status()}, want 301`);
  else ok('/judge', '301 to the simulation');

  if (consoleErrors.length) fail('all', `console errors: ${consoleErrors.join(' | ')}`);
  else ok('all', 'no console errors');
  const foreign = [...origins].filter((o) => o !== new URL(BASE).origin && !o.startsWith('data:'));
  if (foreign.length) fail('all', `requests to other origins: ${foreign.join(', ')}`);
  else ok('all', `only same-origin requests (${[...origins].join(', ')})`);

  // Offline refresh through the service worker (ADR 0016, ADR 0029).
  await page.goto(`${BASE}/app/simulate`, { waitUntil: 'networkidle' });
  const ready = await page.evaluate(async () => {
    const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 5000))]);
    return Boolean(r);
  });
  if (!ready) fail('/app/simulate offline', 'service worker never became ready');
  else {
    await page.reload({ waitUntil: 'networkidle' });
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 8000 });
      const t = await page.innerText('body');
      if (t.includes('Simulated, not live data')) ok('/app/simulate offline', 'reload offline still plays, banner shown');
      else fail('/app/simulate offline', 'banner missing after offline reload');
    } catch (e) {
      fail('/app/simulate offline', `reload failed: ${e.message}`);
    }
    await context.setOffline(false);
    const cached = await page.evaluate(async () => {
      const out = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out.sort();
    });
    if (cached.every((p) => ['/app/simulate', '/simulate.js', '/app.css', '/api/v1/public/judge/replay'].includes(p))) ok('cache', `only simulation files cached (${cached.join(', ')})`);
    else fail('cache', `unexpected cache entries: ${cached.join(', ')}`);
  }
  await context.close();

  // Scripts off: the banner and the sentence are server-rendered.
  const noJs = await browser.newContext({ viewport: { width: W, height: H }, javaScriptEnabled: false });
  const p2 = await noJs.newPage();
  await p2.goto(`${BASE}/app/simulate`, { waitUntil: 'load' });
  const t2 = await p2.innerText('body');
  const missing = ['Simulated, not live data', 'Watch ten simulated phones'].filter((x) => !t2.includes(x));
  if (missing.length) fail('/app/simulate scripts off', `missing ${missing.join(', ')}`);
  else ok('/app/simulate scripts off', 'banner and sentence are readable');
  await noJs.close();
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll visual checks passed');
process.exit(failures.length ? 1 : 0);
