// The Outage app in the browser, for people without an Android phone (ADR 0049, ADR 0054). The same four tabs as the
// phone: Now (one giant answer for your spot), Map (a street map of Lagos with see-through hexagons coloured by power),
// Insights with charts, and Settings. Everything on it is simulated and says so. The
// blackout is the replay built by tools/sim from the real detection engine; the page never reads the public index (W6).
// This file renders the shell. The behaviour is in public/js/app.js, served as a static file with MapLibre.
import city from '@outage/shared/fixtures/demo-city.json' with { type: 'json' };
import { FAVICON_LINK } from '../../site/brand.ts';
import { escapeHtml as e, safeHref } from '../../site/escape.ts';
import { html, json, type Rendered } from '../../site/headers.ts';
import { icon, type IconName } from '../../site/icons.ts';
import type { Site } from '../../site/layout.ts';
import { LOGO_SVG } from '../../site/logo.gen.ts';

export const SIMULATE_PATH = '/app/simulate';
export const APP_JS_PATH = '/js/app.js';
export const MAPLIBRE_CSS_PATH = '/vendor/maplibre-gl/maplibre-gl.css';
export const DEMO_CITY_PATH = '/demo-city.json';
export const SIM_BANNER_TEXT = 'Simulation';
export const SIM_SENTENCE = 'This is the Outage Android app running in your browser. Every phone, area and number on it is simulated.';
const TTL_SECONDS = 3600;

/** The words the phone uses for each state (strings.xml map_desc_*). */
export const STATE_WORDS = {
  NORMAL: 'Power is on',
  POSSIBLE: 'Power may be out',
  CONFIRMED: 'Power is out',
  RESTORED: 'Power is back',
  NO_DATA: 'Not enough phones here yet',
} as const;

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: 'now', label: 'Now', icon: 'home' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
export const NAV_ORDER = NAV.map((n) => n.label);

/** The map key: the four power states and "no data". */
export const LEGEND = [
  { state: 'CONFIRMED', label: 'Out' },
  { state: 'POSSIBLE', label: 'Maybe' },
  { state: 'RESTORED', label: 'Back' },
  { state: 'NORMAL', label: 'On' },
] as const;

/** The simulated city as JSON for the page's script: real Lagos areas, made-up states and history (ADR 0053). */
export const renderDemoCityJson = (): Rendered => json(city, TTL_SECONDS);

// Icons the script builds rows with, inlined so it loads nothing more.
const SCRIPT_ICONS: IconName[] = ['chevron', 'place', 'alarm', 'notifications', 'phone', 'freezer', 'bolt', 'battery', 'language', 'info', 'delete', 'chart', 'shield', 'arrow', 'close', 'check', 'groups', 'map', 'homeWatch', 'play', 'plug', 'clock'];

export const legendHtml = (): string =>
  `<div class="maplegend" aria-hidden="true">${LEGEND.map((l) => `<span><i class="sw" data-state="${l.state}"></i>${l.label}</span>`).join('')}</div>`;

/** The app: the Now screen, the map, Insights and Settings. Reads without scripts as a list of areas. */
export function appScreen(): string {
  const rail = `<nav class="rail" aria-label="App"><span class="rail-brand">${LOGO_SVG}Outage</span>${NAV.map(
    (n) =>
      `<button type="button" data-tab="${n.id}"${n.id === 'now' ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></button>`,
  ).join('')}</nav>`;
  const areas = city.areas
    .map((a) => `<li><button type="button" class="row" data-area="${a.slug}"><span class="txt"><b>${e(a.name)}</b><span>Band ${a.band}, ${city.bands[a.band as keyof typeof city.bands]} hours promised</span></span>${icon('chevron')}</button></li>`)
    .join('');
  const now =
    '<section class="screen" id="now" data-page="now" aria-label="Now"><div class="screen-in" id="nowbody">' +
    '<header class="head"><div><p class="over">Simulated city</p><h1>Lagos</h1></div><span class="tag">Simulated</span></header>' +
    `<h2 class="sec">Areas</h2><ul class="group" id="arealist">${areas}</ul></div></section>`;
  const search =
    '<form class="search" role="search" id="searchform"><div class="search-box">' +
    LOGO_SVG +
    '<label class="visually-hidden" for="q">Search areas in Lagos</label>' +
    '<input id="q" type="search" placeholder="Search areas" autocomplete="off" spellcheck="false" aria-controls="suggest" aria-expanded="false">' +
    `<button type="button" class="icon-btn" id="clear" aria-label="Clear search" hidden>${icon('close')}</button></div>` +
    '<ul class="suggest" id="suggest" role="listbox" hidden></ul></form>';
  const controls =
    '<div class="mapctl" id="mapctl">' +
    `<button type="button" class="fab" id="myloc" aria-label="Go to my spot">${icon('myLocation')}</button>` +
    `<div class="zoom"><button type="button" id="zin" aria-label="Zoom in">${icon('add')}</button><button type="button" id="zout" aria-label="Zoom out">${icon('remove')}</button></div></div>`;
  const sheet =
    '<aside class="sheet" id="sheet" aria-label="Area" hidden><button type="button" class="grab" id="grab" aria-label="Close"><span></span></button><div id="sheetbody"></div></aside>';
  return (
    '<div class="app" id="app" data-tab="now">' +
    rail +
    now +
    '<div class="mapwrap" id="mapwrap">' +
    '<div class="map" id="map" role="region" aria-label="Map of Lagos with every block coloured by power. The Now screen and each area\'s sheet have the same information."></div>' +
    search +
    legendHtml() +
    controls +
    sheet +
    '</div>' +
    '<section class="screen" id="insights" data-page="insights" aria-label="Insights" hidden></section>' +
    '<section class="screen" id="settings" data-page="settings" aria-label="Settings" hidden></section>' +
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>' +
    `<div class="notif" id="notif" role="alert" aria-hidden="true"><span class="notif-ico">${LOGO_SVG}</span><div><b id="notift"></b><span id="notifb"></span></div></div>` +
    '<div class="tip" id="tip" role="tooltip" hidden></div>' +
    '</div>'
  );
}

export function renderSimulatePage(site: Site): Rendered {
  const apk = e(site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install');
  const icons = JSON.stringify(Object.fromEntries([...SCRIPT_ICONS.map((n) => [n, icon(n)]), ['logo', LOGO_SVG]])).replace(/</g, '\\u003c');
  const body =
    `<div class="sim-banner" role="note">${icon('info')}<p>${SIM_BANNER_TEXT}: simulated data, not live. <span class="hide-s">${SIM_SENTENCE}</span></p>` +
    `<ul><li><a href="${apk}">Get the app</a></li><li><a class="hide-s" href="/">About Outage</a></li></ul></div>` +
    appScreen() +
    `<script type="application/json" id="icons" nonce="__OUTAGE_NONCE__">${icons}</script>` +
    '<noscript><p class="noscript">The app in the browser needs JavaScript. The list above still shows every simulated area.</p></noscript>' +
    `<script type="module" src="${APP_JS_PATH}"></script>`;
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    `<title>${SIM_BANNER_TEXT}: the Outage app in your browser</title>` +
    '<meta name="description" content="Try the Outage Android app in your browser: a street map of Lagos coloured by power, a simulated blackout, and charts of when the power goes. Not live data.">' +
    '<meta name="theme-color" content="#1d1d1f">' +
    `<link rel="canonical" href="${e(site.origin + SIMULATE_PATH)}">${FAVICON_LINK}` +
    `<link rel="modulepreload" href="/vendor/maplibre-gl/maplibre-gl.mjs"><link rel="stylesheet" href="${MAPLIBRE_CSS_PATH}">` +
    `<link rel="stylesheet" href="/app.css"></head><body class="sim">${body}</body></html>`;
  return html(page, TTL_SECONDS, { map: true });
}
