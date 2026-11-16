// The Outage app in the browser, for people without an Android phone (ADR 0049, ADR 0054). It is about where the
// visitor is: it asks for their location, builds a simulated neighbourhood around their own block, and shows their
// area's power, a simulated blackout with the Light Alarm, and Insights for their area; other places only through
// search. Everything on it is simulated and says so quietly. The blackout is the replay built by tools/sim from the real
// detection engine; the page never reads the public index (W6). This file renders the shell; public/js/app.js runs it.
import { FAVICON_LINK } from '../../site/brand.ts';
import { escapeHtml as e, safeHref } from '../../site/escape.ts';
import { FONT_LINK, html, type Rendered } from '../../site/headers.ts';
import { icon, type IconName } from '../../site/icons.ts';
import type { Site } from '../../site/layout.ts';
import { LOGO_SVG } from '../../site/logo.gen.ts';

export const SIMULATE_PATH = '/app/simulate';
export const APP_JS_PATH = '/js/app.js';
export const MAPLIBRE_CSS_PATH = '/vendor/maplibre-gl/maplibre-gl.css';
export const SIM_BANNER_TEXT = 'Simulation';
export const SIM_SENTENCE = 'This is the Outage Android app running in your browser, with simulated data around wherever you are.';
const TTL_SECONDS = 3600;

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
export const NAV_ORDER = NAV.map((n) => n.label);

// Icons the script builds rows with, inlined so it loads nothing more.
const SCRIPT_ICONS: IconName[] = ['chevron', 'place', 'alarm', 'notifications', 'phone', 'freezer', 'bolt', 'battery', 'language', 'delete', 'chart', 'shield', 'arrow', 'myLocation'];

/** The app: map, search, panel, the three tabs. */
export function appScreen(): string {
  const rail = `<nav class="rail" aria-label="App">${NAV.map(
    (n) =>
      `<button type="button" data-tab="${n.id}"${n.id === 'home' ? ' aria-current="page"' : ''}><span class="pill">${icon(n.icon)}</span><span>${n.label}</span></button>`,
  ).join('')}</nav>`;
  const search =
    '<div class="topbar"><form class="search glass" role="search" id="searchform">' +
    `<a class="search-brand" href="/" aria-label="Outage home">${LOGO_SVG}</a>` +
    '<label class="visually-hidden" for="q">Search for a place</label>' +
    '<input id="q" type="search" placeholder="Search for a place" autocomplete="off" spellcheck="false" enterkeyhint="search">' +
    `<button type="button" class="icon-btn" id="clear" aria-label="Clear search" hidden>${icon('close')}</button>` +
    `<button type="submit" class="icon-btn" aria-label="Search">${icon('search')}</button>` +
    '<ul class="suggest glass" id="suggest" role="listbox" hidden></ul></form></div>';
  const panel =
    '<aside class="panel glass" id="panel" aria-label="Your area"><button type="button" class="grab" id="grab" aria-label="Show more"><span></span></button>' +
    '<div class="panel-body" id="panelbody"><div class="skeleton" data-peek><p class="eyebrow-s">Your area</p><p class="skeleton-title">Waiting for your location</p><p class="fine">Share your location, or search for your town.</p></div></div></aside>';
  const controls =
    '<div class="mapctl" id="mapctl">' +
    `<button type="button" class="fab glass" id="myloc" aria-label="Go to my area">${icon('myLocation')}</button>` +
    `<div class="zoom glass"><button type="button" id="zin" aria-label="Zoom in">${icon('add')}</button><button type="button" id="zout" aria-label="Zoom out">${icon('remove')}</button></div></div>`;
  const legend = `<div class="legend glass" aria-hidden="true">${(['CONFIRMED', 'POSSIBLE', 'RESTORED', 'NORMAL'] as const)
    .map((s) => `<span><i class="sw" data-state="${s}"></i>${{ CONFIRMED: 'Out', POSSIBLE: 'Maybe', RESTORED: 'Back', NORMAL: 'On' }[s]}</span>`)
    .join('')}</div>`;
  return (
    '<div class="app" id="app" data-tab="home">' +
    rail +
    '<div class="map" id="map" role="region" aria-label="Map of your area with every block coloured by power. The panel has the same information."></div>' +
    search +
    legend +
    controls +
    panel +
    '<section class="page" id="insights" aria-label="Insights" hidden></section>' +
    '<section class="page" id="settings" aria-label="Settings" hidden></section>' +
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>' +
    `<div class="notif glass" id="notif" role="alert" aria-hidden="true"><span class="notif-ico">${LOGO_SVG}</span><div><b id="notift"></b><span id="notifb"></span></div><time>now</time></div>` +
    '<div class="tip" id="tip" role="tooltip" hidden></div>' +
    '</div>'
  );
}

export function renderSimulatePage(site: Site): Rendered {
  const apk = e(site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install');
  const icons = JSON.stringify(Object.fromEntries([...SCRIPT_ICONS.map((n) => [n, icon(n)]), ['logo', LOGO_SVG]])).replace(/</g, '\\u003c');
  const body =
    `<div class="sim-banner" role="note"><p><span class="tag dark">${SIM_BANNER_TEXT}</span> ${SIM_BANNER_TEXT}: simulated data, not live. <span class="hide-s">${SIM_SENTENCE}</span></p>` +
    `<ul><li><a href="${apk}">Get the Android app</a></li><li><a href="/">About Outage</a></li></ul></div>` +
    appScreen() +
    `<script type="application/json" id="icons" nonce="__OUTAGE_NONCE__">${icons}</script>` +
    '<noscript><p class="noscript">The app in the browser needs JavaScript.</p></noscript>' +
    `<script type="module" src="${APP_JS_PATH}"></script>`;
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    `<title>${SIM_BANNER_TEXT}: the Outage app in your browser</title>` +
    '<meta name="description" content="Try the Outage Android app in your browser: the power around your own location on a street map, a simulated blackout, and charts of when the power goes in your area. Simulated data.">' +
    '<meta name="theme-color" content="#ffffff">' +
    `<link rel="canonical" href="${e(site.origin + SIMULATE_PATH)}">${FAVICON_LINK}${FONT_LINK}` +
    `<link rel="modulepreload" href="/vendor/maplibre-gl/maplibre-gl.mjs"><link rel="stylesheet" href="${MAPLIBRE_CSS_PATH}">` +
    `<link rel="stylesheet" href="/app.css"></head><body class="sim">${body}</body></html>`;
  return html(page, TTL_SECONDS, { map: true, search: true });
}
