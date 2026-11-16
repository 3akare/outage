// The Outage app in the browser, for people without an Android phone (ADR 0049, ADR 0051, demo-mode.md). It mirrors the
// phone app screen for screen: first run with the location question over a turning globe, the Home globe with its sheet, Insights and Settings, the
// heads-up notification and the Light Alarm. Everything on it is simulated and says so. The blackout is the replay
// built by tools/sim from the real detection engine; the page reads only that replay and never the public index (W6).
import { escapeHtml as e, safeHref } from '../../site/escape.ts';
import { html, type Rendered } from '../../site/headers.ts';
import { icon } from '../../site/icons.ts';
import type { Site } from '../../site/layout.ts';
import { FAVICON_LINK } from '../../site/brand.ts';
import { LOGO_SVG } from '../../site/logo.gen.ts';
import { AREAS, backdropRings, CELLS, centreLatLng, ringLatLng, SPOT_ID, type SimState } from './demo-map.ts';
import { GLOBE_JS_PATH } from '../globe/globe.ts';

export const SIMULATE_PATH = '/app/simulate';
export const SIMULATE_JS_PATH = '/simulate.js';
export const SIM_BANNER_TEXT = 'Simulation';
export const SIM_SENTENCE = 'This is the Outage Android app running in your browser. Every phone, area and number on it is simulated.';
const TTL_SECONDS = 3600;

/** The words the phone uses for each state (strings.xml map_desc_*). */
export const STATE_WORDS: Record<SimState, string> = {
  NORMAL: 'Power is on',
  POSSIBLE: 'Power may be out',
  CONFIRMED: 'Power is out',
  RESTORED: 'Power is back',
  NO_DATA: 'Not enough phones here yet',
};

const NAV = [
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const;
export const NAV_ORDER = NAV.map((n) => n.label);

/** The simulated city for the globe: every block with its corners in latitude and longitude, and the area labels. */
const GLOBE_CELLS = CELLS.map((c) => ({ id: c.id, area: c.area, state: c.state, ring: ringLatLng(c.q, c.r) }));
const GLOBE_LABELS = AREAS.map((a) => {
  const c = CELLS.find((x) => x.id === a.centre);
  const [lat, lng] = c ? centreLatLng(c.q, c.r) : [0, 0];
  return { name: a.name, lat, lng, below: a.centre === SPOT_ID };
});
const SPOT_LL = (() => {
  const c = CELLS.find((x) => x.id === SPOT_ID);
  return c ? centreLatLng(c.q, c.r) : [6.5158, 3.3711];
})();

const navbar = (active: string): string =>
  `<nav class="navbar" aria-label="App">${NAV.map(
    (n) =>
      `<button type="button" data-tab="${n.id}"${n.id === active ? ' aria-current="page"' : ''}><span class="pill">${icon(n.icon)}</span><span>${n.label}</span></button>`,
  ).join('')}</nav>`;

/** The spot card at the top of the Home sheet, in its starting state. */
const spotCard = (): string =>
  '<div class="state-card" id="spotcard" data-state="NORMAL" aria-live="polite">' +
  '<div class="spot-head"><span class="title-s">Power at your spot · Yaba</span><span class="chip sim">Simulated</span></div>' +
  `<p class="big" id="spotword">${STATE_WORDS.NORMAL}</p><p class="sub body-m" id="spotsub">10 of 10 phones nearby are charging</p>` +
  '<ol class="track" id="track" aria-hidden="true"><li class="done"></li><li></li><li></li><li></li></ol>' +
  `<div class="meta"><span class="chip">${icon('bolt')}Band A · 20 h promised</span><span class="chip">${icon('alarm')}Light Alarm on</span><span class="chip">${icon('battery')}Watching</span></div></div>`;

/** The app screen. Static markup that reads without scripts; /globe.js and /simulate.js bring it to life. */
export function appScreen(): string {
  const sheet =
    '<section class="sheet" id="sheet" aria-label="Your spot and feed"><button type="button" class="grab" id="grab" aria-label="Show more"></button><div class="body" id="sheetbody">' +
    spotCard() +
    '<button type="button" class="btn lg block" id="go" disabled>Simulate a blackout</button>' +
    '<div class="why" id="why" hidden><h3>How sure is Outage?</h3><ul id="whylist"></ul></div>' +
    '<h3 class="title-s muted">Right now</h3><ul class="list mini-list" id="feed">' +
    feedRows() +
    '</ul>' +
    `<div class="card filled"><p class="title-s">Power today</p><p class="headline-s">18.5 h</p><p class="body-m muted">Band A promises at least 20 h a day.</p></div>` +
    '</div></section>';
  const home =
    '<div class="view map" data-view="home"><div class="mapwrap stars" id="mapwrap"><canvas id="globe" role="img" aria-label="A globe that turns, with the simulated Lagos areas coloured by power. The list in the sheet has the same information."></canvas></div>' +
    `<div class="search">${LOGO_SVG.replace('<svg ', '<svg class="logo" ')}<span class="q">Lagos · power map</span><span class="chip sim">Simulated</span></div>` +
    '<div class="legend-chip" aria-hidden="true"><span class="state-chip" data-state="CONFIRMED">Out</span><span class="state-chip" data-state="POSSIBLE">Maybe</span><span class="state-chip" data-state="NORMAL">On</span><span class="state-chip" data-state="RESTORED">Back</span></div>' +
    `<div class="mapctl" id="mapctl"><button type="button" class="fab" id="zin" aria-label="Zoom in">${icon('add')}</button><button type="button" class="fab" id="zout" aria-label="Zoom out">${icon('remove')}</button><button type="button" class="fab" id="recentre" aria-label="Back to my spot">${icon('myLocation')}</button></div>` +
    `${sheet}</div>`;
  const insights = '<div class="view" data-view="insights" hidden></div>';
  const settings = '<div class="view" data-view="settings" hidden></div>';
  return (
    '<div class="app intro" id="app">' +
    `<div class="statusbar" aria-hidden="true"><span>9:41</span><i></i></div>` +
    `${home}${insights}${settings}${navbar('home')}` +
    '<div class="snack" id="snack" role="status" aria-live="polite"></div>' +
    `<div class="notif" id="notif" role="alert" aria-hidden="true">${LOGO_SVG}<div><b id="notift"></b><span id="notifb"></span></div></div>` +
    '</div>'
  );
}

function feedRows(): string {
  return AREAS.map((a) => {
    const states = CELLS.filter((c) => c.area === a.slug).map((c) => c.state);
    const worst = (['CONFIRMED', 'POSSIBLE', 'RESTORED', 'NORMAL', 'NO_DATA'] as const).find((s) => states.includes(s)) ?? 'NO_DATA';
    return `<li><button type="button" class="li" data-area="${a.slug}"><span class="txt"><b>${e(a.name)}</b><span>${STATE_WORDS[worst]}</span></span><span class="state-chip" data-state="${worst}">${worst === 'NO_DATA' ? 'No data' : { NORMAL: 'On', POSSIBLE: 'Maybe', CONFIRMED: 'Out', RESTORED: 'Back' }[worst]}</span></button></li>`;
  }).join('');
}

export function renderSimulatePage(site: Site): Rendered {
  const apk = e(site.apkUrl ? (safeHref(site.apkUrl) ?? '/install') : '/install');
  const guide =
    '<aside class="guide"><span class="chip sim">' +
    `${icon('play')}Simulation</span><h1>Try Outage without an Android phone</h1><p class="body-l muted">${SIM_SENTENCE}</p>` +
    '<ol><li><span class="step-n">1</span><span>Answer the first-run question, as on a new phone. Choose <b>Use my location</b> and the globe flies down to your spot in Yaba.</span></li>' +
    '<li><span class="step-n">2</span><span>Press <b>Simulate a blackout</b>. Ten simulated phones in Yaba stop charging; watch the blocks go from on, to maybe, to out. Drag to turn the globe, pinch or scroll to zoom.</span></li>' +
    '<li><span class="step-n">3</span><span>Wait for power to come back. The Light Alarm rings, as it does on the phone at 3 a.m.</span></li>' +
    '<li><span class="step-n">4</span><span>Open <b>Insights</b> and <b>Settings</b> from the bar at the bottom.</span></li></ol>' +
    '<p class="body-m muted" id="prov">The blackout is a replay built by the same detection engine that runs on the server.</p>' +
    `<div class="cta"><a class="btn" href="${apk}">${icon('download')}Get the Android app</a><a class="btn outlined" href="/">About Outage</a></div>` +
    '<noscript><div class="card filled"><p>The simulation needs JavaScript. Without it you see the app as it looks after first run.</p></div></noscript></aside>';
  const body =
    `<div class="sim-banner" role="note">${icon('info')}${SIM_BANNER_TEXT} · simulated data, not live</div>` +
    `<main class="judge"><div class="phone"><div class="screen">${appScreen()}</div></div>${guide}</main>` +
    `<script src="${GLOBE_JS_PATH}" defer></script><script src="${SIMULATE_JS_PATH}" defer></script>`;
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    `<title>${SIM_BANNER_TEXT}: the Outage app in your browser</title>` +
    '<meta name="description" content="Try the Outage Android app in your browser. A simulated blackout shows how it confirms a power cut. Not live data.">' +
    `<link rel="canonical" href="${e(site.origin + SIMULATE_PATH)}">${FAVICON_LINK}` +
    `<link rel="stylesheet" href="/app.css"></head><body class="sim space">${body}</body></html>`;
  return html(page, TTL_SECONDS);
}

// Static script, never built from request data. Reads only the replay endpoint. No storage, no cookies, no tracking.
// Frame gaps are squeezed so the whole outage plays in about 20 seconds. The service worker (ADR 0016) keeps it offline.
const JS = `(function(){
var $=function(i){return document.getElementById(i);},Q=function(s,r){return (r||document).querySelector(s);},QA=function(s,r){return [].slice.call((r||document).querySelectorAll(s));};
var app=$('app');if(!app)return;
var WORDS={NORMAL:'Power is on',POSSIBLE:'Power may be out',CONFIRMED:'Power is out',RESTORED:'Power is back',NO_DATA:'Not enough phones here yet'};
var SHORT={NORMAL:'On',POSSIBLE:'Maybe',CONFIRMED:'Out',RESTORED:'Back',NO_DATA:'No data'};
var RANK={CONFIRMED:4,POSSIBLE:3,RESTORED:2,NORMAL:1,NO_DATA:0};
var NAMES={yaba:'Yaba',surulere:'Surulere',ikeja:'Ikeja',lekki:'Lekki'};
var SPOT='${SPOT_ID}';
var ICON=${JSON.stringify({ chev: icon('chevron'), place: icon('place'), alarm: icon('alarm'), bell: icon('notifications'), home: icon('phone'), snow: icon('freezer'), bolt: icon('bolt'), batt: icon('battery'), lang: icon('language'), info: icon('info'), del: icon('delete'), chart: icon('chart'), shield: icon('shield'), groups: icon('groups'), close: icon('remove'), logo: LOGO_SVG })};
function el(t,a,h){var x=document.createElement(t);if(a)for(var k in a)x.setAttribute(k,a[k]);if(h!==undefined)x.innerHTML=h;return x;}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
var snackT=0;function snack(t){var s=$('snack');s.textContent=t;s.classList.add('on');clearTimeout(snackT);snackT=setTimeout(function(){s.classList.remove('on');},3200);}
var notifT=0;function notify(t,b){$('notift').textContent=t;$('notifb').textContent=b;var n=$('notif');n.classList.add('on');n.setAttribute('aria-hidden','false');clearTimeout(notifT);notifT=setTimeout(function(){n.classList.remove('on');n.setAttribute('aria-hidden','true');},4200);}

/* ---- The globe ---- */
var wrap=$('mapwrap'),spotSet=true,SPOT_LL=${JSON.stringify(SPOT_LL)};
var G=OutageGlobe($('globe'),{lat:8,lng:6,spin:true,beaconLabel:'Lagos'});
var CELLS=${JSON.stringify(GLOBE_CELLS)},AREA={};CELLS.forEach(function(c){AREA[c.id]=c.area;});
insets();G.setCells(CELLS);G.backdrop(${JSON.stringify(backdropRings())});G.labels(${JSON.stringify(GLOBE_LABELS)});G.spot(SPOT);
function centreOf(id){var c=CELLS.filter(function(x){return x.id===id;})[0],la=0,ln=0;c.ring.forEach(function(p){la+=p[0];ln+=p[1];});return[la/6,ln/6];}
function insets(){var H=wrap.getBoundingClientRect().height;if(app.classList.contains('intro'))G.insets(0,H*0.5);else G.insets(72,peekPx||H*0.42);}
function home(ms){insets();G.flyTo(SPOT_LL[0],SPOT_LL[1],6.5,ms||1600);}
$('zin').onclick=function(){G.zoomBy(1.8);};$('zout').onclick=function(){G.zoomBy(1/1.8);};
$('recentre').onclick=function(){if(!spotSet){snack('Choose your spot first: tap Yaba on the map.');G.flyTo(SPOT_LL[0],SPOT_LL[1],9,1600);return;}home();};
G.on('tap',function(id){select(id);});G.on('beacon',function(){if(spotSet)home(2400);else G.flyTo(SPOT_LL[0],SPOT_LL[1],9,2400);});

/* ---- State of every cell ---- */
var state=G.states();
var START={};for(var k in state)START[k]=state[k];
function paint(){feed();}
function worst(area){var w='NO_DATA';for(var id in state){if(AREA[id]===area&&RANK[state[id]]>RANK[w])w=state[id];}return w;}
function feed(){QA('#feed button').forEach(function(b){var a=b.getAttribute('data-area'),w=worst(a);Q('.txt span',b).textContent=WORDS[w];var c=Q('.state-chip',b);c.setAttribute('data-state',w);c.textContent=SHORT[w];});}

/* ---- Sheet ---- */
var sheet=$('sheet'),body=$('sheetbody'),expanded=false,peekPx=0;
function layoutSheet(){var full=sheet.getBoundingClientRect().height,card=$('spotcard'),go=$('go');
var peek=(card?card.offsetHeight:160)+(go&&!go.hidden?go.offsetHeight+12:0)+60;peekPx=Math.min(full,peek);
sheet.style.transform=expanded?'none':'translateY('+Math.max(0,full-peekPx)+'px)';$('mapctl').style.bottom=(peekPx+12)+'px';insets();$('grab').setAttribute('aria-label',expanded?'Show less':'Show more');}
$('grab').onclick=function(){expanded=!expanded;layoutSheet();};
var sy=null;$('grab').addEventListener('pointerdown',function(ev){sy=ev.clientY;});
document.addEventListener('pointerup',function(ev){if(sy===null)return;var d=ev.clientY-sy;sy=null;if(Math.abs(d)>30){expanded=d<0;layoutSheet();}});
var selected=null,saved=null;
function select(id){if(!spotSet&&id===SPOT){land(true);return;}G.select(null);
if(!id||id===selected){selected=null;restoreSheet();return;}
selected=id;G.select(id);var a=AREA[id],s=state[id];
if(!saved)saved=body.innerHTML;
body.innerHTML='<div class="state-card" data-state="'+s+'"><div class="spot-head"><span class="title-s">'+esc(NAMES[a])+(id===SPOT?' · your spot':'')+'</span><span class="chip sim">Simulated</span></div><p class="big">'+WORDS[s]+'</p>'+
(s==='NO_DATA'?'<p class="sub body-m">Colours appear once 3 or more phones here agree.</p>':'<p class="sub body-m">3+ phones reporting here</p>')+'</div>'+
'<div class="card filled"><p class="title-s">Last 30 days</p><p class="body-m muted">'+(s==='NO_DATA'?'No history yet.':'2 outages, 5 h without power in total.')+'</p></div>'+
'<button type="button" class="btn block" id="follow">Follow this area</button><button type="button" class="btn text block" id="closesel">Back to your spot</button>';
$('follow').onclick=function(){this.textContent='Following this area';this.className='btn tonal block';snack('You will get a notification when '+NAMES[a]+' loses or gets back power.');};
$('closesel').onclick=function(){select(null);};
expanded=false;layoutSheet();var c=centreOf(id);G.flyTo(c[0],c[1],Math.min(G.view().km,4),700);}
function restoreSheet(){if(saved!==null){body.innerHTML=saved;saved=null;bindSheet();renderSpot(curSpot);}layoutSheet();}
function bindSheet(){QA('#feed button').forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-area'),best=null;for(var id in state){if(AREA[id]===a&&(!best||RANK[state[id]]>RANK[state[best]]))best=id;}select(best);};});
var go=$('go');if(go){go.onclick=start;go.disabled=!R||running;}feed();}

/* ---- The spot card ---- */
var curSpot={s:'NORMAL',sub:'10 of 10 phones nearby are charging',step:0};
function renderSpot(o){curSpot=o;var c=$('spotcard');if(!c)return;c.setAttribute('data-state',o.s);$('spotword').textContent=WORDS[o.s];$('spotsub').textContent=o.sub;
QA('#track li').forEach(function(li,i){li.classList.toggle('done',i<=o.step);});}

/* ---- Replay ---- */
var R=null,fr=[],first=0,phones=[],on={},timer=0,running=false;
function pct(p){return p<0.0001?'under 0.01%':(p*100).toFixed(p<0.01?2:1)+'%';}
function apply(f){f.events.forEach(function(e){if(e.type==='UNPLUG')on[e.alias]=false;else if(e.type==='REPLUG'||e.type==='ARMED')on[e.alias]=true;});}
function st(f){var s=f.cells[0]&&f.cells[0].state;return WORDS[s]?s:'NORMAL';}
function off(){var n=0;phones.forEach(function(p){if(!on[p.alias])n++;});return n;}
function setYaba(s){var ring=['sim-1,0','sim-0,1','sim--1,1','sim--1,0','sim-0,-1','sim-1,-1','sim--1,-1'];state[SPOT]=s;
var near=s==='POSSIBLE'?2:7;ring.forEach(function(id,i){state[id]=i<near?s:(s==='POSSIBLE'?'NORMAL':state[id]);});paint();}
function why(x){var w=$('why'),l=$('whylist');if(!w)return;l.innerHTML='';
[x.k+' of '+x.n+' watching phones stopped charging within '+Math.round(x.windowMs/1000)+' s.','Usual rate: '+(x.lambdaPerSec*3600).toFixed(1)+' unplugs an hour. Chance this is luck: '+pct(x.p)+'.'].concat(x.restore?['Power back: '+x.restore.replugs+' phones charging again, '+x.restore.quorum+' needed.']:[])
.forEach(function(t){l.appendChild(el('li',{},esc(t)));});w.hidden=false;}
var last='NORMAL';
function show(f){var s=st(f),o=off(),n=phones.length,sub,step;
if(s==='NORMAL'){sub=o===0?n+' of '+n+' phones nearby are charging':o+' of '+n+' phones stopped charging. Not enough to call it a cut.';step=0;}
else if(s==='POSSIBLE'){sub=o+' of '+n+' phones stopped charging within seconds. Checking.';step=1;}
else if(s==='CONFIRMED'){sub=o+' of '+n+' phones lost power together. Too many to be luck.';step=2;}
else{sub=(n-o)+' of '+n+' phones are charging again.';step=3;}
renderSpot({s:s,sub:sub,step:step});setYaba(s);if(f.explanation)why(f.explanation);
if(s!==last){if(s==='CONFIRMED')notify('Power cut in Yaba','Confirmed by phones at your spot. We will ring when it is back.');
if(s==='RESTORED')ring();if(s==='POSSIBLE')snack('Phones in Yaba stopped charging. Outage is checking.');}
last=s;layoutSheet();}
function gap(a,b){var g=b.tMs-a.tMs,m=st(a)==='POSSIBLE'?900:420;return g>5000?2600:Math.min(1100,Math.max(m,g));}
function run(i){if(i>=fr.length){running=false;var go=$('go');if(go){go.disabled=false;go.textContent='Simulate again';}return;}
apply(fr[i]);show(fr[i]);if(i+1>=fr.length){run(i+1);return;}timer=setTimeout(function(){run(i+1);},gap(fr[i],fr[i+1]));}
function reset(){on={};for(var i=0;i<first;i++)apply(fr[i]);for(var k in START)state[k]=START[k];last='NORMAL';var w=$('why');if(w)w.hidden=true;
renderSpot({s:'NORMAL',sub:phones.length+' of '+phones.length+' phones nearby are charging',step:0});paint();}
function start(){if(running||!R)return;select(null);running=true;var go=$('go');go.disabled=true;go.textContent='Simulating…';clearTimeout(timer);reset();expanded=false;layoutSheet();home(900);timer=setTimeout(function(){run(first);},1000);}
function ready(d){R=d;fr=d.frames;phones=d.phones;first=-1;
for(var i=0;i<fr.length;i++){var s=st(fr[i]);if(s==='POSSIBLE'||s==='CONFIRMED'){first=i;break;}}
if(first<0)return fail();while(first>0&&fr[first-1].events.some(function(e){return e.type==='UNPLUG';}))first--;
var p=$('prov');if(p)p.textContent=(d.recordedDevices||0)+(d.recordedDevices===1?' real device':' real devices')+' recorded this outage. '+(d.source==='RECORDED'?'This replays a recording, not live.':'The replay is built from a made-up test recording by the same detection engine the server runs. Not live.');
reset();var go=$('go');if(go)go.disabled=false;}
function fail(){var go=$('go');if(go){go.disabled=false;go.textContent='Try again';go.onclick=function(){location.reload();};}renderSpot({s:'NO_DATA',sub:"Can't load the simulation. Check your connection.",step:-1});}

/* ---- Light Alarm, as on the phone ---- */
function ring(){var a=el('div',{'class':'alarm',role:'alertdialog','aria-label':'Light Alarm'},'<div class="halo">'+ICON.logo+'</div><h2>Power is back</h2><p class="body-l">Power returned at your spot in Yaba.</p><p class="body-m">The phone rings like an alarm clock, even on silent.</p><button type="button" class="btn lg">Stop alarm</button>');
app.appendChild(a);Q('button',a).focus();Q('button',a).onclick=function(){a.remove();snack('Light Alarm stopped. Power has been back for 1 min.');};}

/* ---- Tabs ---- */
var views={};QA('.view',app).forEach(function(v){views[v.getAttribute('data-view')]=v;});
function tab(id){for(var k in views)views[k].hidden=k!==id;QA('.navbar button').forEach(function(b){if(b.getAttribute('data-tab')===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
if(id==='insights'&&!views.insights.innerHTML)insights();if(id==='settings'&&!views.settings.innerHTML)settings();if(id==='home')setTimeout(layoutSheet,0);}
QA('.navbar button').forEach(function(b){b.onclick=function(){tab(b.getAttribute('data-tab'));};});
function bar(t){return '<div class="appbar"><h1>'+t+'</h1><span class="chip sim">Simulated</span></div>';}
function insights(){var hrs=[19.5,14,20.5,9.5,17,22,16.5],days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],max=24,avg=hrs.reduce(function(a,b){return a+b;},0)/hrs.length,score=Math.round(avg/24*100),C=2*Math.PI*46;
var bars=hrs.map(function(h,i){return '<div class="b'+(h<20?' low':'')+'" title="'+days[i]+': '+h+' h"><i data-h="'+(h/max*100).toFixed(0)+'"></i><span>'+days[i]+'</span></div>';}).join('');
views.insights.innerHTML=bar('Insights')+'<div class="page"><p class="body-m muted">How your power behaves · last 7 days</p>'+
'<div class="card"><div class="ring"><svg viewBox="0 0 112 112" role="img" aria-label="Light Score '+score+' percent"><circle class="track-c" cx="56" cy="56" r="46"/><circle class="val-c" cx="56" cy="56" r="46" stroke-dasharray="'+(C*score/100).toFixed(1)+' '+C.toFixed(1)+'"/><text x="56" y="56">'+score+'%</text></svg><div><p class="title-m">Light Score</p><p class="body-m muted">Share of the week with power at your spot.</p></div></div></div>'+
'<div class="tiles"><div class="tile"><b>9</b><span>Outages</span></div><div class="tile"><b>'+(7*24-hrs.reduce(function(a,b){return a+b;},0)).toFixed(1)+' h</b><span>Without power</span></div><div class="tile"><b>'+avg.toFixed(1)+' h</b><span>Power per day</span></div><div class="tile"><b>6 h 10 min</b><span>Longest outage</span></div></div>'+
'<div class="card"><p class="title-m">Hours of power per day</p><div class="bars" id="bars"><div class="promise" id="prom"><span>20 h promise</span></div>'+bars+'</div></div>'+
'<div class="card"><p class="title-m">Supply promise check <span class="chip">Estimate</span></p><p class="body-m">Band A is promised at least 20 hours of power a day.</p><p class="body-m muted">5 days below the promise this week. Your average is '+(20-avg).toFixed(1)+' hours below it. An estimate from this phone\\'s own record, not an official measurement.</p></div>'+
'<div class="card"><p class="title-m">When power goes</p><p class="body-m muted">Power most often goes on weekday evenings, around 7 p.m.</p></div></div>';
var b=$('bars'),bh=b.clientHeight-22;QA('.b i',b).forEach(function(i){i.style.height=(bh*(+i.getAttribute('data-h'))/100)+'px';});$('prom').style.bottom=(22+bh*20/24)+'px';}
function settings(){function row(ic,t,s,extra){return '<li><button type="button" class="li" data-t="'+esc(t)+'"'+(extra||'')+'><span class="lead">'+ICON[ic]+'</span><span class="txt"><b>'+t+'</b>'+(s?'<span>'+s+'</span>':'')+'</span>'+(extra?'<span class="switch"></span>':ICON.chev.replace('class="ico"','class="ico muted"'))+'</button></li>';}
views.settings.innerHTML=bar('Settings')+'<div class="group-label">Your power</div><ul class="list">'+
row('place','Your spot','Yaba')+row('bolt','Tariff band','Band A · 20 h a day')+row('alarm','Light Alarm','Ring when power comes back',' role="switch" aria-checked="true"')+row('snow','Freezer Guard','Warn after 4 h without power')+row('home','Home Watch','Watch a spare phone at home')+
'</ul><div class="group-label">This phone</div><ul class="list">'+row('batt','Keep Outage running','Battery steps for your phone')+row('bell','Notifications','Allowed')+row('chart','Share anonymous diagnostics','Helps fix missed outages',' role="switch" aria-checked="false"')+row('lang','Language','English')+
'</ul><div class="group-label">About</div><ul class="list">'+row('shield','About and privacy','No account. Only a map cell, never your position.')+row('del','Delete my data','From this phone and the server')+'</ul><p class="body-s muted page">Outage 1.0 · simulated</p>';
QA('.li',views.settings).forEach(function(b){b.onclick=function(){if(b.hasAttribute('aria-checked')){var v=b.getAttribute('aria-checked')!=='true';b.setAttribute('aria-checked',String(v));snack(b.getAttribute('data-t')+(v?' on':' off')+'.');return;}
var t=b.getAttribute('data-t');snack(t==='Delete my data'?'Simulation: there is nothing to delete.':'On the phone this opens '+t+'.');};});}

/* ---- First run, as on a new phone ---- */
function welcome(){var w=el('div',{'class':'welcome',role:'dialog','aria-label':'Welcome'},
'<h2>Your charger is a power sensor</h2><p class="body-l">Outage notices when your phone stops charging because the power went out. It then tells you when the lights are back, even at night.</p>'+
'<div class="loc">'+ICON.place+'<div><p class="title-s">See power around you</p><p class="body-m">Your position is used once to pick your area on the map, then dropped. Only the area is saved. You can delete everything in Settings.</p></div></div>'+
'<div class="acts"><button type="button" class="btn lg block" id="useloc">Use my location</button><button type="button" class="btn text block" id="notnow">Not now</button></div>');
app.appendChild(w);
$('useloc').onclick=function(){var d=el('div',{'class':'scrim',role:'dialog','aria-label':'Location permission'},'<div class="card perm">'+ICON.place+'<p class="title-m">Allow Outage to access this device\\'s approximate location?</p><div class="stack"><button type="button" class="btn tonal block" data-a="1">While using the app</button><button type="button" class="btn tonal block" data-a="1">Only this time</button><button type="button" class="btn text block" data-a="0">Don\\'t allow</button></div></div>');
app.appendChild(d);
QA('button',d).forEach(function(b){b.onclick=function(){d.remove();w.remove();land(b.getAttribute('data-a')==='1');};});};
$('notnow').onclick=function(){w.remove();land(false);};}
function land(loc){spotSet=loc;app.classList.remove('intro');var c=$('spotcard');
if(!loc){G.spot(null);if(c){c.setAttribute('data-state','NO_DATA');Q('.title-s',c).textContent='Power at your spot';$('spotword').textContent='Choose your spot';$('spotsub').textContent='Tap a block in Yaba, or use Settings. Only the area is saved.';}
var go=$('go');if(go)go.hidden=true;layoutSheet();G.flyTo(SPOT_LL[0],SPOT_LL[1],9,2600);return;}
G.spot(SPOT);var go2=$('go');if(go2)go2.hidden=false;renderSpot(curSpot);if(c)Q('.title-s',c).textContent='Power at your spot · Yaba';
layoutSheet();home(2800);snack('Your spot is set to Yaba. Only the area is stored.');}

/* ---- Start ---- */
bindSheet();layoutSheet();window.addEventListener('resize',function(){layoutSheet();});
welcome();
fetch('/api/v1/public/judge/replay',{headers:{accept:'application/json'}}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(ready).catch(fail);
if('serviceWorker' in navigator){navigator.serviceWorker.register('/judge-sw.js').catch(function(){});}
})();`;

export const renderSimulateJs = (): Rendered => ({ status: 200, contentType: 'text/javascript; charset=utf-8', body: JS, ttlSeconds: TTL_SECONDS });
