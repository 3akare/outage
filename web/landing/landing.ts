// Landing page at / (ADR 0054). Outage Daylight: a centred headline and one sentence, then the live street map of the
// simulated city (MapLibre over OpenFreeMap) with the app's own Now card on it, how one power cut is caught, the features
// with a real chart from the simulated history, the privacy facts, and the downloads. Google Play and Aptoide appear only when their links are configured; GitHub is
// always there. Does not repeat any hardware-sensor claim (UX9) and invents no figure.
import { brandLink, FAVICON_LINK } from '../site/brand.ts';
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { html, type Rendered } from '../site/headers.ts';
import { icon, type IconName } from '../site/icons.ts';
import type { Site } from '../site/layout.ts';
import { LOGO_SVG } from '../site/logo.gen.ts';
import { APP_CSS_HREF } from '../ui/app/design.ts';
import { legendHtml, MAPLIBRE_CSS_PATH, SIMULATE_PATH } from '../ui/simulate/simulate.ts';
import lagosStates from '@outage/shared/fixtures/places/lagos-states.json' with { type: 'json' };
import { CATALOG } from '../areas/catalog/index.ts';
import { lgasOf } from '../areas/catalog/schema.ts';

export const SIMULATE_HREF = SIMULATE_PATH;
export const REPO_URL = 'https://github.com/3akare/outage';
export const LANDING_JS_PATH = '/js/landing.js';

type Store = { href: string; label: string; over: string };

/** The download buttons that have a link. GitHub is always there: the APK link, or the releases page. */
export function stores(site: Site): Store[] {
  const out: Store[] = [];
  const play = site.playUrl ? safeHref(site.playUrl) : null;
  const aptoide = site.aptoideUrl ? safeHref(site.aptoideUrl) : null;
  if (play) out.push({ href: play, label: 'Get it on Google Play', over: 'Get it on' });
  if (aptoide) out.push({ href: aptoide, label: 'Get it on Aptoide', over: 'Get it on' });
  const apk = site.apkUrl ? safeHref(site.apkUrl) : null;
  out.push({ href: apk ?? `${REPO_URL}/releases/latest`, label: 'Download the APK from GitHub', over: 'Download the APK from' });
  return out;
}

const FEATURES: [IconName, string, string, string][] = [
  ['alarm', 'red', 'Light Alarm', 'Rings when power returns at your spot, even at 3 a.m. Works offline.'],
  ['chart', 'green', 'Power Log', 'Your hours of power each day, kept on your phone. No account, no server needed.'],
];

const STEPS: [string, string, string, string][] = [
  ['2:14:03', 'POSSIBLE', 'Your charger stops', 'Outage on your phone notes the second.'],
  ['2:14:09', 'POSSIBLE', 'Phones nearby stop too', 'Other chargers in the same block go quiet.'],
  ['2:15:39', 'CONFIRMED', 'The block turns red', 'Too many at once to be luck. Nobody reported it.'],
  ['4:02:17', 'RESTORED', 'Your alarm rings', 'Power is back, so you can switch the pump on.'],
];

/** The Now card for Eti-Osa (Lekki, Ikoyi and Victoria Island) as the simulated Lagos has it, the same component the app shows. */
function nowCard(): string {
  const eti = lgasOf(CATALOG.areas).find((a) => a.slug === 'eti-osa');
  const states = lagosStates.states as Record<string, string>;
  const cells = eti?.cells ?? [];
  const on = cells.filter((c) => states[c] === 'NORMAL').length;
  return (
    '<div class="status nowcard" data-state="NORMAL" aria-label="The Now screen of the app, for Eti-Osa"><div class="status-top">' +
    `<span class="glyph">${LOGO_SVG}</span><p class="status-word">Power is on</p><p class="status-for">Eti-Osa, right now</p></div>` +
    `<div class="status-body"><p class="sub">On in ${on} of ${cells.length} blocks. Simulated.</p>` +
    '<ol class="track" aria-hidden="true"><li class="done">On</li><li>Maybe</li><li>Out</li><li>Back</li></ol></div></div>'
  );
}

export function renderLanding(site: Site): Rendered {
  const nav =
    `<header class="site-top"><div class="container">${brandLink('/')}<nav aria-label="Site">` +
    `<a class="hide-s" href="#how">How it works</a><a class="hide-s" href="/areas">Areas</a>` +
    `<a class="btn primary" href="${SIMULATE_HREF}">Open the app</a></nav></div></header>`;
  const hero =
    '<section class="hero" aria-labelledby="hero-h"><div class="container">' +
    '<h1 id="hero-h">Know the moment the power goes.</h1>' +
    '<p class="lead">Your phone charger is a power-grid sensor for your street.</p>' +
    `<div class="actions"><a class="btn primary lg" href="${SIMULATE_HREF}">Try the app in your browser</a><a class="btn text lg" href="#get">Get it for Android</a></div></div>` +
    '<figure class="stage" aria-label="Street map with simulated power blocks"><div class="stage-in">' +
    `<div class="map" id="heromap"></div>${nowCard()}${legendHtml()}</div></figure></section>`;
  const how =
    '<section class="section" id="how" aria-labelledby="how-h"><div class="container">' +
    '<h2 id="how-h">One power cut, minute by minute.</h2>' +
    '<p class="lead">Three phones in a block must agree before Outage shows a cut. One phone alone never does.</p>' +
    `<ol class="timeline">${STEPS.map(([t, st, h, p]) => `<li data-state="${st}"><time class="num">${t}</time><h3>${h}</h3><p>${p}</p></li>`).join('')}</ol></div></section>`;
  const features =
    '<section class="section" aria-labelledby="feat-h"><div class="container">' +
    '<h2 id="feat-h">Useful from the first phone.</h2>' +
    '<ul class="bento">' +
    FEATURES.map(([i, c, h, p]) => `<li><span class="tile ${c}">${icon(i)}</span><h3>${h}</h3><p>${p}</p></li>`).join('') +
    '</ul></div></section>';
  const privacy =
    '<section class="section" aria-labelledby="priv-h"><div class="container">' +
    '<h2 id="priv-h">No account. Never your exact location.</h2>' +
    '<ul class="facts"><li><b>Three phones or more</b><span>An area shows on the map only when 3 or more phones are there.</span></li>' +
    '<li><b>A block, not a dot</b><span>Your position picks a block about 0.7 km across, then it is dropped.</span></li>' +
    '<li><b>No cookies</b><span>This site sets none and runs no analytics. <a href="/privacy">Read the privacy page</a>.</span></li></ul></div></section>';
  const get =
    '<section class="section get" id="get" aria-labelledby="get-h"><div class="container">' +
    '<h2 id="get-h">Get Outage for Android.</h2>' +
    '<p class="lead">Free and open source.</p>' +
    `<div class="stores">${stores(site)
      .map((s) => `<a class="store" href="${e(s.href)}" aria-label="${s.label}"><span><small>${s.over}</small><b>${s.label.replace(/^(Get it on |Download the APK from )/, '')}</b></span></a>`)
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
    '<title>Outage: know the moment the power goes</title>' +
    '<meta name="description" content="Phones that are charging stop together when the power goes. Outage confirms blackouts block by block on a map and tells you when power is back.">' +
    '<meta name="theme-color" content="#f5f5f7">' +
    `<link rel="canonical" href="${e(site.origin)}/">${FAVICON_LINK}` +
    `<link rel="stylesheet" href="${MAPLIBRE_CSS_PATH}"><link rel="stylesheet" href="${APP_CSS_HREF}"></head><body>${nav}<main>${hero}${how}${features}${privacy}${get}</main>${foot}` +
    `<script type="module" src="${LANDING_JS_PATH}"></script></body></html>`;
  return html(page, 3600, { map: true });
}
