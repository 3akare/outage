// Landing page at / (ADR 0053). Outage Light: a short hero beside the live street map of the simulated Lagos (MapLibre over
// OpenFreeMap, see-through hexagons coloured by power), how one power cut is caught, the features, a real chart from the
// simulated history, and the downloads. Google Play and Aptoide appear only when their links are configured; GitHub is
// always there. Does not repeat any hardware-sensor claim (UX9) and invents no figure.
import { brandLink, FAVICON_LINK } from '../site/brand.ts';
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { html, type Rendered } from '../site/headers.ts';
import { icon, type IconName } from '../site/icons.ts';
import type { Site } from '../site/layout.ts';
import { LOGO_SVG } from '../site/logo.gen.ts';
import { MAPLIBRE_CSS_PATH, SIMULATE_PATH } from '../ui/simulate/simulate.ts';

export const SIMULATE_HREF = SIMULATE_PATH;
export const REPO_URL = 'https://github.com/3akare/outage';
export const LANDING_JS_PATH = '/js/landing.js';

type Store = { href: string; label: string; over: string; icon: IconName };

/** The download buttons that have a link. GitHub is always there: the APK link, or the releases page. */
export function stores(site: Site): Store[] {
  const out: Store[] = [];
  const play = site.playUrl ? safeHref(site.playUrl) : null;
  const aptoide = site.aptoideUrl ? safeHref(site.aptoideUrl) : null;
  if (play) out.push({ href: play, label: 'Get it on Google Play', over: 'Get it on', icon: 'play' });
  if (aptoide) out.push({ href: aptoide, label: 'Get it on Aptoide', over: 'Get it on', icon: 'store' });
  const apk = site.apkUrl ? safeHref(site.apkUrl) : null;
  out.push({ href: apk ?? `${REPO_URL}/releases/latest`, label: 'Download the APK from GitHub', over: 'Download the APK from', icon: 'code' });
  return out;
}

const FEATURES: [IconName, string, string][] = [
  ['alarm', 'Light Alarm', 'Rings when power returns at your spot, even at 3 a.m. Works offline.'],
  ['phone', 'Home Watch', 'A spare phone charging at home tells your main phone if the power is on.'],
  ['freezer', 'Freezer Guard', 'Warns you when your spot has been without power for longer than you set.'],
  ['chart', 'Insights', 'Hours of power each day against your tariff band, when cuts happen, and how your area compares.'],
];

const STEPS: [string, string, string][] = [
  ['2:14:03', 'Your charger stops', 'Outage on your phone notes the moment.'],
  ['2:14:09', 'Phones nearby stop too', 'Within seconds, other chargers in the same block go quiet.'],
  ['2:15:39', 'The block turns red', 'Too many at once to be people unplugging. Nobody had to report it.'],
  ['4:02:17', 'Your alarm rings', 'Power is back at your spot, so you can switch the pump on.'],
];

export function renderLanding(site: Site): Rendered {
  const nav =
    `<header class="nav"><div class="container">${brandLink('/')}<nav class="links" aria-label="Site">` +
    `<a href="#how">How it works</a><a href="/areas">Areas</a>` +
    `<a class="btn primary" href="${SIMULATE_HREF}">Open the app</a></nav></div></header>`;
  const legend = (['CONFIRMED', 'POSSIBLE', 'RESTORED', 'NORMAL'] as const)
    .map((s) => `<span><i class="sw" data-state="${s}"></i>${{ CONFIRMED: 'Out', POSSIBLE: 'Maybe', RESTORED: 'Back', NORMAL: 'On' }[s]}</span>`)
    .join('');
  const hero =
    '<section class="hero" aria-labelledby="hero-h"><div class="container"><div>' +
    '<h1 id="hero-h">See where the power is out, block by block.</h1>' +
    '<p class="lead">Your phone charger is a power-grid sensor. When the grid fails, every charging phone nearby stops at once, and Outage colours that block on the map.</p>' +
    `<div class="actions"><a class="btn primary lg" href="${SIMULATE_HREF}">Try the app in your browser</a><a class="btn outline lg" href="#get">Get it for Android</a></div></div>` +
    '<figure class="mapcard" aria-label="Street map with simulated power blocks">' +
    `<div class="map" id="heromap"></div><div class="float"><span class="pillbox">${LOGO_SVG}<span class="tag">Simulated</span></span></div>` +
    `<div class="legend" aria-hidden="true">${legend}</div></figure></div></section>`;
  const how =
    '<section class="section alt" id="how" aria-labelledby="how-h"><div class="container">' +
    '<h2 id="how-h">One power cut, minute by minute</h2>' +
    '<p class="lead">Three phones in a block must agree before Outage shows a cut. One phone alone never does.</p>' +
    `<ol class="steps">${STEPS.map(([t, h, p]) => `<li><h3>${h}</h3><p>${p}</p><time>${t}</time></li>`).join('')}</ol></div></section>`;
  const features =
    '<section class="section" aria-labelledby="feat-h"><div class="container">' +
    '<h2 id="feat-h">Useful from the first phone</h2>' +
    `<ul class="feats">${FEATURES.map(([i, h, p]) => `<li class="feat"><span class="ico-wrap">${icon(i)}</span><div><h3>${h}</h3><p>${p}</p></div></li>`).join('')}</ul>` +
    '</div></section>';
  const insights =
    '<section class="section alt" aria-labelledby="ins-h"><div class="container">' +
    '<h2 id="ins-h">Know when the power goes</h2>' +
    '<p class="lead">Outage keeps a record of every cut at your spot and checks it against what your tariff band promises.</p>' +
    '<div class="preview"><div class="card"><h3>Hours of power each day in Yaba</h3><p class="sub" id="herostat">Simulated, last 30 days.</p><div class="plot" id="herochart"></div></div>' +
    '<div class="card"><h3>Also in Insights</h3><ul class="list sub"><li>When outages happen, by weekday and hour</li><li>How your area compares with the areas around it</li><li>Every outage, how long it lasted, and how long power usually takes to come back</li></ul>' +
    `<p><a class="btn tonal" href="${SIMULATE_HREF}">Open Insights in the app</a></p></div></div></div></section>`;
  const get =
    '<section class="section get" id="get" aria-labelledby="get-h"><div class="container">' +
    '<h2 id="get-h">Get Outage for Android</h2>' +
    '<p class="lead">Free and open source. No account, and never your exact location.</p>' +
    `<div class="stores">${stores(site)
      .map((s) => `<a class="store" href="${e(s.href)}" aria-label="${s.label}">${icon(s.icon)}<span><small>${s.over}</small><b>${s.label.replace(/^(Get it on |Download the APK from )/, '')}</b></span></a>`)
      .join('')}</div>` +
    `<p class="muted">No Android phone? <a href="${SIMULATE_HREF}">Try the app in your browser</a> on a simulated city.</p>` +
    '</div></section>';
  const foot =
    `<footer class="site-foot"><div class="container">${brandLink('/')}` +
    `<nav aria-label="Footer"><ul><li><a href="${SIMULATE_HREF}">Try it</a></li><li><a href="/areas">Areas</a></li><li><a href="/install">Install</a></li><li><a href="/privacy">Privacy</a></li><li><a href="${REPO_URL}">Source code</a></li></ul></nav>` +
    '<small>Map data © OpenStreetMap contributors. Map tiles by OpenFreeMap. Map drawn with MapLibre.</small></div></footer>';
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>Outage: see where the power is out</title>' +
    '<meta name="description" content="Phones that are charging stop together when the power goes. Outage confirms blackouts block by block on a map and tells you when power is back.">' +
    '<meta name="theme-color" content="#ffffff">' +
    `<link rel="canonical" href="${e(site.origin)}/">${FAVICON_LINK}` +
    `<link rel="stylesheet" href="${MAPLIBRE_CSS_PATH}"><link rel="stylesheet" href="/app.css"></head><body>${nav}<main>${hero}${how}${features}${insights}${get}</main>${foot}` +
    `<div class="tip" id="tip" role="tooltip" hidden></div><script type="module" src="${LANDING_JS_PATH}"></script></body></html>`;
  return html(page, 3600, { map: true });
}
