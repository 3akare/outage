// Page renderers: pure (data) -> Rendered. No I/O, no clock (the caller passes nowMs). Every dynamic string goes through escapeHtml.
// Server-rendered status so the pages work with scripts off (R1.4). Real pages never show "Your spot only" as a status (R2.3).
import type { CatalogArea } from './catalog/schema.ts';
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { html, type Rendered } from '../site/headers.ts';
import { layout, type Site } from '../site/layout.ts';
import { cellStates, renderMap } from './map-svg.ts';
import type { PublicOutage, PublicScopeView } from '../api/public-index/public-view.ts';
import { areaStatus, formatDateTime, historyForCells, statusForCells, type AreaStatus } from '../site/status.ts';
import {
  NO_COVERAGE_TEXT,
  PHONES_TEXT,
  PRECISION_LABEL,
  PUBLIC_STATE_KEYS,
  STATE_KEYS,
  UNAVAILABLE_TEXT,
  stateText,
  type Lang,
  type PublicStateKey,
} from '../site/strings.ts';
import { isValidRes8Cell } from '@outage/shared';

/** Views from the public index; null when the index is unavailable (design section 11). */
export type Views = readonly PublicScopeView[] | null;

const PAGE_TTL = 30;
const UNAVAILABLE_TTL = 5;

export const formatOffset = (tzOffsetMin: number): string => {
  const sign = tzOffsetMin < 0 ? '-' : '+';
  const abs = Math.abs(tzOffsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
};

// ---- shared fragments ----

function installButtons(site: Site): string {
  const href = site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install';
  return `<div class="actions"><a class="btn primary" href="${e(href)}">Install Outage (Android)</a><a class="btn" href="/app/simulate">Try the app in your browser</a></div>`;
}

/** The five-state legend. "Your spot only" is described as private to one phone (R2.3). */
export function legendHtml(lang: Lang = 'en'): string {
  const items = STATE_KEYS.map((k) => {
    const t = stateText(k, lang);
    const extra = k === 'SPOT_ONLY' ? ' This state stays on one phone. It is never shown for an area.' : '';
    return `<li><span class="chip" data-state="${k}">${e(t.label)}</span> ${e(t.sentence)}${e(extra)}</li>`;
  }).join('');
  return `<h2>The five states</h2><ul class="plain">${items}</ul>`;
}

const HOW_IT_WORKS =
  '<h2>How this works</h2><ul class="list"><li>Phones charging stop charging at the same second when power dies.</li>' +
  '<li>Outage sees many phones in one area stop together, and confirms the power cut.</li>' +
  '<li>Nobody has to report anything.</li></ul>';

const PRIVACY_SHORT =
  '<h2>Your privacy</h2><ul class="list"><li>We show an area only when 3 or more phones are there.</li>' +
  '<li>We never show where one phone is.</li><li>This site sets no cookies and has no trackers. <a href="/privacy">Read more</a>.</li></ul>';

function sinceLine(status: Exclude<AreaStatus, { kind: 'NO_COVERAGE' }>, tz: number): string {
  if (status.sinceMs === undefined) return '';
  const when = `${formatDateTime(status.sinceMs, tz)} (${formatOffset(tz)})`;
  if (status.kind === 'RESTORED') return `Back since ${when}.`;
  return status.endUnknown ? `Since ${when}. End unknown.` : `Since ${when}.`;
}

function statusBlock(status: AreaStatus, views: Views, tz: number, lang: Lang, api: string | null): string {
  const apiAttr = api ? ` data-api="${e(api)}"` : '';
  if (views === null) return `<section id="status" class="state none"${apiAttr}><p class="label">${e(UNAVAILABLE_TEXT)}</p></section>`;
  if (status.kind === 'NO_COVERAGE') {
    return `<section id="status" class="state none"${apiAttr}><p class="label">${e(NO_COVERAGE_TEXT)}</p></section>`;
  }
  const t = stateText(status.kind, lang);
  const precision = status.precision === 'CELL' ? '' : `<p class="note precision">${e(PRECISION_LABEL[status.precision])}</p>`;
  return (
    `<section id="status" class="state" data-state="${status.kind}"${apiAttr} aria-live="polite">` +
    `<div class="state-top"><p class="label">${e(t.label)}</p><p class="sentence">${e(t.sentence)}</p></div>` +
    `<div class="state-bottom"><p class="since">${e(sinceLine(status, tz))}</p>${precision}<p class="note">${e(PHONES_TEXT)}</p></div></section>`
  );
}

function historyHtml(history: readonly PublicOutage[], tz: number): string {
  if (history.length === 0) return '<h2>Last 30 days</h2><p>No outages recorded.</p>';
  const items = history
    .map((o) => {
      const end = o.endMs === null ? 'unknown' : formatDateTime(o.endMs, tz);
      return `<li>${e(stateText(o.level).label)} from ${e(formatDateTime(o.startMs, tz))} to ${e(end)}. ${e(PRECISION_LABEL[o.precision])}.</li>`;
    })
    .join('');
  return `<h2>Last 30 days</h2><ul class="list">${items}</ul><p class="note">Times are ${e(formatOffset(tz))}.</p>`;
}

// Polls the status every 30 s (R3.8). Static source: the string pack is serialised once, nothing from the request is inserted.
const PACK = JSON.stringify(Object.fromEntries(PUBLIC_STATE_KEYS.map((k) => [k, [stateText(k).label, stateText(k).sentence]]))).replace(/</g, '\\u003c');
const POLL_SCRIPT =
  `(function(){var P=${PACK};var s=document.getElementById('status');if(!s||!window.fetch||!s.getAttribute('data-api'))return;` +
  "function tick(){fetch(s.getAttribute('data-api'),{headers:{accept:'application/json'}}).then(function(r){return r.ok?r.json():null})" +
  '.then(function(j){if(!j||!j.state||!P[j.state])return;s.setAttribute(\'data-state\',j.state);s.className=\'state\';' +
  "var l=s.querySelector('.label'),n=s.querySelector('.sentence');if(l)l.textContent=P[j.state][0];if(n)n.textContent=P[j.state][1];" +
  "var w=s.querySelector('.since');if(w){w.textContent=j.sinceMs?'Since '+new Date(j.sinceMs).toLocaleString([], {hour:'numeric',minute:'2-digit',day:'numeric',month:'short'})+'.':''}})" +
  '.catch(function(){})}setInterval(tick,30000)})();';

// ---- pages ----

export type AreaPageInput = { site: Site; area: CatalogArea; views: Views; nowMs: number; lang?: Lang };

/** /area/:slug (R3). The answer is in the first screen: label, sentence, since. */
export function renderAreaPage(input: AreaPageInput): Rendered {
  const { site, area, views, nowMs, lang = 'en' } = input;
  const status: AreaStatus = views ? areaStatus(area, views, nowMs) : { kind: 'NO_COVERAGE' };
  const title = `Is there power in ${area.name} right now?`;
  const covered = views !== null && status.kind !== 'NO_COVERAGE';
  const body =
    `<main><h1>${e(title)}</h1>${statusBlock(status, views, area.tzOffsetMin, lang, `/api/v1/public/area/${area.slug}`)}` +
    installButtons(site) +
    (covered ? historyHtml(historyForCells(area.cells, views, nowMs), area.tzOffsetMin) : '') +
    HOW_IT_WORKS +
    PRIVACY_SHORT +
    legendHtml(lang) +
    '</main>';
  const description =
    status.kind === 'NO_COVERAGE'
      ? `Power status for ${area.name}. ${NO_COVERAGE_TEXT}`
      : `${stateText(status.kind, lang).label} in ${area.name}. Live power status from phones that are charging.`;
  return html(layout({ site, title, description, path: `/area/${area.slug}`, body, script: covered ? POLL_SCRIPT : undefined }), views === null ? UNAVAILABLE_TTL : PAGE_TTL);
}

export type CellPageInput = { site: Site; cell: string; views: Views; nowMs: number; areas: readonly CatalogArea[] };

/**
 * /c/:cell (R4). The body depends only on the cell id and on the public views that cover it, so a cell with no
 * phones and a cell with fewer than 3 phones give identical bytes (R4.4, W9).
 */
export function renderCellPage(input: CellPageInput): Rendered {
  const { site, cell, views, nowMs, areas } = input;
  if (!isValidRes8Cell(cell)) return renderNotFound({ site, areas });
  const status: AreaStatus = views ? statusForCells([cell], views, nowMs) : { kind: 'NO_COVERAGE' };
  const covered = views !== null && status.kind !== 'NO_COVERAGE';
  const title = 'Is there power here right now?';
  const body =
    `<main><h1>${e(title)}</h1>${statusBlock(status, views, 0, 'en', null)}${installButtons(site)}` +
    (covered ? historyHtml(historyForCells([cell], views, nowMs), 0) : '') +
    HOW_IT_WORKS +
    PRIVACY_SHORT +
    legendHtml() +
    '</main>';
  return html(layout({ site, title, description: 'Power status for one small area.', path: `/c/${cell}`, noindex: true, body }), views === null ? UNAVAILABLE_TTL : PAGE_TTL, { noindex: true });
}

export type HomePageInput = { site: Site; areas: readonly CatalogArea[]; views: Views; nowMs: number };

/** `/areas` (R5.1): hero, simulation and install buttons, the SVG map and the area list. */
export function renderHomePage(input: HomePageInput): Rendered {
  const { site, areas, views, nowMs } = input;
  const states = cellStates(areas, views ?? [], nowMs);
  const list = areas
    .map((a) => {
      const s = views ? areaStatus(a, views, nowMs) : ({ kind: 'NO_COVERAGE' } as const);
      const text = views === null ? UNAVAILABLE_TEXT : s.kind === 'NO_COVERAGE' ? 'No phones here yet' : stateText(s.kind).label;
      return `<li><a href="/area/${e(a.slug)}">${e(a.name)}</a>: ${e(text)}</li>`;
    })
    .join('');
  const body =
    '<main><h1>Is there power in your area right now?</h1><p>Your phone charger is a power-grid sensor.</p>' +
    '<div class="actions"><a class="btn primary" href="/app/simulate">Try the app in your browser</a>' +
    `<a class="btn" href="${e(site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install')}">Install Outage (Android)</a></div>` +
    (views === null ? `<p class="note">${e(UNAVAILABLE_TEXT)}</p>` : '') +
    renderMap(areas, states) +
    `<h2>Areas</h2>${areas.length ? `<ul class="plain">${list}</ul>` : '<p>Areas appear here once their places are checked.</p>'}` +
    legendHtml() +
    '</main>';
  return html(
    layout({ site, title: 'Outage: is there power right now?', description: 'Your phone charger is a power-grid sensor. See when power goes and comes back, area by area.', path: '/', body }),
    views === null ? UNAVAILABLE_TTL : PAGE_TTL,
  );
}

export type InstallInfo = { apkUrl: string; version: string; sizeBytes: number; sha256: string };

/** `/install` (R7). All values come from configuration. A missing value is left out, not guessed. */
export function renderInstallPage(input: { site: Site; install: InstallInfo | null }): Rendered {
  const { site, install } = input;
  const href = install ? safeHref(install.apkUrl) : null;
  let details = '<p>The Android app is not published yet. Check back soon.</p>';
  if (install && href) {
    const mb = Number.isFinite(install.sizeBytes) && install.sizeBytes > 0 ? `${(install.sizeBytes / 1_048_576).toFixed(1)} MB` : null;
    const sha = /^[0-9a-fA-F]{64}$/.test(install.sha256) ? install.sha256.toLowerCase() : null;
    details =
      `<div class="actions"><a class="btn primary" href="${e(href)}">Download the APK</a></div><ul class="list"><li>Version: ${e(install.version)}</li>` +
      (mb ? `<li>Size: ${e(mb)}</li>` : '') +
      (sha ? `<li>SHA-256: <code>${e(sha)}</code></li>` : '') +
      '</ul>';
  }
  const body =
    '<main><h1>Install Outage</h1><p><strong>Android only for now.</strong> On iPhone or a computer, <a href="/app/simulate">try the app in your browser</a> with a simulated city.</p>' +
    details +
    '<h2>Allow installs from your browser</h2><ol><li>Tap the download link.</li>' +
    '<li>If Android says it blocked the install, tap Settings and turn on "Allow from this source" for your browser.</li>' +
    '<li>Go back, open the downloaded file and tap Install.</li></ol>' +
    '<p class="note">You can compare the SHA-256 above with the file you downloaded.</p></main>';
  return html(layout({ site, title: 'Install Outage', description: 'Install the Outage Android app. Android only for now.', path: '/install', body }), 300);
}

/** `/privacy` (R11.4): what is collected, what is public, how to delete. */
export function renderPrivacyPage(input: { site: Site }): Rendered {
  const body =
    '<main><h1>Privacy</h1><h2>What Outage collects</h2><ul class="list"><li>One anonymous install ID per install.</li>' +
    '<li>When the phone starts and stops charging, with the time.</li>' +
    '<li>A small area code for the place you set (an H3 cell about 0.7 km across), and optionally the start of your postcode.</li></ul>' +
    '<h2>The street map</h2><p>The map on the landing page and in the app in the browser is drawn from OpenFreeMap (tiles.openfreemap.org), which serves OpenStreetMap data. Your browser asks it for map pictures of the area you look at, so it sees your IP address, as any website does. Outage sends it nothing else. The Android app does the same for its map.</p>' +
    '<h2>What Outage never collects</h2><ul class="list"><li>Your exact location. The phone reads it once to pick the area code, then discards it.</li>' +
    '<li>Who you are: no name, no contact details, no advertising ID.</li><li>Microphone or motion sensor data.</li></ul>' +
    '<h2>What is public</h2><ul class="list"><li>The power status of an area, only when 3 or more phones are there.</li>' +
    '<li>Never where one phone is, and never a number below 3.</li></ul>' +
    '<h2>This website</h2><p>It sets no cookies, loads nothing from other sites and has no analytics.</p>' +
    '<h2>Delete your data</h2><p>In the app, open Settings and tap "Delete my data". It removes what the app keeps on your phone and asks the server to delete what it holds for your install.</p></main>';
  return html(layout({ site: input.site, title: 'Privacy', description: 'What Outage collects, what is public and how to delete your data.', path: '/privacy', body }), 3600);
}

/** 404 (R3.10): lists the areas and the install button. Gives no hint about why. */
export function renderNotFound(input: { site: Site; areas: readonly CatalogArea[] }): Rendered {
  const list = input.areas.map((a) => `<li><a href="/area/${e(a.slug)}">${e(a.name)}</a></li>`).join('');
  const body =
    '<main><h1>Page not found</h1><p>Try one of these areas, or install Outage to be the first in yours.</p>' +
    (list ? `<ul class="plain">${list}</ul>` : '') +
    `${installButtons(input.site)}</main>`;
  return html(layout({ site: input.site, title: 'Page not found', description: 'Page not found.', path: '/', body, noindex: true }), PAGE_TTL, { status: 404, noindex: true });
}

export const PUBLIC_STATES: readonly PublicStateKey[] = PUBLIC_STATE_KEYS;
