// The Outage app in the browser, for people without an Android phone (ADR 0049, ADR 0053). A street map of Lagos in the
// manner of Google Maps, with see-through hexagons on top coloured by power, a search box, filter chips, a side panel
// (a bottom sheet on a phone), Insights with charts, and Settings. Everything on it is simulated and says so. The
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
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
export const NAV_ORDER = NAV.map((n) => n.label);

/** The filter chips over the map, as in Google Maps. */
export const CHIPS = [
  { state: 'CONFIRMED', label: 'Power out' },
  { state: 'POSSIBLE', label: 'Maybe out' },
  { state: 'RESTORED', label: 'Power back' },
  { state: 'NORMAL', label: 'Power on' },
] as const;

/** The simulated city as JSON for the page's script: real Lagos areas, made-up states and history (ADR 0053). */
export const renderDemoCityJson = (): Rendered => json(city, TTL_SECONDS);

// Icons the script builds rows with, inlined so it loads nothing more.
const SCRIPT_ICONS: IconName[] = ['chevron', 'place', 'alarm', 'notifications', 'phone', 'freezer', 'bolt', 'battery', 'language', 'info', 'delete', 'chart', 'shield', 'arrow', 'close', 'check', 'groups'];

/** The app: map, search, chips, panel, the three tabs. Reads without scripts as a list of areas. */
export function appScreen(): string {
  const rail = `<nav class="rail" aria-label="App">${NAV.map(
    (n) =>
      `<button type="button" data-tab="${n.id}"${n.id === 'home' ? ' aria-current="page"' : ''}><span class="pill">${icon(n.icon)}</span><span>${n.label}</span></button>`,
  ).join('')}</nav>`;
  const search =
    '<div class="topbar"><form class="search" role="search" id="searchform">' +
    `<span class="search-brand">${LOGO_SVG}</span>` +
    '<label class="visually-hidden" for="q">Search areas in Lagos</label>' +
    '<input id="q" type="search" placeholder="Search Lagos areas" autocomplete="off" spellcheck="false" aria-controls="suggest" aria-expanded="false">' +
    `<button type="button" class="icon-btn" id="clear" aria-label="Clear search" hidden>${icon('close')}</button>` +
    `<span class="search-ico">${icon('search')}</span>` +
    '<ul class="suggest" id="suggest" role="listbox" hidden></ul></form>' +
    `<div class="chips" role="group" aria-label="Show on the map">${CHIPS.map(
      (c) => `<button type="button" class="chip" data-filter="${c.state}" aria-pressed="false"><i class="dot" data-state="${c.state}"></i>${c.label}</button>`,
    ).join('')}</div></div>`;
  const areas = city.areas
    .map((a) => `<li><button type="button" class="row" data-area="${a.slug}"><i class="dot" data-state="NORMAL"></i><span class="txt"><b>${e(a.name)}</b><span>Band ${a.band}</span></span></button></li>`)
    .join('');
  const panel =
    '<aside class="panel" id="panel" aria-label="Your spot and areas"><button type="button" class="grab" id="grab" aria-label="Show more"><span></span></button>' +
    `<div class="panel-body" id="panelbody"><h2 class="sec">Areas in the simulated city</h2><ul class="rows" id="arealist">${areas}</ul></div></aside>`;
  const controls =
    '<div class="mapctl" id="mapctl">' +
    `<button type="button" class="fab" id="myloc" aria-label="Go to my spot">${icon('myLocation')}</button>` +
    `<div class="zoom"><button type="button" id="zin" aria-label="Zoom in">${icon('add')}</button><button type="button" id="zout" aria-label="Zoom out">${icon('remove')}</button></div></div>`;
  const legend =
    `<div class="legend" aria-hidden="true">${(['CONFIRMED', 'POSSIBLE', 'RESTORED', 'NORMAL', 'NO_DATA'] as const)
      .map((s) => `<span><i class="sw" data-state="${s}"></i>${{ CONFIRMED: 'Out', POSSIBLE: 'Maybe', RESTORED: 'Back', NORMAL: 'On', NO_DATA: 'No data' }[s]}</span>`)
      .join('')}</div>`;
  return (
    '<div class="app" id="app" data-tab="home">' +
    rail +
    '<div class="map" id="map" role="region" aria-label="Map of Lagos with every block coloured by power. The list in the panel has the same information."></div>' +
    search +
    legend +
    controls +
    panel +
    '<section class="page" id="insights" data-page="insights" aria-label="Insights" hidden></section>' +
    '<section class="page" id="settings" data-page="settings" aria-label="Settings" hidden></section>' +
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
    `<div class="sim-banner" role="note">${icon('info')}<span>${SIM_BANNER_TEXT}: simulated data, not live.</span> <span class="hide-s">${SIM_SENTENCE}</span>` +
    `<a href="${apk}">Get the Android app</a><a href="/">About Outage</a></div>` +
    appScreen() +
    `<script type="application/json" id="icons" nonce="__OUTAGE_NONCE__">${icons}</script>` +
    '<noscript><p class="noscript">The app in the browser needs JavaScript. The area list above still shows every simulated area.</p></noscript>' +
    `<script type="module" src="${APP_JS_PATH}"></script>`;
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    `<title>${SIM_BANNER_TEXT}: the Outage app in your browser</title>` +
    '<meta name="description" content="Try the Outage Android app in your browser: a street map of Lagos coloured by power, a simulated blackout, and charts of when the power goes. Not live data.">' +
    '<meta name="theme-color" content="#ffffff">' +
    `<link rel="canonical" href="${e(site.origin + SIMULATE_PATH)}">${FAVICON_LINK}` +
    `<link rel="modulepreload" href="/vendor/maplibre-gl/maplibre-gl.mjs"><link rel="stylesheet" href="${MAPLIBRE_CSS_PATH}">` +
    `<link rel="stylesheet" href="/app.css"></head><body class="sim">${body}</body></html>`;
  return html(page, TTL_SECONDS, { map: true });
}
