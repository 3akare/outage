// Web replica of the phone app (ux-redesign task 2, ADR 0026 and 0027): /app, /app/insights, /app/settings.
// Real data only, from the same JSON the phone reads (/api/map.json). It never touches the simulation replay (UX2).
// The server draws the map and the feed so the page reads with scripts off. /app.js redraws from fresh JSON and adds
// the area sheet. Boundaries: https://uber.github.io/h3-js/#celltoboundary (ring is [lat, lng] pairs).
import type { MapCellState, MapJson } from '@outage/shared';
import { APP_CSS } from './design.ts';
import { escapeHtml as e, safeHref } from '../site/escape.ts';
import { html, type Rendered } from '../site/headers.ts';
import type { Site } from '../site/layout.ts';

export const APP_TABS = [
  { id: 'home', path: '/app', label: 'Home' },
  { id: 'insights', path: '/app/insights', label: 'Insights' },
  { id: 'settings', path: '/app/settings', label: 'Settings' },
] as const;
export type AppTab = (typeof APP_TABS)[number]['id'];

export const SIMULATE_PATH = '/app/simulate';
export const EMPTY_TEXT = 'No phones reporting here yet';
export const LOAD_ERROR_TEXT = "Can't load the map. Try again.";

const STATE_LABEL: Record<MapCellState, string> = {
  NORMAL: 'Power on',
  POSSIBLE: 'Possible power cut',
  CONFIRMED: 'Power cut',
  RESTORED: 'Power is back',
  NO_DATA: 'No data yet',
};
const RANK: Record<MapCellState, number> = { CONFIRMED: 4, POSSIBLE: 3, RESTORED: 2, NORMAL: 1, NO_DATA: 0 };
const STATES: readonly MapCellState[] = ['NORMAL', 'POSSIBLE', 'CONFIRMED', 'RESTORED', 'NO_DATA'];

const W = 1000;
const PAD = 56;
const LBL_GAP = 36;
const r1 = (n: number): number => Math.round(n * 10) / 10;

export type HexLayout = {
  height: number;
  cells: { id: string; area: string; state: MapCellState; d: string }[];
  labels: { name: string; x: number; y: number }[];
};

/** Flat projection of every ring into a 1000 wide box. Same maths as the client in /app.js. */
export function hexLayout(map: MapJson): HexLayout {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const c of map.cells) {
    for (const [lat, lng] of c.ring) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  }
  if (map.cells.length === 0) return { height: 0, cells: [], labels: [] };
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-6);
  const scale = (W - 2 * PAD) / spanX;
  const height = Math.round((maxLat - minLat) * scale + 2 * PAD);
  const px = (lng: number): number => PAD + (lng - minLng) * k * scale;
  const py = (lat: number): number => PAD + (maxLat - lat) * scale;
  const cells = map.cells.map((c) => ({
    id: c.id,
    area: c.area,
    state: c.state,
    d: `${c.ring.map(([lat, lng], i) => `${i ? 'L' : 'M'}${r1(px(lng))} ${r1(py(lat))}`).join('')}Z`,
  }));
  const byId = new Map(map.cells.map((c) => [c.id, c]));
  const labels = map.areas.flatMap((a) => {
    const c = byId.get(a.centreCell);
    if (!c) return [];
    const lat = c.ring.reduce((s, p) => s + p[0], 0) / c.ring.length;
    const lng = c.ring.reduce((s, p) => s + p[1], 0) / c.ring.length;
    return [{ name: a.name, x: r1(px(lng)), y: r1(py(lat)) }];
  });
  // Push a label down when it would sit on top of another one (same rule as the client script).
  const placed: { x: number; y: number }[] = [];
  for (const t of [...labels].sort((a, b) => a.y - b.y)) {
    for (const o of placed) if (Math.abs(o.x - t.x) < 200 && t.y - o.y < LBL_GAP) t.y = r1(o.y + LBL_GAP);
    placed.push(t);
  }
  return { height, cells, labels };
}

const DEFS =
  '<defs><pattern id="p-possible" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" class="pp-bg"/><rect width="5" height="14" class="pp-possible"/></pattern>' +
  '<pattern id="p-confirmed" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" class="pp-bg"/><circle cx="7" cy="7" r="4.5" class="pp-confirmed"/></pattern></defs>';

function mapSvg(map: MapJson, names: ReadonlyMap<string, string>): string {
  const l = hexLayout(map);
  const cells = l.cells
    .map((c) => {
      const name = names.get(c.area) ?? c.area;
      return `<path class="hx" tabindex="0" role="button" data-id="${e(c.id)}" data-area="${e(c.area)}" data-state="${c.state}" d="${c.d}"><title>${e(name)}: ${STATE_LABEL[c.state]}</title></path>`;
    })
    .join('');
  const labels = l.labels.map((t) => `<text class="lbl" x="${t.x}" y="${t.y}">${e(t.name)}</text>`).join('');
  return `<svg class="hex" id="hexmap" viewBox="0 0 ${W} ${l.height}" role="group" aria-label="Map of areas coloured by power status. The list has the same information." xmlns="http://www.w3.org/2000/svg">${DEFS}${cells}${labels}</svg>`;
}

function legend(): string {
  return `<ul class="legend" aria-label="Map colours">${STATES.map((s) => `<li data-state="${s}"><span class="sw" data-state="${s}"></span>${STATE_LABEL[s]}</li>`).join('')}</ul>`;
}

type AreaRow = { slug: string; name: string; state: MapCellState };

function rollup(map: MapJson): AreaRow[] {
  const worst = new Map<string, MapCellState>();
  for (const c of map.cells) {
    const cur = worst.get(c.area) ?? 'NO_DATA';
    if (RANK[c.state] > RANK[cur]) worst.set(c.area, c.state);
  }
  return map.areas
    .map((a) => ({ slug: a.slug, name: a.name, state: worst.get(a.slug) ?? ('NO_DATA' as const) }))
    .sort((a, b) => RANK[b.state] - RANK[a.state] || a.name.localeCompare(b.name));
}

function installHref(site: Site): string {
  return site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install';
}

function emptyCard(site: Site): string {
  return (
    `<div class="card empty" id="empty"><h2>${EMPTY_TEXT}</h2>` +
    '<p>Colours appear when 3 or more phones in an area agree. Nothing here is made up.</p>' +
    `<div class="cta"><a class="btn" href="${SIMULATE_PATH}">Watch a blackout</a><a class="btn alt" href="${e(installHref(site))}">Install</a></div></div>`
  );
}

function feedHtml(rows: readonly AreaRow[]): string {
  const live = rows.filter((r) => r.state !== 'NO_DATA');
  const items = (list: readonly AreaRow[]): string =>
    `<ul class="feed">${list
      .map(
        (r) =>
          `<li><button type="button" class="row" data-area="${e(r.slug)}"><span class="name">${e(r.name)}</span><span class="chip" data-state="${r.state}"><i></i>${STATE_LABEL[r.state]}</span></button></li>`,
      )
      .join('')}</ul>`;
  return (
    (live.length ? `<h2>Right now</h2><div id="live">${items(live)}</div>` : '<div id="live"></div>') +
    `<h2>All areas</h2><div id="areas">${items(rows)}</div>`
  );
}

function homeBody(site: Site, map: MapJson | null): string {
  if (map === null) {
    return (
      `<h1>Home</h1><div class="card empty" id="error"><h2>${LOAD_ERROR_TEXT}</h2>` +
      `<div class="cta"><a class="btn" href="/app">Try again</a><a class="btn alt" href="${SIMULATE_PATH}">Watch a blackout</a></div></div>`
    );
  }
  const rows = rollup(map);
  const names = new Map(map.areas.map((a) => [a.slug, a.name]));
  const anyData = map.cells.some((c) => c.state !== 'NO_DATA');
  return (
    '<h1>Home</h1><div class="home-grid"><section aria-label="Map"><div class="card mapcard"><div class="mapbox">' +
    `${mapSvg(map, names)}</div>${legend()}</div><div id="sheet" class="sheet" hidden aria-live="polite"></div></section>` +
    `<section aria-label="Feed"><div id="feedtop">${anyData ? '' : emptyCard(site)}</div>${feedHtml(rows)}` +
    '<p class="muted">Real data from phones. Areas with fewer than 3 phones stay grey.</p></section></div>'
  );
}

const insightsBody = (site: Site): string =>
  '<h1>Insights</h1><p class="real">Real data from phones, last 30 days</p>' +
  '<div id="ins"><div class="card empty" id="ins-empty"><h2>No outages recorded yet</h2><p>This fills in when phones report a power cut. Turn on scripts to load it.</p></div></div>' +
  '<div class="card"><h2>Your own numbers</h2><p class="muted">Light Score, your power log and the check against your tariff band need your own charging phone. They live in the Android app.</p>' +
  `<div class="cta"><a class="btn" href="${e(installHref(site))}">Install Outage</a></div></div>`;

function settingsBody(site: Site): string {
  const row = (title: string, text: string, tag = 'In the Android app'): string =>
    `<div class="setting"><div><p><b>${e(title)}</b></p><p class="muted">${e(text)}</p></div><span class="tag">${e(tag)}</span></div>`;
  return (
    '<h1>Settings</h1><p class="real">This is the web view. Your settings live in the Android app.</p>' +
    '<div class="card">' +
    row('Alerts and alarm', 'Ring a real alarm when power comes back at your spot, even at 3 a.m.') +
    row('Home Watch', 'A spare phone charging at home tells your main phone if power is on.') +
    row('Keep it running', 'Steps to stop your phone from closing Outage in the background.') +
    row('Area and tariff band', 'Pick your area and band to compare your power with the promise.') +
    '</div><div class="card"><h2>Privacy</h2><ul class="list"><li>No account, no phone number, no name.</li><li>Your exact place is never stored, only a coarse hex cell.</li>' +
    '<li>An area shows only when 3 or more phones agree.</li><li>Delete my data removes everything tied to your install, on the server and on your phone.</li>' +
    '<li>This website sets no cookies and has no trackers.</li></ul>' +
    '<div class="cta"><a class="btn alt" href="/privacy">Read the privacy page</a></div></div>' +
    '<div class="card"><h2>Get the app</h2><p class="muted">Outage is an Android app. It needs one tap to start.</p>' +
    `<div class="cta"><a class="btn" href="${e(installHref(site))}">Install Outage</a><a class="btn alt" href="${SIMULATE_PATH}">Watch a blackout</a></div>` +
    '<p class="muted">Simulated and real data never share a page. The simulation is clearly marked.</p></div>'
  );
}

const ICONS: Record<AppTab, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
  insights: '<path d="M5 20V11"/><path d="M12 20V4"/><path d="M19 20v-6"/>',
  settings: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>',
};

export const LOGO =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l11 6.4v12.8L16 27.6 5 21.2V8.4z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 8l-5 9h4l-1 7 5-9h-4z" fill="#3ddc97"/></svg>';

export function dockHtml(active: AppTab | null): string {
  return (
    '<nav class="dock" aria-label="Main">' +
    APP_TABS.map(
      (t) =>
        `<a href="${t.path}"${t.id === active ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[t.id]}</svg><span>${t.label}</span></a>`,
    ).join('') +
    '</nav>'
  );
}

export function renderAppPage(tab: AppTab, site: Site, map: MapJson | null): Rendered {
  const body = tab === 'home' ? homeBody(site, map) : tab === 'insights' ? insightsBody(site) : settingsBody(site);
  const t = APP_TABS.find((x) => x.id === tab) ?? APP_TABS[0];
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="theme-color" content="#0f141b">' +
    `<title>${t.label} | Outage web app</title>` +
    '<meta name="description" content="The Outage app on the web. A map of power by area, from real charging phones.">' +
    `<link rel="canonical" href="${e(site.origin + t.path)}">` +
    '<link rel="stylesheet" href="/app.css"></head><body>' +
    `<div class="shell" id="app" data-page="${tab}"><div class="top"><a class="brand" href="/">${LOGO}Outage</a><span class="live"><b></b>Live data</span></div>` +
    `<main class="content">${body}</main>${dockHtml(tab)}</div><script src="/app.js" defer></script></body></html>`;
  return html(page, map === null ? 5 : 30);
}

export const renderAppCss = (): Rendered => ({ status: 200, contentType: 'text/css; charset=utf-8', body: APP_CSS, ttlSeconds: 3600 });

// Static script, never built from request data. Reads /api/map.json only (UX2). No storage, no cookies, no tracking.
const JS = `(function(){
var root=document.getElementById('app');if(!root)return;
var page=root.getAttribute('data-page');
var main=root.querySelector('main');
var LABEL={NORMAL:'Power on',POSSIBLE:'Possible power cut',CONFIRMED:'Power cut',RESTORED:'Power is back',NO_DATA:'No data yet'};
var SENT={NORMAL:'Power looks normal.',POSSIBLE:'Some phones lost power. We are checking.',CONFIRMED:'Power is out. Many phones lost it together.',RESTORED:'Power came back.',NO_DATA:'No phones reporting here yet.'};
var RANK={CONFIRMED:4,POSSIBLE:3,RESTORED:2,NORMAL:1,NO_DATA:0};
var NS='http://www.w3.org/2000/svg';
function el(n,a,t){var x=document.createElement(n);for(var k in a)x.setAttribute(k,a[k]);if(t!==undefined)x.textContent=t;return x;}
function sv(n,a,t){var x=document.createElementNS(NS,n);for(var k in a)x.setAttribute(k,a[k]);if(t!==undefined)x.textContent=t;return x;}
function clock(ms){return new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
function day(ms){return new Date(ms).toLocaleDateString([],{day:'numeric',month:'short'});}
function when(ms,now){return (now-ms>72000000?day(ms)+', ':'')+clock(ms);}
function dur(ms){var m=Math.max(1,Math.round(ms/60000));if(m<60)return m+' min';var h=Math.floor(m/60);return h+' h'+(m%60?' '+(m%60)+' min':'');}
function chip(s){var c=el('span',{'class':'chip','data-state':s});c.appendChild(el('i',{}));c.appendChild(document.createTextNode(LABEL[s]));return c;}
function rollup(m){var w={};m.cells.forEach(function(c){if((RANK[c.state]||0)>(RANK[w[c.area]||'NO_DATA']))w[c.area]=c.state;});
return m.areas.map(function(a){return{slug:a.slug,name:a.name,state:w[a.slug]||'NO_DATA'};}).sort(function(a,b){return RANK[b.state]-RANK[a.state]||(a.name<b.name?-1:1);});}
function project(m){var minLa=1e9,maxLa=-1e9,minLn=1e9,maxLn=-1e9;
m.cells.forEach(function(c){c.ring.forEach(function(p){minLa=Math.min(minLa,p[0]);maxLa=Math.max(maxLa,p[0]);minLn=Math.min(minLn,p[1]);maxLn=Math.max(maxLn,p[1]);});});
var k=Math.cos(((minLa+maxLa)/2)*Math.PI/180),sx=Math.max((maxLn-minLn)*k,1e-6),sc=(${W}-2*${PAD})/sx;
return{h:Math.round((maxLa-minLa)*sc+2*${PAD}),x:function(g){return ${PAD}+(g-minLn)*k*sc;},y:function(t){return ${PAD}+(maxLa-t)*sc;}};}
function r1(n){return Math.round(n*10)/10;}
var proj=null;
function zoom(m,slug){var svg=document.getElementById('hexmap');if(!svg||!proj)return;
if(!slug){svg.setAttribute('viewBox','0 0 ${W} '+proj.h);return;}
var a=1e9,b=1e9,c=-1e9,d=-1e9;m.cells.forEach(function(x){if(x.area!==slug)return;x.ring.forEach(function(q){var X=proj.x(q[1]),Y=proj.y(q[0]);a=Math.min(a,X);c=Math.max(c,X);b=Math.min(b,Y);d=Math.max(d,Y);});});
if(a>c)return;var w=Math.max(c-a,160)+120,h=Math.max(d-b,120)+120,cx=(a+c)/2,cy=(b+d)/2;
var asp=svg.viewBox.baseVal.width/svg.viewBox.baseVal.height;if(w/h<asp)w=h*asp;else h=w/asp;
svg.setAttribute('viewBox',(cx-w/2)+' '+(cy-h/2)+' '+w+' '+h);}
function drawMap(m,names,onPick){var old=document.getElementById('hexmap');if(!old||!m.cells.length)return;
var p=proj=project(m),svg=sv('svg',{'class':'hex',id:'hexmap',viewBox:'0 0 ${W} '+p.h,role:'group','aria-label':old.getAttribute('aria-label')});
var defs=old.querySelector('defs');if(defs)svg.appendChild(defs.cloneNode(true));
m.cells.forEach(function(c){var d=c.ring.map(function(q,i){return(i?'L':'M')+r1(p.x(q[1]))+' '+r1(p.y(q[0]));}).join('')+'Z';
var h=sv('path',{'class':'hx',tabindex:'0',role:'button','data-id':c.id,'data-area':c.area,'data-state':c.state,d:d});
h.appendChild(sv('title',{},(names[c.area]||c.area)+': '+LABEL[c.state]));svg.appendChild(h);});
var byId={};m.cells.forEach(function(c){byId[c.id]=c;});
var ls=[];m.areas.forEach(function(a){var c=byId[a.centreCell];if(!c)return;var la=0,ln=0;c.ring.forEach(function(q){la+=q[0];ln+=q[1];});
ls.push({n:a.name,x:r1(p.x(ln/c.ring.length)),y:r1(p.y(la/c.ring.length))});});
ls.sort(function(a,b){return a.y-b.y;});var pl=[];ls.forEach(function(t){pl.forEach(function(o){if(Math.abs(o.x-t.x)<200&&t.y-o.y<${LBL_GAP})t.y=r1(o.y+${LBL_GAP});});pl.push(t);});
ls.forEach(function(t){svg.appendChild(sv('text',{'class':'lbl',x:t.x,y:t.y},t.n));});
old.parentNode.replaceChild(svg,old);}
function home(m){
var names={};m.areas.forEach(function(a){names[a.slug]=a.name;});
var rows=rollup(m),any=m.cells.some(function(c){return c.state!=='NO_DATA';});
var sheet=document.getElementById('sheet'),top=document.getElementById('feedtop');
function pick(slug,cellId){var svg=document.getElementById('hexmap');
if(svg)[].forEach.call(svg.querySelectorAll('.hx'),function(h){h.classList.toggle('sel',h.getAttribute('data-id')===cellId);});
var cells=m.cells.filter(function(c){return c.area===slug;}),best=cells.filter(function(c){return c.id===cellId})[0]||cells.slice().sort(function(a,b){return RANK[b.state]-RANK[a.state];})[0];
if(!best)return;sheet.hidden=false;sheet.setAttribute('data-state',best.state);sheet.textContent='';
sheet.appendChild(chip(best.state));sheet.appendChild(el('h3',{},names[slug]||slug));sheet.appendChild(el('p',{},SENT[best.state]));zoom(m,slug);
if(best.state==='RESTORED'&&best.restoredMs)sheet.appendChild(el('p',{'class':'muted'},'Back at '+when(best.restoredMs,m.generatedMs)+'.'));
else if(best.sinceMs&&best.state!=='NORMAL')sheet.appendChild(el('p',{'class':'muted'},'Since '+when(best.sinceMs,m.generatedMs)+'.'));
else if(best.state==='NORMAL'&&best.sinceMs)sheet.appendChild(el('p',{'class':'muted'},'On since '+when(best.sinceMs,m.generatedMs)+'.'));
var back=el('button',{'class':'btn alt',type:'button'},'Show whole city');back.addEventListener('click',function(){zoom(m,null);sheet.hidden=true;[].forEach.call(document.querySelectorAll('.hx.sel'),function(h){h.classList.remove('sel');});});sheet.appendChild(el('p',{}));sheet.appendChild(back);}
drawMap(m,names);
var svg=document.getElementById('hexmap');
function onHex(t){var h=t.closest&&t.closest('.hx');if(h)pick(h.getAttribute('data-area'),h.getAttribute('data-id'));}
if(svg){svg.addEventListener('click',function(ev){onHex(ev.target);});svg.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();onHex(ev.target);}});}
[].forEach.call(document.querySelectorAll('button.row'),function(b){b.addEventListener('click',function(){pick(b.getAttribute('data-area'));sheet.scrollIntoView({block:'nearest',behavior:'smooth'});});});
if(any&&top)top.textContent='';
}
function insights(m){
var host=document.getElementById('ins');if(!host)return;host.textContent='';
var names={};m.areas.forEach(function(a){names[a.slug]=a.name;});
var per={};m.cells.forEach(function(c){c.history30d.forEach(function(o){(per[c.area]=per[c.area]||[]).push({s:o.startMs,e:o.endMs===null?m.generatedMs:o.endMs,open:o.endMs===null,level:o.level});});});
var all=[];Object.keys(per).forEach(function(a){var l=per[a].sort(function(x,y){return x.s-y.s;}),cur=null;
l.forEach(function(o){if(cur&&o.s<=cur.e){cur.e=Math.max(cur.e,o.e);cur.open=cur.open||o.open;if(o.level==='CONFIRMED')cur.level='CONFIRMED';}else{cur={s:o.s,e:o.e,open:o.open,level:o.level,area:a};all.push(cur);}});});
if(!all.length){var c=el('div',{'class':'card empty'});c.appendChild(el('h2',{},'No outages recorded yet'));c.appendChild(el('p',{},'Nothing has been confirmed in the last 30 days. This fills in when phones report a power cut.'));host.appendChild(c);return;}
all.sort(function(a,b){return b.s-a.s;});
var total=0,longest=0,hrs={};all.forEach(function(o){var d=o.e-o.s;total+=d;longest=Math.max(longest,d);hrs[o.area]=(hrs[o.area]||0)+d;});
var tiles=el('div',{'class':'tiles'});
[[String(all.length),'outages'],[dur(total),'without power'],[dur(longest),'longest']].forEach(function(t){var d=el('div',{'class':'tile'});d.appendChild(el('b',{},t[0]));d.appendChild(el('span',{},t[1]));tiles.appendChild(d);});
host.appendChild(tiles);
host.appendChild(el('h2',{},'Time without power by area'));
var card=el('div',{'class':'card'}),ul=el('ul',{'class':'bars'}),max=0;Object.keys(hrs).forEach(function(a){max=Math.max(max,hrs[a]);});
Object.keys(hrs).sort(function(a,b){return hrs[b]-hrs[a];}).forEach(function(a){var li=el('li',{}),tr=el('span',{'class':'track'}),f=el('span',{'class':'fill'});
f.setAttribute('data-w',String(Math.round(hrs[a]/max*100)));tr.appendChild(f);li.appendChild(el('span',{},names[a]||a));li.appendChild(tr);li.appendChild(el('span',{'class':'muted'},dur(hrs[a])));ul.appendChild(li);});
card.appendChild(ul);host.appendChild(card);
[].forEach.call(card.querySelectorAll('.fill'),function(f){f.style.width=f.getAttribute('data-w')+'%';});
host.appendChild(el('h2',{},'Every outage'));
var feed=el('ul',{'class':'feed'});all.forEach(function(o){var li=el('li',{}),r=el('div',{'class':'row'}),l=el('span',{}),lv=o.level==='CONFIRMED'?'CONFIRMED':'POSSIBLE';
l.appendChild(el('span',{'class':'name'},names[o.area]||o.area));l.appendChild(el('span',{'class':'sub'},when(o.s,m.generatedMs)+(o.open?', still going':', '+dur(o.e-o.s))));
r.appendChild(l);r.appendChild(chip(lv));li.appendChild(r);feed.appendChild(li);});host.appendChild(feed);}
function fail(){var e=document.getElementById('hexmap');if(e)return;
if(page==='settings'||document.getElementById('error'))return;
var c=el('div',{'class':'card empty',id:'error'});c.appendChild(el('h2',{},"Can't load the map. Try again."));
var a=el('a',{'class':'btn',href:location.pathname},'Try again');var w=el('div',{'class':'cta'});w.appendChild(a);c.appendChild(w);main.appendChild(c);}
if(page==='settings')return;
function load(){fetch('/api/map.json?city=lagos',{headers:{accept:'application/json'}}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(m){
if(page==='home')home(m);else if(page==='insights')insights(m);}).catch(fail);}
load();
})();`;

export const renderAppJs = (): Rendered => ({ status: 200, contentType: 'text/javascript; charset=utf-8', body: JS, ttlSeconds: 3600 });
