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
  { path: '/judge', name: 'judge', expect: ['Simulated replay', 'Your spot only', 'Possible power cut', 'Power cut', 'Power is back', 'not live'] },
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

  // Judge controls: play, pause, restart, 1x 2x 4x exist, fit the width and respond.
  await page.goto(`${BASE}/judge`, { waitUntil: 'networkidle' });
  for (const sel of ['#play', '#restart', '[data-speed="1"]', '[data-speed="2"]', '[data-speed="4"]']) {
    const box = await page.locator(sel).boundingBox();
    if (!box) fail('/judge', `control ${sel} not visible`);
    else if (box.x < 0 || box.x + box.width > W) fail('/judge', `control ${sel} overflows the width`);
  }
  await page.click('#play');
  await page.waitForTimeout(1500);
  if (await page.locator('#pause').isHidden()) fail('/judge', 'Pause did not appear after Play');
  else ok('/judge', 'Play shows Pause');
  await page.click('[data-speed="4"]');
  if ((await page.getAttribute('[data-speed="4"]', 'aria-pressed')) !== 'true') fail('/judge', '4x did not become pressed');
  await page.click('#pause');
  await page.click('#restart');
  await page.screenshot({ path: `${SHOTS}/judge-controls.png` });

  if (consoleErrors.length) fail('all', `console errors: ${consoleErrors.join(' | ')}`);
  else ok('all', 'no console errors');
  const foreign = [...origins].filter((o) => o !== new URL(BASE).origin && !o.startsWith('data:'));
  if (foreign.length) fail('all', `requests to other origins: ${foreign.join(', ')}`);
  else ok('all', `only same-origin requests (${[...origins].join(', ')})`);

  // Offline refresh through the service worker (ADR 0016).
  await page.goto(`${BASE}/judge`, { waitUntil: 'networkidle' });
  const ready = await page.evaluate(async () => {
    const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 5000))]);
    return Boolean(r);
  });
  if (!ready) fail('/judge offline', 'service worker never became ready');
  else {
    await page.reload({ waitUntil: 'networkidle' }); // let the worker control the page and fill the cache
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const t = await page.innerText('body');
      if (t.includes('Simulated replay')) ok('/judge offline', 'reload offline still shows the banner');
      else fail('/judge offline', 'banner missing after offline reload');
      await page.screenshot({ path: `${SHOTS}/judge-offline.png` });
    } catch (e) {
      fail('/judge offline', `reload failed: ${e.message}`);
    }
    // Only /judge is cached (checked in the Cache Storage, since the HTTP cache may also hold visited pages).
    await context.setOffline(false);
    const cached = await page.evaluate(async () => {
      const out = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
    if (cached.length === 1 && cached[0] === '/judge') ok('cache', 'only /judge is cached');
    else fail('cache', `expected only /judge, found ${cached.join(', ')}`);
  }
  await context.close();

  // Scripts off: everything is server-rendered.
  const noJs = await browser.newContext({ viewport: { width: W, height: H }, javaScriptEnabled: false });
  const p2 = await noJs.newPage();
  await p2.goto(`${BASE}/judge`, { waitUntil: 'load' });
  const t2 = await p2.innerText('body');
  const need = pages.find((x) => x.path === '/judge').expect;
  const missing = need.filter((s) => !t2.includes(s));
  if (missing.length) fail('/judge scripts off', `missing ${missing.join(', ')}`);
  else ok('/judge scripts off', 'all five states and the banner are readable');
  await p2.screenshot({ path: `${SHOTS}/judge-no-js.png` });
  await noJs.close();
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll visual checks passed');
process.exit(failures.length ? 1 : 0);
