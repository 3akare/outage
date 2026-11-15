// Judge mode (web-and-area-pages task 10, R6, design section 7). `/judge`, `/judge-sw.js` and the replay JSON API.
// The replay is simulated data from a static file. These renderers take it as an argument and never touch the public index,
// and no real route receives it (R6.8, W6). Every step is server-rendered, so the page reads fully with scripts off (R1.4);
// the script only adds the play, pause, restart and speed controls and highlights one step.
import { escapeHtml as e } from './escape.ts';
import { html, json, type Rendered } from './headers.ts';
import { layout, type Site } from './layout.ts';
import { stateText, type StateKey } from './strings.ts';

/** The shape of `replay.json` that this page reads (design section 7). Built by `tools/sim`; never written by hand. */
export type ReplayData = {
  simulated: true;
  label: 'Simulated replay';
  recordedDevices: number;
  source: 'RECORDED' | 'SYNTHETIC';
  durationMs: number;
  phones: readonly { alias: string; role: string }[];
  frames: readonly ReplayFrame[];
};

export type ReplayFrame = {
  tMs: number;
  cells: readonly { state: StateKey }[];
  events: readonly { alias: string; type: string }[];
  explanation?: ReplayExplanation;
};

export type ReplayExplanation = {
  k: number;
  n: number;
  excludedNoisy: number;
  lambdaPerSec: number;
  p: number;
  windowMs: number;
  thresholds: {
    possible: { minK: number; maxP: number };
    confirmed: { minK: number; maxP: number };
    minArmedForConfirm: number;
  };
  restore?: { d: number; quorum: number; replugs: number };
};

export const JUDGE_PATH = '/judge';
export const JUDGE_API_PATH = '/api/v1/public/judge/replay';
export const JUDGE_SW_PATH = '/judge-sw.js';
export const BANNER_TEXT = 'Simulated replay';
const TTL_SECONDS = 3600; // replay cache: 1 hour (design decisions)

const JUDGE_STATES: readonly StateKey[] = ['NORMAL', 'POSSIBLE', 'CONFIRMED', 'RESTORED', 'SPOT_ONLY'];

const clock = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const percent = (p: number): string => (p < 0.0001 ? 'under 0.01%' : `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`);

const EVENT_WORDS: Record<string, string> = { ARMED: 'is charging', UNPLUG: 'stopped charging', REPLUG: 'started charging again' };

function frameState(f: ReplayFrame): StateKey {
  const s = f.cells[0]?.state;
  return s !== undefined && JUDGE_STATES.includes(s) ? s : 'NORMAL';
}

/** The engine's numbers in words: drops, armed phones, baseline, probability and thresholds (R6.4). Counts only. */
export function explanationLines(x: ReplayExplanation): string[] {
  const lines = [
    `${x.k} of ${x.n} armed phones stopped charging within ${Math.round(x.windowMs / 1000)} s.`,
    `Usual rate: ${(x.lambdaPerSec * 3600).toFixed(1)} per hour. Chance this is luck: ${percent(x.p)}.`,
    `Possible needs ${x.thresholds.possible.minK}+ drops and a chance under ${percent(x.thresholds.possible.maxP)}. Confirmed needs ${x.thresholds.confirmed.minK}+ drops, ${x.thresholds.minArmedForConfirm}+ armed phones and a chance under ${percent(x.thresholds.confirmed.maxP)}.`,
  ];
  if (x.restore) {
    lines.push(`Restore check: ${x.restore.replugs} phones charging again, ${x.restore.quorum} needed (of ${x.restore.d} that dropped).`);
  }
  return lines;
}

/** Honest device count and "not live" wording (R6.3). A synthetic replay never claims a real device. */
export function provenanceText(r: ReplayData): string {
  const n = r.recordedDevices;
  const devices = `${n} real ${n === 1 ? 'device' : 'devices'} recorded this outage.`;
  const how =
    r.source === 'RECORDED'
      ? 'This is a replay of a recording, not live.'
      : 'This replay is built from a made-up test recording, not live.';
  return `${devices} ${how}`;
}

function stepHtml(f: ReplayFrame, i: number): string {
  const state = frameState(f);
  const t = stateText(state);
  const spot = state === 'SPOT_ONLY' ? ' <span class="note">(a simulated phone, not a real one)</span>' : '';
  const events = f.events.map((ev) => `${e(ev.alias)} ${e(EVENT_WORDS[ev.type] ?? ev.type.toLowerCase())}`).join(', ');
  const why = f.explanation ? `<ul class="list">${explanationLines(f.explanation).map((l) => `<li>${e(l)}</li>`).join('')}</ul>` : '';
  return (
    `<li class="step" data-i="${i}" data-t="${f.tMs}" data-state="${state}">` +
    `<span class="chip" data-state="${state}">${e(t.label)}</span>${spot} <span class="note">${e(clock(f.tMs))}</span>` +
    `<p>${e(t.sentence)}${events ? ` ${e(events)}.` : ''}</p>${why}</li>`
  );
}

const HOW =
  '<h2>The idea in three lines</h2><ul class="list"><li>Phones charging stop charging at the same second when power dies.</li>' +
  '<li>Outage sees many phones in one area stop together, and confirms the power cut.</li>' +
  '<li>Nobody has to report anything.</li></ul>';

// Static script, never built from request data. Plays the server-rendered steps in order. Gaps between steps are squeezed
// to 0.3 to 1.5 s so a 75 minute outage plays in under a minute at 1x. It registers the service worker for offline refresh (R6.7).
const SCRIPT = `(function(){
var steps=[].slice.call(document.querySelectorAll('#steps .step'));
var cur=document.getElementById('current');
var ctl=document.getElementById('controls');
if(!steps.length||!cur||!ctl)return;
var i=0,playing=false,speed=1,timer=0;
function show(n){i=n;steps.forEach(function(s,k){if(k===n)s.setAttribute('aria-current','step');else s.removeAttribute('aria-current');});
cur.replaceChildren(steps[n].cloneNode(true));}
function delay(){var a=+steps[i].getAttribute('data-t'),b=+steps[Math.min(i+1,steps.length-1)].getAttribute('data-t');
return Math.min(1500,Math.max(300,b-a))/speed;}
function tick(){if(!playing)return;if(i>=steps.length-1){stop();return;}
timer=setTimeout(function(){show(i+1);tick();},delay());}
function stop(){playing=false;clearTimeout(timer);play.hidden=false;pause.hidden=true;}
var play=document.getElementById('play'),pause=document.getElementById('pause');
play.onclick=function(){if(i>=steps.length-1)show(0);playing=true;play.hidden=true;pause.hidden=false;tick();};
pause.onclick=stop;
document.getElementById('restart').onclick=function(){stop();show(0);play.onclick();};
[].slice.call(ctl.querySelectorAll('[data-speed]')).forEach(function(b){b.onclick=function(){speed=+b.getAttribute('data-speed');
[].slice.call(ctl.querySelectorAll('[data-speed]')).forEach(function(o){o.setAttribute('aria-pressed',o===b?'true':'false');});};});
ctl.hidden=false;show(0);
if('serviceWorker' in navigator){navigator.serviceWorker.register('${JUDGE_SW_PATH}').catch(function(){});}
})();`;

const CONTROLS =
  '<div id="controls" hidden><button class="btn" id="play" type="button">Play</button><button class="btn" id="pause" type="button" hidden>Pause</button>' +
  '<button class="btn alt" id="restart" type="button">Restart</button> <span class="note">Speed</span> ' +
  '<button class="btn alt" type="button" data-speed="1" aria-pressed="true">1x</button><button class="btn alt" type="button" data-speed="2" aria-pressed="false">2x</button>' +
  '<button class="btn alt" type="button" data-speed="4" aria-pressed="false">4x</button></div>';

function installLine(site: Site): string {
  return `<p><a class="btn" href="${e(site.apkUrl ? site.apkUrl : '/install')}">Install Outage (Android)</a></p>`;
}

/** `/judge` (R6.1 to R6.5, R6.9). The banner is in the HTML and the title, not added by script (R6.2). */
export function renderJudgePage(site: Site, replay: ReplayData | null): Rendered {
  const title = `${BANNER_TEXT}: Outage simulation`;
  const banner = `<div class="banner" role="note">${BANNER_TEXT}</div>`;
  const description = 'A labeled replay that shows how Outage confirms a power cut.';
  if (replay === null || replay.frames.length === 0) {
    const body = `${banner}<main><h1>${BANNER_TEXT}</h1><p>Replay not built.</p>${HOW}${installLine(site)}</main>`;
    return html(layout({ site, title, description, path: '/app/simulate', body }), 5);
  }
  const body =
    `${banner}<main><h1>${BANNER_TEXT}: how Outage confirms a power cut</h1>` +
    `<p>${e(provenanceText(replay))}</p>` +
    `<p class="note">Everything on this page is simulated. It uses no real phone and no live data.</p>${HOW}` +
    `<h2>Now playing</h2><div id="current" aria-live="polite"></div>${CONTROLS}` +
    `<h2>All steps</h2><ol id="steps" class="plain">${replay.frames.map(stepHtml).join('')}</ol>` +
    `${installLine(site)}</main>`;
  return html(layout({ site, title, description, path: '/app/simulate', body, script: SCRIPT }), TTL_SECONDS);
}

/** `/api/v1/public/judge/replay`: the replay object, always `simulated: true` (R6.2, R6.6). */
export function renderJudgeReplayJson(replay: ReplayData | null): Rendered {
  if (replay === null) return json({ simulated: true, label: BANNER_TEXT, error: 'not_built' }, 5, { status: 404 });
  return json({ ...replay, simulated: true, label: BANNER_TEXT }, TTL_SECONDS);
}

// Service worker (R6.7): keeps the last /judge page so a refresh works with no network. It handles only /judge navigations,
// so it never touches a real page. Worker scope and fetch events: https://developer.mozilla.org/docs/Web/API/Service_Worker_API
const SW = `var K='judge-v1';
self.addEventListener('install',function(e){e.waitUntil(caches.open(K).then(function(c){return c.add('${JUDGE_PATH}');}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',function(e){var u=new URL(e.request.url);
if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname!=='${JUDGE_PATH}')return;
e.respondWith(fetch(e.request).then(function(r){if(r.ok){var c=r.clone();caches.open(K).then(function(x){x.put('${JUDGE_PATH}',c);});}return r;})
.catch(function(){return caches.match('${JUDGE_PATH}').then(function(m){return m||Response.error();});}));});
`;

export function renderJudgeServiceWorker(): Rendered {
  return { status: 200, contentType: 'text/javascript; charset=utf-8', body: SW, ttlSeconds: TTL_SECONDS };
}
