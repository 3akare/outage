// Landing page at / (ADR 0027, ADR 0049). Static: no data, no script. It says what Outage is, offers the app in the
// browser (/app/simulate) for anyone without an Android phone, and the downloads: Google Play and Aptoide when their
// links are configured, and the APK from GitHub. The hero picture is the app's own Home screen, drawn by the same code
// as the simulation. Does not repeat any hardware-sensor claim (UX9).
import { brandLink, FAVICON_LINK } from '../site/brand.ts';
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { html, type Rendered } from '../site/headers.ts';
import { type IconName, icon } from '../site/icons.ts';
import type { Site } from '../site/layout.ts';
import { appScreen, SIMULATE_PATH } from '../ui/simulate/simulate.ts';

export const SIMULATE_HREF = SIMULATE_PATH;
export const REPO_URL = 'https://github.com/3akare/outage';

type Store = { href: string; small: string; name: string; glyph: IconName };

/** The download buttons that have a link. GitHub is always there: the APK link, or the releases page. */
export function stores(site: Site): Store[] {
  const out: Store[] = [];
  const play = site.playUrl ? safeHref(site.playUrl) : null;
  const aptoide = site.aptoideUrl ? safeHref(site.aptoideUrl) : null;
  if (play) out.push({ href: play, small: 'Get it on', name: 'Google Play', glyph: 'store' });
  if (aptoide) out.push({ href: aptoide, small: 'Get it on', name: 'Aptoide', glyph: 'android' });
  const apk = site.apkUrl ? safeHref(site.apkUrl) : null;
  out.push({ href: apk ?? `${REPO_URL}/releases/latest`, small: 'Download the APK from', name: 'GitHub', glyph: 'code' });
  return out;
}

const storeButtons = (site: Site): string =>
  `<div class="stores">${stores(site)
    .map((s) => `<a class="store" href="${e(s.href)}">${icon(s.glyph)}<span><small>${s.small}</small><b>${s.name}</b></span></a>`)
    .join('')}</div>`;

const FEATURES: [IconName, string, string][] = [
  ['alarm', 'Light Alarm', 'Rings a real alarm when power comes back at your spot, even at 3 a.m. It works offline.'],
  ['phone', 'Home Watch', 'Leave a spare phone charging at home. Your main phone shows "Home: power on since 2:14 p.m." from anywhere.'],
  ['freezer', 'Freezer Guard', 'Warns you when your spot has been without power longer than you choose.'],
  ['chart', 'Power Log and Light Score', 'Hours of power each day, every outage, and a monthly card you can share.'],
  ['bolt', 'Supply promise check', 'Compares your hours of power with what your tariff band promises. Band A promises 20 hours a day.'],
  ['layers', 'Power map', 'A map of hexagons shows which areas have power right now, from phones, with nobody reporting anything.'],
];

export function renderLanding(site: Site): Rendered {
  const top =
    `<header class="land-top"><div class="in">${brandLink('/')}<nav aria-label="Site"><a class="link" href="#how">How it works</a><a class="link" href="#features">Features</a><a class="link" href="/areas">Areas</a>` +
    `<a class="btn tonal" href="${SIMULATE_HREF}">Try it</a></nav></div></header>`;
  const hero =
    '<section class="hero"><div>' +
    `<div class="eyebrow"><span class="chip assist">${icon('android')}Android app</span><span class="chip assist">${icon('code')}Open source</span><span class="chip assist">${icon('lock')}No account</span></div>` +
    '<h1>Your phone charger is a <em>power-grid sensor</em>.</h1>' +
    '<p class="lead">When the power goes, every charging phone nearby stops charging at the same moment. Outage sees that, confirms the blackout, and tells you when the lights come back. Nobody has to report anything.</p>' +
    `<div class="cta"><a class="btn lg" href="${SIMULATE_HREF}">${icon('play')}Try the app in your browser</a></div>` +
    `<div class="get"><p class="label-l muted">Get it on your Android phone</p>${storeButtons(site)}</div></div>` +
    `<div class="hero-art" aria-hidden="true"><div class="phone"><div class="screen" inert>${appScreen({ live: false })}</div></div></div></section>`;
  const how =
    '<section class="section" id="how"><h2>How it works</h2><p class="muted">No hardware to buy and no forms to fill. The phone you already charge does the work.</p><div class="grid three">' +
    '<div class="feat"><span class="step-n">1</span><h3>Plug in your phone</h3><p>Outage notices when charging stops. One tap to start, then it runs on its own.</p></div>' +
    '<div class="feat"><span class="step-n">2</span><h3>Phones agree</h3><p>When many phones in an area stop charging within seconds, that is a power cut, not someone unplugging.</p></div>' +
    '<div class="feat"><span class="step-n">3</span><h3>Know when it is back</h3><p>The map turns from red to blue, and your phone rings when power returns at your spot.</p></div></div></section>';
  const features = `<section class="section" id="features"><h2>Useful from the first phone</h2><p class="muted">Everything works for one person with one charging phone. The map gets better as neighbours join.</p><div class="grid three">${FEATURES.map(
    ([ic, h, p]) => `<div class="feat"><span class="ic">${icon(ic)}</span><h3>${h}</h3><p>${p}</p></div>`,
  ).join('')}</div></section>`;
  const tryIt =
    '<section class="section"><div class="try"><div><h2>No Android phone? Try the whole app here.</h2>' +
    '<p>The app runs in your browser with a simulated city: first run, the live map, a blackout from start to finish, the Light Alarm, Insights and Settings.</p></div>' +
    `<a class="btn lg" href="${SIMULATE_HREF}">Open the app</a></div></section>`;
  const privacy =
    '<section class="section" id="privacy"><h2>Private by design</h2><ul class="list privacy">' +
    `<li>${icon('check')}<span>No account, no phone number, no name.</span></li>` +
    `<li>${icon('check')}<span>Your exact place is never stored, only a map cell about the size of a neighbourhood.</span></li>` +
    `<li>${icon('check')}<span>An area shows only when 3 or more phones agree.</span></li>` +
    `<li>${icon('check')}<span>Delete my data removes everything, on your phone and on the server.</span></li></ul></section>`;
  const foot =
    `<footer class="foot">${brandLink('/')}<a href="${SIMULATE_HREF}">Try it</a><a href="/areas">All areas</a><a href="/install">Install</a><a href="/privacy">Privacy</a><a href="${REPO_URL}">Source code</a></footer>`;
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>Outage: your phone charger is a power-grid sensor</title>' +
    '<meta name="description" content="Phones that are charging stop together when the power goes. Outage confirms blackouts area by area and tells you when power is back.">' +
    `<link rel="canonical" href="${e(site.origin)}/">${FAVICON_LINK}` +
    `<link rel="stylesheet" href="/app.css"></head><body>${top}<main class="land">${hero}${how}${features}${tryIt}${privacy}</main><div class="land">${foot}</div></body></html>`;
  return html(page, 3600);
}
