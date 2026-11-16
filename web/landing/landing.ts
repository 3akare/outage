// Landing page at / (ADR 0054). The marketing page: what Outage is and why it matters, how one power cut is caught, the
// features, privacy, questions, and the downloads as store badges. The hero shows the real app on a phone: a live globe
// with simulated power around several cities, because Outage is for anywhere the power is unreliable. Google Play and
// Aptoide badges link only when their links are configured (until then they say "Coming soon"); the GitHub APK is always
// there. Does not repeat any hardware-sensor claim (UX9) and invents no figure.
import { brandLink, FAVICON_LINK } from '../site/brand.ts';
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { FONT_LINK, html, type Rendered } from '../site/headers.ts';
import { icon, type IconName } from '../site/icons.ts';
import type { Site } from '../site/layout.ts';
import { LOGO_SVG } from '../site/logo.gen.ts';
import { MAPLIBRE_CSS_PATH, SIMULATE_PATH } from '../ui/simulate/simulate.ts';

export const SIMULATE_HREF = SIMULATE_PATH;
export const REPO_URL = 'https://github.com/3akare/outage';
export const LANDING_JS_PATH = '/js/landing.js';

type Store = { id: 'play' | 'aptoide' | 'github'; href: string | null; label: string };

/** The three stores. Play and Aptoide have a link only when configured; GitHub always has one (the APK, or releases). */
export function stores(site: Site): Store[] {
  const play = site.playUrl ? safeHref(site.playUrl) : null;
  const aptoide = site.aptoideUrl ? safeHref(site.aptoideUrl) : null;
  const apk = site.apkUrl ? safeHref(site.apkUrl) : null;
  return [
    { id: 'play', href: play, label: 'Get it on Google Play' },
    { id: 'aptoide', href: aptoide, label: 'Get it on Aptoide' },
    { id: 'github', href: apk ?? `${REPO_URL}/releases/latest`, label: 'Download the APK from GitHub' },
  ];
}

// GitHub's mark (Octicons, MIT) for the APK badge.
const GITHUB_MARK =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="#fff" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
// Aptoide has no badge file we can use, so its badge is drawn in the same black store style, with its name only.
const APTOIDE_MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fe6446"/><path fill="#fff" d="M8 15.5l4-8 4 8h-2.2L12 11.6l-1.8 3.9z"/></svg>';

/** One store badge. Google Play uses Google's own badge image, unaltered; the others share its black style. */
function badge(s: Store): string {
  const inner =
    s.id === 'play'
      ? '<img src="/badges/google-play.png" width="646" height="250" alt="Get it on Google Play" class="play-img">'
      : `<span class="badge-in">${s.id === 'github' ? GITHUB_MARK : APTOIDE_MARK}<span><small>${s.id === 'github' ? 'Download the APK on' : 'Get it on'}</small><b>${s.id === 'github' ? 'GitHub' : 'Aptoide'}</b></span></span>`;
  const cls = `badge badge-${s.id}`;
  if (!s.href) return `<span class="${cls} soon" aria-label="${s.label}: coming soon">${inner}<em>Coming soon</em></span>`;
  return `<a class="${cls}" href="${e(s.href)}" aria-label="${s.label}">${inner}</a>`;
}
const badges = (site: Site, cls = '') => `<div class="badges ${cls}">${stores(site).map(badge).join('')}</div>`;

const STEPS: [IconName, string, string][] = [
  ['battery', 'Your charger stops', 'When the grid fails, a charging phone stops charging. Outage notices the moment, in the background.'],
  ['groups', 'Phones nearby agree', 'Within seconds, chargers in the same block stop too. Three phones must agree, so one unplugged cable never counts.'],
  ['notifications', 'Everyone knows', 'Your block turns red on the map, your phone tells you, and when the power returns, your Light Alarm rings.'],
];

const FAQ: [string, string][] = [
  ['Does Outage need an account?', 'No. There is no sign-up and no name. The app saves only which map block you are in, never your exact position.'],
  ['Does it drain my battery?', 'No. Outage listens for the charger events your phone already sends. It does not run the GPS in the background.'],
  ['Where does it work?', 'Anywhere. The map covers the whole world, and an area lights up as soon as three or more phones there run Outage.'],
  ['What does the Light Alarm do?', 'It rings when power returns at your block, like an alarm clock, even on silent, so you can switch the pump or the freezer back on.'],
  ['Is it free?', 'Yes. Outage is free and open source. The code is on GitHub.'],
];

export function renderLanding(site: Site): Rendered {
  const nav =
    `<header class="nav"><div class="container nav-in">${brandLink('/')}<nav class="links" aria-label="Site">` +
    '<a href="#how">How it works</a><a href="#features">Features</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a></nav>' +
    `<div class="nav-cta"><a class="btn ghost" href="${SIMULATE_HREF}">Live demo</a><a class="btn dark" href="#get">Download</a></div></div></header>`;
  const phone =
    '<div class="hero-visual" aria-hidden="true">' +
    '<div class="phone"><div class="phone-screen"><div class="map" id="heromap"></div>' +
    `<div class="ph-search">${LOGO_SVG}<span>Search for a place</span></div>` +
    '<div class="ph-sheet"><p class="ph-eyebrow">Your block</p><p class="ph-word"><i class="dot lg" data-state="RESTORED"></i>Power is back</p><p class="ph-sub">9 of 10 phones nearby are charging again</p></div>' +
    '</div></div>' +
    `<div class="float-card fc-notif"><span class="fc-ico">${LOGO_SVG}</span><div><b>Power is back</b><span>Your Light Alarm is ringing</span></div><time>2:14</time></div>` +
    '<div class="float-card fc-stat"><span>Power today</span><b>18.5 h</b><small>2 outages · typical wait 1 h 40 min</small></div>' +
    '</div>';
  const hero =
    '<section class="hero" aria-labelledby="hero-h"><div class="container hero-in"><div class="hero-copy">' +
    '<p class="pill-note"><span></span>Free, open source, no account</p>' +
    '<h1 id="hero-h">Know the moment the power goes. And when it’s back.</h1>' +
    '<p class="lead">Outage turns charging phones into a power-grid sensor. When the grid fails, every charger nearby stops at once. Outage sees it, confirms it, and tells you the minute power returns.</p>' +
    badges(site) +
    `<a class="arrow-link" href="${SIMULATE_HREF}">Try the app in your browser ${icon('chevron')}</a></div>${phone}</div></section>`;
  const facts =
    '<section class="facts" aria-label="Outage in numbers"><div class="container facts-in">' +
    '<div><b>3</b><span>phones must agree before a block shows a cut</span></div>' +
    '<div><b>0</b><span>sign-ups, names or passwords</span></div>' +
    '<div><b>1</b><span>map block saved, never your exact position</span></div>' +
    '<div><b>24/7</b><span>works offline, even at 3 a.m.</span></div></div></section>';
  const how =
    '<section class="section" id="how" aria-labelledby="how-h"><div class="container">' +
    '<p class="eyebrow">How it works</p><h2 id="how-h">One power cut, caught in seconds</h2>' +
    `<ol class="steps">${STEPS.map(([i, h, p], n) => `<li><span class="step-ico">${icon(i)}</span><span class="step-n">0${n + 1}</span><h3>${h}</h3><p>${p}</p></li>`).join('')}</ol></div></section>`;
  const bento =
    '<section class="section alt" id="features" aria-labelledby="feat-h"><div class="container">' +
    '<p class="eyebrow">Features</p><h2 id="feat-h">Everything about the power where you are</h2>' +
    '<div class="bento">' +
    `<article class="tile-b b-alarm"><div class="tile-copy"><span class="t-ico">${icon('alarm')}</span><h3>Light Alarm</h3><p>Rings when power returns at your block, like an alarm clock, even on silent and offline.</p></div>` +
    '<div class="alarm-demo" aria-hidden="true"><p class="ad-time">02:14</p><p class="ad-word">Power is back</p><span class="ad-btn">Stop alarm</span></div></article>' +
    `<article class="tile-b b-insights"><div class="tile-copy"><span class="t-ico">${icon('chart')}</span><h3>Insights for your area</h3><p>Hours of power each day, when cuts usually happen, how long they last, and how long power takes to come back.</p></div><div class="plot" id="herochart"></div></article>` +
    `<article class="tile-b"><span class="t-ico">${icon('place')}</span><h3>Your block on the map</h3><p>See your own block and the blocks around it: on, maybe out, out, or back.</p></article>` +
    `<article class="tile-b"><span class="t-ico">${icon('phone')}</span><h3>Home Watch</h3><p>A spare phone charging at home tells your main phone whether the power at home is on.</p></article>` +
    `<article class="tile-b"><span class="t-ico">${icon('freezer')}</span><h3>Freezer Guard</h3><p>Warns you when your block has been without power for longer than you set.</p></article>` +
    '</div></div></section>';
  const privacy =
    '<section class="section" id="privacy" aria-labelledby="priv-h"><div class="container priv">' +
    `<div><p class="eyebrow">Privacy</p><h2 id="priv-h">Your location stays yours</h2><p class="lead">Outage needs to know which block you are in, and nothing more.</p></div>` +
    `<ul class="checks"><li>${icon('check')}<span><b>Never your exact position.</b> Your phone reads it once to pick a block of about a square kilometre, then forgets it.</span></li>` +
    `<li>${icon('check')}<span><b>No account.</b> No name, email or phone number.</span></li>` +
    `<li>${icon('check')}<span><b>Three-phone rule.</b> An area appears only when three or more phones are in it.</span></li>` +
    `<li>${icon('check')}<span><b>Delete it all</b> from the app, at any time.</span></li></ul></div></section>`;
  const faq =
    '<section class="section alt" id="faq" aria-labelledby="faq-h"><div class="container narrow">' +
    `<p class="eyebrow">Questions</p><h2 id="faq-h">Good to know</h2><div class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></div></section>`;
  const get =
    '<section class="cta" id="get" aria-labelledby="get-h"><div class="container cta-in">' +
    '<h2 id="get-h">Get Outage for Android</h2><p>Free and open source. No account, and never your exact location.</p>' +
    badges(site, 'on-dark') +
    `<a class="arrow-link light" href="${SIMULATE_HREF}">No Android phone? Try it in your browser ${icon('chevron')}</a></div></section>`;
  const foot =
    `<footer class="site-foot"><div class="container foot-in"><div>${brandLink('/')}<p>Your phone charger is a power-grid sensor.</p></div>` +
    `<nav aria-label="Footer"><ul><li><a href="${SIMULATE_HREF}">Live demo</a></li><li><a href="/areas">Areas</a></li><li><a href="/install">Install</a></li><li><a href="/privacy">Privacy</a></li><li><a href="${REPO_URL}">Source code</a></li></ul></nav>` +
    '<small>Map data © OpenStreetMap contributors · Tiles by OpenFreeMap · Google Play and the Google Play logo are trademarks of Google LLC.</small></div></footer>';
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>Outage: know the moment the power goes, and when it’s back</title>' +
    '<meta name="description" content="Outage turns charging phones into a power-grid sensor. It confirms blackouts block by block on a map, tells you when power is back, and shows how power behaves in your area. Free, no account.">' +
    '<meta name="theme-color" content="#ffffff">' +
    `<link rel="canonical" href="${e(site.origin)}/">${FAVICON_LINK}${FONT_LINK}` +
    `<link rel="stylesheet" href="${MAPLIBRE_CSS_PATH}"><link rel="stylesheet" href="/app.css"></head><body class="landing">${nav}<main>${hero}${facts}${how}${bento}${privacy}${faq}${get}</main>${foot}` +
    `<div class="tip" id="tip" role="tooltip" hidden></div><script type="module" src="${LANDING_JS_PATH}"></script></body></html>`;
  return html(page, 3600, { map: true });
}
