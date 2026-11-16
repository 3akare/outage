// Simulation data (web-and-area-pages task 10, R6; ux-redesign task 3). The replay JSON API, its types and the service worker.
// The page itself is in simulate.ts. The replay is simulated data from a static file. No real route receives it (R6.8, W6).
import { json, type Rendered } from '../../site/headers.ts';
import type { StateKey } from '../../site/strings.ts';

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

const percent = (p: number): string => (p < 0.0001 ? 'under 0.01%' : `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`);

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

/** `/api/v1/public/judge/replay`: the replay object, always `simulated: true` (R6.2, R6.6). */
export function renderJudgeReplayJson(replay: ReplayData | null): Rendered {
  if (replay === null) return json({ simulated: true, label: BANNER_TEXT, error: 'not_built' }, 5, { status: 404 });
  return json({ ...replay, simulated: true, label: BANNER_TEXT }, TTL_SECONDS);
}

// Service worker (R6.7, ADR 0016 revised in ADR 0029): keeps the simulation page, its script, the stylesheet and the replay
// JSON so a refresh works with no network. It handles only those four GET paths, so it never touches a real page or real data.
// Worker scope and fetch events: https://developer.mozilla.org/docs/Web/API/Service_Worker_API
const SW = `var K='sim-v2',P=['/app/simulate','/simulate.js','/app.css','${JUDGE_API_PATH}'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(K).then(function(c){return c.addAll(P);}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==K;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){var u=new URL(e.request.url);
if(e.request.method!=='GET'||u.origin!==self.location.origin||P.indexOf(u.pathname)<0)return;
e.respondWith(fetch(e.request).then(function(r){if(r.ok){var c=r.clone();caches.open(K).then(function(x){x.put(u.pathname,c);});}return r;})
.catch(function(){return caches.match(u.pathname).then(function(m){return m||Response.error();});}));});
`;

export function renderJudgeServiceWorker(): Rendered {
  return { status: 200, contentType: 'text/javascript; charset=utf-8', body: SW, ttlSeconds: TTL_SECONDS };
}
