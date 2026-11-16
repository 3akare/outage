// Visual check at 390 x 844 and 1280 x 800 (web-and-area-pages task 11, material-redesign, steering judge-demo.md).
// Usage: BASE=http://localhost:8787 SHOTS=../docs/visual node visual/check.mjs
// Drives headless Chromium with Playwright: https://playwright.dev/docs/api/class-browsercontext
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const SHOTS = process.env.SHOTS ?? '../docs/visual';
const W = 390;
const H = 844;
mkdirSync(SHOTS, { recursive: true });

const pages = [
  { path: '/', name: 'landing', expect: ['Your phone charger is a', 'Try the app in your browser', 'GitHub'] },
  { path: '/areas', name: 'areas', expect: ['Install Outage'] },
  { path: '/app/simulate', name: 'simulate', expect: ['simulated data, not live', 'Your charger is a power sensor', 'Use my location'], app: true },
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

/** Runs in the page: layout measurements. Text follows the Material 3 type scale (11 px label-small is the floor). */
function measure() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"]');
  };
  const small = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const px = Number.parseFloat(getComputedStyle(el).fontSize);
    if (px < 11) small.push(`${el.tagName.toLowerCase()}.${el.className} ${px}px "${el.textContent.trim().slice(0, 30)}"`);
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

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const consoleErrors = [];
  const origins = new Set();
  const expected404 = new Set(pages.filter((p) => p.status?.includes(404)).map((p) => BASE + p.path));
  const watch = (pg) => {
    // The browser logs "Failed to load resource" for a 404 page; that is not a script error.
    pg.on('console', (m) => {
      if (m.type() === 'error' && !expected404.has(m.location().url)) consoleErrors.push(`${m.text()} ${m.location().url}`);
    });
    pg.on('pageerror', (e) => consoleErrors.push(String(e)));
    pg.on('request', (r) => origins.add(new URL(r.url()).origin));
  };

  for (const size of SIZES) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, colorScheme: scheme });
      const page = await ctx.newPage();
      watch(page);
      const tag = `${size.tag}${scheme === 'dark' ? '-dark' : ''}`;
      for (const p of pages) {
        if (scheme === 'dark' && !(p.app || p.path === '/')) continue;
        const res = await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
        const where = `${p.path} (${size.w}${scheme === 'dark' ? ', dark' : ''})`;
        if (!(p.status ?? [200]).includes(res.status())) fail(where, `status ${res.status()}`);
        const m = await page.evaluate(measure);
        if (m.scrollWidth > size.w) fail(where, `horizontal scroll, scrollWidth ${m.scrollWidth}`);
        if (m.small.length) fail(where, `text under 11 px: ${m.small.join('; ')}`);
        if (m.smallTargets.length) fail(where, `tap targets under 44 px: ${m.smallTargets.join('; ')}`);
        const text = await page.innerText('body');
        for (const s of p.expect) if (!text.includes(s)) fail(where, `missing text "${s}"`);
        if (!m.small.length && !m.smallTargets.length && m.scrollWidth <= size.w) ok(where, 'layout, text and targets');
        await page.screenshot({ path: `${SHOTS}/${p.name}${tag}.png`, fullPage: false });
      }
      await ctx.close();
    }
  }

  // The app in the browser: first run, the map, the whole blackout, the Light Alarm, the bar and its tabs.
  async function playApp(size, tag) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    watch(pg);
    const where = `/app/simulate${tag}`;
    await pg.goto(`${BASE}/app/simulate`, { waitUntil: 'networkidle' });
    await pg.screenshot({ path: `${SHOTS}/simulate-welcome${tag}.png` });
    await pg.click('#useloc');
    await pg.click('.scrim button[data-a="1"]');
    await pg.waitForTimeout(600);
    const hexes = await pg.locator('#map .hx').count();
    if (hexes !== 21) fail(where, `${hexes} blocks drawn, want 21`);
    else ok(where, '21 blocks drawn, spot set');
    const bar = await pg.locator('nav.navbar button').allInnerTexts();
    if (bar.map((s) => s.trim()).join(',') !== 'Insights,Home,Settings') fail(where, `bar is ${bar.join(',')}`);
    else ok(where, 'bar is Insights, Home, Settings');
    await pg.screenshot({ path: `${SHOTS}/simulate-home${tag}.png` });
    await pg.waitForFunction(() => !document.getElementById('go').disabled);
    await pg.click('#go');
    for (const [state, name] of [['POSSIBLE', 'possible'], ['CONFIRMED', 'confirmed']]) {
      try {
        await pg.waitForSelector(`#spotcard[data-state=${state}]`, { timeout: 20000 });
        await pg.waitForTimeout(300);
        const c = await pg.innerText('#spotsub');
        if (!/\d+ of \d+ phones/.test(c)) fail(where, `no count in ${state}: ${c}`);
        await pg.screenshot({ path: `${SHOTS}/simulate-${name}${tag}.png` });
        ok(where, `${state}: ${c}`);
      } catch {
        fail(where, `never reached ${state}`);
      }
    }
    try {
      await pg.waitForSelector('.alarm', { timeout: 30000 });
      await pg.screenshot({ path: `${SHOTS}/simulate-alarm${tag}.png` });
      await pg.click('.alarm button');
      ok(where, 'Light Alarm rang at restore and stopped');
    } catch {
      fail(where, 'the Light Alarm never rang');
    }
    await pg.waitForFunction(() => document.getElementById('go').textContent === 'Simulate again', null, { timeout: 20000 });
    await pg.screenshot({ path: `${SHOTS}/simulate-restored${tag}.png` });
    for (const tab of ['insights', 'settings']) {
      await pg.click(`nav.navbar button[data-tab="${tab}"]`);
      await pg.waitForTimeout(200);
      await pg.screenshot({ path: `${SHOTS}/simulate-${tab}${tag}.png` });
    }
    const banner = await pg.locator('.sim-banner').boundingBox();
    if (!banner || banner.y > 1) fail(where, 'banner is not pinned at the top');
    await ctx.close();
  }
  await playApp({ w: W, h: H }, '');
  await playApp({ w: 1280, h: 800 }, '-desktop');

  const probe = await browser.newContext();
  for (const path of ['/app', '/app/insights', '/app/settings', '/judge']) {
    const r = await probe.request.get(BASE + path, { maxRedirects: 0 });
    if (r.status() !== 301 || r.headers().location !== '/app/simulate') fail(path, `status ${r.status()} to ${r.headers().location}`);
    else ok(path, '301 to the app in the browser');
  }
  await probe.close();

  if (consoleErrors.length) fail('all', `console errors: ${consoleErrors.join(' | ')}`);
  else ok('all', 'no console errors');
  const foreign = [...origins].filter((o) => o !== new URL(BASE).origin && !o.startsWith('data:'));
  if (foreign.length) fail('all', `requests to other origins: ${foreign.join(', ')}`);
  else ok('all', `only same-origin requests (${[...origins].join(', ')})`);

  // Offline refresh through the service worker (ADR 0016, ADR 0029).
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
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
      await page.waitForSelector('#useloc', { timeout: 8000 });
      const t = await page.innerText('body');
      if (t.includes('simulated data, not live')) ok('/app/simulate offline', 'reload offline still works, banner shown');
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
    const allowed = ['/app/simulate', '/simulate.js', '/app.css', '/favicon.svg', '/api/v1/public/judge/replay'];
    if (cached.every((p) => allowed.includes(p))) ok('cache', `only simulation files cached (${cached.join(', ')})`);
    else fail('cache', `unexpected cache entries: ${cached.join(', ')}`);
  }
  await context.close();

  // Scripts off: the banner, the guide and the app as it looks after first run are server-rendered.
  const noJs = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  const p2 = await noJs.newPage();
  await p2.goto(`${BASE}/app/simulate`, { waitUntil: 'load' });
  const t2 = await p2.innerText('body');
  const missing = ['simulated data, not live', 'This is the Outage Android app running in your browser', 'Power is on'].filter((x) => !t2.includes(x));
  if (missing.length) fail('/app/simulate scripts off', `missing ${missing.join(', ')}`);
  else ok('/app/simulate scripts off', 'banner, guide and app are readable');
  await noJs.close();
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll visual checks passed');
process.exit(failures.length ? 1 : 0);
