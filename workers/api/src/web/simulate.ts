// Simulation player at /app/simulate (ux-redesign task 3, ADR 0027 and 0029). One sentence, one button.
// It plays the real engine output from /api/v1/public/judge/replay (ADR 0015): phones drop, then Possible, Confirmed, Restored.
// This page never reads the public index and the real pages never read the replay (W6). The banner is in the HTML, not added by script.
import { escapeHtml as e, safeHref } from './escape.ts';
import { html, type Rendered } from './headers.ts';
import type { Site } from './layout.ts';
import { dockHtml, LOGO, SIMULATE_PATH } from './app.ts';

export { SIMULATE_PATH };
export const SIMULATE_JS_PATH = '/simulate.js';
export const SIM_BANNER_TEXT = 'Simulated, not live data';
export const SIM_SENTENCE = 'Watch ten simulated phones lose power together, and see how Outage turns that into a confirmed blackout.';
const TTL_SECONDS = 3600;

const DEFS =
  '<defs><pattern id="p-possible" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" class="pp-bg"/><rect width="5" height="14" class="pp-possible"/></pattern>' +
  '<pattern id="p-confirmed" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" class="pp-bg"/><circle cx="7" cy="7" r="4.5" class="pp-confirmed"/></pattern></defs>';

// One big hexagon (pointy top) in a 400 x 360 box. The script adds one dot per simulated phone.
const HEX_D = (() => {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${i ? 'L' : 'M'}${(200 + 172 * Math.cos(a)).toFixed(1)} ${(180 + 172 * Math.sin(a)).toFixed(1)}`;
  });
  return `${pts.join('')}Z`;
})();

const STEPS: readonly [string, string][] = [
  ['NORMAL', 'Power on'],
  ['POSSIBLE', 'Possible'],
  ['CONFIRMED', 'Confirmed'],
  ['RESTORED', 'Restored'],
];

export function renderSimulatePage(site: Site): Rendered {
  const install = e(site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install');
  const track = `<ol class="track-steps" id="steps">${STEPS.map(([s, l]) => `<li data-state="${s}">${l}</li>`).join('')}</ol>`;
  const body =
    `<div class="shell" id="sim"><div class="sim-banner" role="note">${SIM_BANNER_TEXT}</div>` +
    `<div class="top"><a class="brand" href="/">${LOGO}Outage</a><span class="live">Simulation</span></div>` +
    '<main class="content"><h1>Watch a blackout</h1>' +
    `<p class="lead">${SIM_SENTENCE}</p>` +
    '<div class="sim-grid"><section aria-label="Simulated area"><div class="cta go"><button class="btn" id="go" type="button" disabled>Simulate a blackout</button></div><div class="card stage">' +
    `<svg id="stage" viewBox="0 0 400 360" role="img" aria-label="One simulated area with ten simulated phones" xmlns="http://www.w3.org/2000/svg">${DEFS}` +
    `<path class="hx" id="simhex" data-state="NORMAL" d="${HEX_D}"/><g id="dots"></g></svg>` +
    '<ul class="legend" aria-label="Phones"><li><span class="dotkey on"></span>Charging</li><li><span class="dotkey off"></span>Stopped charging</li></ul></div></section>' +
    '<section aria-label="What is happening"><div class="card" id="panel">' +
    '<span class="chip" id="simstate" data-state="NORMAL"><i></i><span id="simlabel">Power on</span></span>' +
    '<p class="big" id="simcount">Loading the simulation</p>' +
    '<p class="muted" id="simcaption" aria-live="polite">One moment.</p>' +
    `${track}</div>` +
    '<div class="card" id="why" hidden><h2>How sure is Outage?</h2><ul class="list" id="whylist"></ul></div>' +
    '<noscript><div class="card"><p>This simulation needs scripts. Power on, then Possible, then Confirmed, then Restored.</p></div></noscript>' +
    '<p class="muted" id="prov"></p></section></div>' +
    `<div class="cta"><a class="btn alt" href="/app">Open web app</a><a class="btn alt" href="${install}">Install on Android</a></div></main>` +
    `${dockHtml(null)}</div><script src="${SIMULATE_JS_PATH}" defer></script>`;
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0f141b">' +
    `<title>${SIM_BANNER_TEXT}: watch a blackout | Outage</title>` +
    '<meta name="description" content="A simulated blackout that shows how Outage confirms a power cut. Not live data.">' +
    `<link rel="canonical" href="${e(site.origin + SIMULATE_PATH)}">` +
    `<link rel="stylesheet" href="/app.css"></head><body>${body}</body></html>`;
  return html(page, TTL_SECONDS);
}

// Static script, never built from request data. Reads only the replay endpoint. Gaps between frames are squeezed so the
// whole outage plays in about 15 seconds. The service worker (ADR 0016) lets a refresh work with no network.
const JS = `(function(){
var $=function(i){return document.getElementById(i);};
var NS='http://www.w3.org/2000/svg';
var LABEL={NORMAL:'Power on',POSSIBLE:'Possible power cut',CONFIRMED:'Power cut',RESTORED:'Power is back'};
var go=$('go'),hex=$('simhex'),chip=$('simstate'),lab=$('simlabel'),cnt=$('simcount'),cap=$('simcaption'),steps=$('steps'),why=$('why'),wl=$('whylist'),prov=$('prov'),dots=$('dots');
var R=null,fr=[],start=0,phones=[],on={},timer=0,running=false;
function pct(p){return p<0.0001?'under 0.01%':(p*100).toFixed(p<0.01?2:1)+'%';}
function setState(s){hex.setAttribute('data-state',s);chip.setAttribute('data-state',s);lab.textContent=LABEL[s];
var seen=false,order=['NORMAL','POSSIBLE','CONFIRMED','RESTORED'];
[].forEach.call(steps.children,function(li){var k=li.getAttribute('data-state');li.removeAttribute('aria-current');li.classList.toggle('done',order.indexOf(k)<order.indexOf(s));
if(k===s){li.setAttribute('aria-current','step');li.classList.add('done');}});}
function counts(){var off=0;phones.forEach(function(p){if(!on[p.alias])off++;});return{off:off,n:phones.length};}
function draw(){phones.forEach(function(p){var c=$('d-'+p.alias);if(c)c.setAttribute('class','dot'+(on[p.alias]?'':' off'));});}
function words(s,phase){var c=counts(),o=c.off,n=c.n;
if(s==='NORMAL')return o===0?[n+' of '+n+' phones are charging','Power is on. Press the button to cut it.']:[o+' of '+n+' phones stopped charging','Not enough yet to call it a power cut.'];
if(s==='POSSIBLE')return[o+' of '+n+' phones stopped charging','Several phones stopped within seconds of each other. Outage is checking.'];
if(s==='CONFIRMED')return[o+' of '+n+' phones lost power together','Too many at once to be luck. Outage confirms a power cut for this area.'];
return[(n-o)+' of '+n+' phones are charging again','Phones are charging again. Outage says power is back.'];}
function why1(x){wl.textContent='';var l=[x.k+' of '+x.n+' armed phones stopped charging within '+Math.round(x.windowMs/1000)+' seconds.',
'Usual rate: '+(x.lambdaPerSec*3600).toFixed(1)+' per hour. Chance this is luck: '+pct(x.p)+'.'];
if(x.restore)l.push('Restore check: '+x.restore.replugs+' phones charging again, '+x.restore.quorum+' needed.');
l.forEach(function(t){var li=document.createElement('li');li.textContent=t;wl.appendChild(li);});why.hidden=false;}
function show(s,f){setState(s);var w=words(s);cnt.textContent=w[0];cap.textContent=w[1];if(f&&f.explanation)why1(f.explanation);draw();}
function apply(f){f.events.forEach(function(e){if(e.type==='UNPLUG')on[e.alias]=false;else if(e.type==='REPLUG'||e.type==='ARMED')on[e.alias]=true;});}
function st(f){return f.cells[0]&&LABEL[f.cells[0].state]?f.cells[0].state:'NORMAL';}
function reset(){on={};for(var i=0;i<start;i++)apply(fr[i]);why.hidden=true;show('NORMAL');}
function gap(a,b){var g=b.tMs-a.tMs,m=st(a)==='POSSIBLE'?800:350;return g>5000?2200:Math.min(900,Math.max(m,g));}
function run(i){if(i>=fr.length){running=false;go.disabled=false;go.textContent='Simulate again';return;}
apply(fr[i]);show(st(fr[i]),fr[i]);if(i+1>=fr.length){run(i+1);return;}timer=setTimeout(function(){run(i+1);},gap(fr[i],fr[i+1]));}
function layout(){var n=phones.length;dots.textContent='';phones.forEach(function(p,i){var r=125*Math.sqrt((i+0.5)/n),a=i*2.39996,c=document.createElementNS(NS,'circle');
c.setAttribute('id','d-'+p.alias);c.setAttribute('cx',(200+r*Math.cos(a)).toFixed(1));c.setAttribute('cy',(180+r*Math.sin(a)).toFixed(1));c.setAttribute('r','20');dots.appendChild(c);});}
function ready(d){R=d;fr=d.frames;phones=d.phones;
var first=-1;for(var i=0;i<fr.length;i++){var s=fr[i].cells[0]&&fr[i].cells[0].state;if(s==='POSSIBLE'||s==='CONFIRMED'){first=i;break;}}
if(first<0)return fail();start=first;while(start>0&&fr[start-1].events.some(function(e){return e.type==='UNPLUG';}))start--;
layout();reset();
prov.textContent=d.recordedDevices+(d.recordedDevices===1?' real device':' real devices')+' recorded this outage. '+(d.source==='RECORDED'?'This replays a recording, not live.':'This replay is built from a made-up test recording, not live.')+' The numbers come from the same engine that runs on real data.';
go.disabled=false;
go.onclick=function(){if(running)return;running=true;go.disabled=true;go.textContent='Simulating...';clearTimeout(timer);reset();timer=setTimeout(function(){run(start);},600);};}
function fail(){cnt.textContent="Can't load the simulation";cap.textContent='Check your connection and try again.';go.disabled=false;go.textContent='Try again';go.onclick=function(){location.reload();};}
fetch('${'/api/v1/public/judge/replay'}',{headers:{accept:'application/json'}}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(ready).catch(fail);
if('serviceWorker' in navigator){navigator.serviceWorker.register('/judge-sw.js').catch(function(){});}
})();`;

export const renderSimulateJs = (): Rendered => ({ status: 200, contentType: 'text/javascript; charset=utf-8', body: JS, ttlSeconds: TTL_SECONDS });
