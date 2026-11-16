// Landing page at / (ux-redesign task 2, ADR 0027). Static: no data, no script. Three actions: open the web app,
// watch a simulated blackout, install on Android. Styled by /app.css. Does not repeat any hardware-sensor claim (UX9).
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { html, type Rendered } from '../site/headers.ts';
import type { Site } from '../site/layout.ts';

export const SIMULATE_HREF = '/app/simulate';

// A small hex picture, 7 cells: a quiet area, a cut spreading, and power back. Illustration only, not data.
const HEX = (cx: number, cy: number, r: number): string => {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `${pts.join('')}Z`;
};

function art(): string {
  const r = 52;
  const w = Math.sqrt(3) * r;
  const cells: [number, number, string][] = [
    [200, 150, 'CONFIRMED'],
    [200 + w, 150, 'POSSIBLE'],
    [200 - w, 150, 'CONFIRMED'],
    [200 + w / 2, 150 - 1.5 * r, 'POSSIBLE'],
    [200 - w / 2, 150 - 1.5 * r, 'NORMAL'],
    [200 + w / 2, 150 + 1.5 * r, 'RESTORED'],
    [200 - w / 2, 150 + 1.5 * r, 'NORMAL'],
  ];
  const paths = cells.map(([x, y, s]) => `<path class="hx" data-state="${s}" d="${HEX(x, y, r - 2)}"/>`).join('');
  const defs =
    '<defs><pattern id="p-possible" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" class="pp-bg"/><rect width="5" height="14" class="pp-possible"/></pattern>' +
    '<pattern id="p-confirmed" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" class="pp-bg"/><circle cx="7" cy="7" r="4.5" class="pp-confirmed"/></pattern></defs>';
  return `<svg viewBox="0 0 400 300" role="img" aria-label="Picture of hexagon areas. Some are red, some amber, some green, one blue." xmlns="http://www.w3.org/2000/svg">${defs}${paths}</svg>`;
}

const LOGO =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l11 6.4v12.8L16 27.6 5 21.2V8.4z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 8l-5 9h4l-1 7 5-9h-4z" fill="#3ddc97"/></svg>';

export function renderLanding(site: Site): Rendered {
  const install = e(site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install');
  const body =
    `<div class="land"><div class="nav"><a class="brand" href="/">${LOGO}Outage</a><a class="link" href="/app">Web app</a></div>` +
    '<main><section class="hero"><div><h1>Your phone charger is a power-grid sensor.</h1>' +
    '<p class="lead">When the power goes, every charging phone nearby stops charging at the same moment. Outage sees that, confirms the blackout, and tells you when the lights come back. Nobody has to report anything.</p>' +
    `<div class="cta"><a class="btn" href="/app">Open web app</a><a class="btn alt" href="${SIMULATE_HREF}">Watch a blackout</a><a class="btn alt" href="${install}">Install on Android</a></div></div>` +
    `<div class="hero-art">${art()}</div></section>` +
    '<ol class="steps"><li><span class="n">1</span><h3>Plug in your phone</h3><p>Outage notices when charging stops. It needs one tap to start and nothing else.</p></li>' +
    '<li><span class="n">2</span><h3>See your area</h3><p>A map of hexagons shows which areas have power. Grey means no phones are reporting there yet.</p></li>' +
    '<li><span class="n">3</span><h3>Know when it is back</h3><p>Get an alarm when power returns at your spot, even at 3 a.m.</p></li></ol>' +
    '<p class="privacy-line">Private by design. No account, no exact location, and an area shows only when 3 or more phones agree.</p></main>' +
    `<div class="foot"><a href="/app">Web app</a><a href="${SIMULATE_HREF}">Simulation</a><a href="/install">Install</a><a href="/areas">All areas</a><a href="/privacy">Privacy</a></div></div>`;
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0f141b">' +
    '<title>Outage: your phone charger is a power-grid sensor</title>' +
    '<meta name="description" content="Phones that are charging stop together when the power goes. Outage confirms blackouts area by area and tells you when power is back.">' +
    `<link rel="canonical" href="${e(site.origin)}/">` +
    `<link rel="stylesheet" href="/app.css"></head><body>${body}</body></html>`;
  return html(page, 3600);
}
