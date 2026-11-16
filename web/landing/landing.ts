// Landing page at / (ADR 0049, ADR 0052). Built with Hallmark, theme Midnight: a short hero beside the real globe, a night
// log of one power cut, the one rule a reader can test (three phones), the features as hairline rows, the downloads and a
// footer. Google Play and Aptoide appear only when their links are configured; GitHub is always there. The only script is
// the globe (/globe.js). Does not repeat any hardware-sensor claim (UX9) and invents no figure.
import { brandLink, FAVICON_LINK } from '../site/brand.ts';
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { html, type Rendered } from '../site/headers.ts';
import type { Site } from '../site/layout.ts';
import { GLOBE_JS_PATH } from '../ui/globe/globe.ts';
import { SIMULATE_PATH } from '../ui/simulate/simulate.ts';

export const SIMULATE_HREF = SIMULATE_PATH;
export const REPO_URL = 'https://github.com/3akare/outage';

type Store = { href: string; label: string };

/** The download buttons that have a link. GitHub is always there: the APK link, or the releases page. */
export function stores(site: Site): Store[] {
  const out: Store[] = [];
  const play = site.playUrl ? safeHref(site.playUrl) : null;
  const aptoide = site.aptoideUrl ? safeHref(site.aptoideUrl) : null;
  if (play) out.push({ href: play, label: 'Get it on Google Play' });
  if (aptoide) out.push({ href: aptoide, label: 'Get it on Aptoide' });
  const apk = site.apkUrl ? safeHref(site.apkUrl) : null;
  out.push({ href: apk ?? `${REPO_URL}/releases/latest`, label: 'Download the APK from GitHub' });
  return out;
}

const FEATURES: [string, string][] = [
  ['Light Alarm', 'Rings when power returns at your spot, even at 3 a.m. Works offline.'],
  ['Home Watch', 'A spare phone charging at home tells your main phone if the power is on.'],
  ['Freezer Guard', 'Warns you when your spot has been without power for longer than you set.'],
  ['Power Log', 'Hours of power each day and every cut, against what your tariff band promises.'],
];

export function renderLanding(site: Site): Rendered {
  const nav =
    `<header class="nav"><div class="container">${brandLink('/')}<nav class="links" aria-label="Site">` +
    `<a class="link" href="#how">How it works</a><a class="link" href="/areas">Areas</a>` +
    `<a class="btn btn--primary" href="${SIMULATE_HREF}">Try it</a></nav></div></header>`;
  const hero =
    '<section class="hero" aria-labelledby="hero-h"><div class="container">' +
    '<div class="hero-text settle">' +
    '<h1 id="hero-h">Your phone charger is a power-grid sensor.</h1>' +
    '<p class="lead">When the grid fails, every charging phone nearby stops at once.</p>' +
    `<div class="actions"><a class="btn btn--primary" href="${SIMULATE_HREF}">Try the app in your browser</a>` +
    `<a class="btn btn--secondary" href="#get">Get the Android app</a></div></div>` +
    '<figure class="globe-stage"><canvas data-globe="hero" role="img" aria-label="The Earth turning, with Lagos marked"></canvas>' +
    '<figcaption>Lagos, where Outage starts</figcaption></figure></div></section>';
  const how =
    '<section class="section" id="how" aria-labelledby="how-h"><div class="container split">' +
    '<h2 id="how-h">One power cut, minute by minute</h2>' +
    '<ol class="log">' +
    '<li><time>2:14:03</time><div><b>Your charger stops</b><span>Outage on your phone notes the moment, without the wall clock.</span></div></li>' +
    '<li><time>2:14:09</time><div><b>Phones nearby stop too</b><span>Within seconds, other chargers in the same area go quiet.</span></div></li>' +
    '<li aria-current="step"><time>2:15:39</time><div><b>The area turns red</b><span>Too many at once to be people unplugging. Nobody had to report it.</span><div class="meter"><span></span></div></div></li>' +
    '<li><time>4:02:17</time><div><b>Your alarm rings</b><span>Power is back at your spot, so you can switch the pump on.</span></div></li>' +
    '</ol></div></section>';
  const figure =
    '<section class="section band" aria-labelledby="fig-h"><div class="container statement">' +
    '<p class="fig" aria-hidden="true">3</p>' +
    '<div><h2 id="fig-h" class="visually-hidden">Three phones</h2><p>phones in an area must agree before Outage shows a cut. One phone alone never does.</p></div>' +
    '</div></section>';
  const features =
    '<section class="section" aria-labelledby="feat-h"><div class="container">' +
    '<h2 id="feat-h">Useful from the first phone</h2>' +
    `<ul class="rows">${FEATURES.map(([h, p]) => `<li><h3>${h}</h3><p>${p}</p></li>`).join('')}</ul>` +
    '</div></section>';
  const get =
    '<section class="section band" id="get" aria-labelledby="get-h"><div class="container get">' +
    '<h2 id="get-h">Get Outage for Android</h2>' +
    '<p class="lead">Free and open source. No account, and never your exact location.</p>' +
    `<div class="stores">${stores(site)
      .map((s, i) => `<a class="btn ${i === 0 ? 'btn--primary' : 'btn--secondary'}" href="${e(s.href)}">${s.label}</a>`)
      .join('')}</div>` +
    `<p class="muted">No Android phone? <a href="${SIMULATE_HREF}">Try the app in your browser</a> on a simulated Lagos.</p>` +
    '</div></section>';
  const foot =
    `<footer class="foot"><div class="container">${brandLink('/')}` +
    `<nav aria-label="Footer"><a class="link" href="${SIMULATE_HREF}">Try it</a><a class="link" href="/areas">Areas</a><a class="link" href="/install">Install</a><a class="link" href="/privacy">Privacy</a><a class="link" href="${REPO_URL}">Source code</a></nav>` +
    '<small>Land outlines from Natural Earth. Mona Sans under the SIL Open Font License.</small></div></footer>';
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>Outage: your phone charger is a power-grid sensor</title>' +
    '<meta name="description" content="Phones that are charging stop together when the power goes. Outage confirms blackouts area by area and tells you when power is back.">' +
    `<link rel="canonical" href="${e(site.origin)}/">${FAVICON_LINK}` +
    '<link rel="preload" href="/fonts/mona-sans.woff2" as="font" type="font/woff2" crossorigin>' +
    `<link rel="stylesheet" href="/app.css"></head><body>${nav}<main>${hero}${how}${figure}${features}${get}</main>${foot}` +
    `<script src="${GLOBE_JS_PATH}" defer></script></body></html>`;
  return html(page, 3600);
}
