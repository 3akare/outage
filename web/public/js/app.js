// The Outage app in the browser (ADR 0054). Simulated data only: the city file (/demo-city.json) and the replay of one
// blackout built by the real detection engine (/api/v1/public/judge/replay). No storage, no cookies, no tracking.
// Four tabs as on the phone: Now (one giant answer for your spot), Map (MapLibre over OpenFreeMap, map.js), Insights
// (computed in data.js, drawn in charts.js) and Settings.
import { bindTips, dailyBars, fmtLong, heatLegend, heatmap, miniBars, ranked, weeklyLine } from './charts.js';
import { dailyHours, duration, heat, hourLabel, outagesIn, ranking, summary, weekly, worstHours } from './data.js';
import { cellCentre, createMap, LAGOS } from './map.js';

const $ = (id) => document.getElementById(id);
const QA = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ICON = JSON.parse($('icons')?.textContent ?? '{}');

const WORDS = {
  NORMAL: 'Power is on',
  POSSIBLE: 'Power may be out',
  CONFIRMED: 'Power is out',
  RESTORED: 'Power is back',
  NO_DATA: 'Not enough phones here yet',
};
const SHORT = { NORMAL: 'On', POSSIBLE: 'Maybe', CONFIRMED: 'Out', RESTORED: 'Back', NO_DATA: 'No data' };
const RANK = { CONFIRMED: 4, POSSIBLE: 3, RESTORED: 2, NORMAL: 1, NO_DATA: 0 };
const TODAY = new Date();
const app = $('app');
const wide = () => window.matchMedia('(min-width: 900px)').matches;

let toastT = 0;
function toast(t) {
  const s = $('toast');
  s.textContent = t;
  s.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => s.classList.remove('on'), 3600);
}
let notifT = 0;
function notify(t, b) {
  $('notift').textContent = t;
  $('notifb').textContent = b;
  const n = $('notif');
  n.classList.add('on');
  n.setAttribute('aria-hidden', 'false');
  clearTimeout(notifT);
  notifT = setTimeout(() => {
    n.classList.remove('on');
    n.setAttribute('aria-hidden', 'true');
  }, 5000);
}

const city = await fetch('/demo-city.json').then((r) => r.json());
const AREA_OF = Object.fromEntries(city.cells.map((c) => [c.id, c.area]));
const AREAS = Object.fromEntries(city.areas.map((a) => [a.slug, a]));
const CELL = Object.fromEntries(city.cells.map((c) => [c.id, c]));
const SPOT = city.spot;
const SPOT_AREA = AREA_OF[SPOT];
const SPOT_LL = cellCentre(CELL[SPOT]);

/* ---- Map ---- */
const M = createMap($('map'), city, { center: [8, 12], zoom: 1.6 });
let spotSet = false;

function padding() {
  const sheet = $('sheet');
  const open = !sheet.hidden;
  if (wide()) return { left: open && app.dataset.tab === 'map' ? 440 : 40, top: 90, right: 40, bottom: 40 };
  return { left: 32, right: 32, top: 90, bottom: open ? Math.min(window.innerHeight * 0.55, sheet.getBoundingClientRect().height) + 24 : 80 };
}
const flyTo = (ll, zoom, ms = 1800) => M.flyTo(ll, zoom, ms, padding());
$('zin').onclick = () => M.map.zoomIn();
$('zout').onclick = () => M.map.zoomOut();
$('myloc').onclick = () => {
  if (!spotSet) {
    toast('Choose your spot first: tap a block in Yaba.');
    flyTo(cellCentre(CELL[AREAS[SPOT_AREA].centre]), 13);
    return;
  }
  flyTo(SPOT_LL, 14);
};

/* ---- State of the city ---- */
let state = M.states();
function setStates(next) {
  Object.assign(state, next);
  M.setStates(next);
  refreshNowLive();
  if (current) renderArea(current);
}
function areaCounts(slug) {
  const n = { NORMAL: 0, POSSIBLE: 0, CONFIRMED: 0, RESTORED: 0, NO_DATA: 0 };
  for (const c of AREAS[slug].cells) n[state[c]] += 1;
  return n;
}
function worst(slug) {
  let w = 'NO_DATA';
  for (const c of AREAS[slug].cells) if (RANK[state[c]] > RANK[w]) w = state[c];
  return w;
}
function areaLine(slug) {
  const n = areaCounts(slug);
  const total = AREAS[slug].cells.length;
  if (n.CONFIRMED) return `${n.CONFIRMED} of ${total} blocks out`;
  if (n.POSSIBLE) return `${n.POSSIBLE} of ${total} blocks may be out`;
  if (n.RESTORED) return `Back in ${n.RESTORED} of ${total} blocks`;
  return n.NO_DATA === total ? 'No data yet' : `On in ${n.NORMAL} of ${total} blocks`;
}

/* ---- Now: the one answer for your spot ---- */
const nowBody = $('nowbody');
const track = (step) =>
  `<ol class="track" aria-hidden="true">${['On', 'Maybe', 'Out', 'Back'].map((t, i) => `<li class="${i <= step ? 'done' : ''}">${t}</li>`).join('')}</ol>`;
let spotView = { s: 'NORMAL', sub: '', step: 0, since: null };
let simNow = null; // the replay's clock, in ms
function forLine() {
  if (spotView.since === null || simNow === null) return spotView.s === 'NO_DATA' ? 'Waiting for the simulation' : 'Right now';
  const min = Math.round((simNow - spotView.since) / 60000);
  return min < 1 ? 'Just now' : `For ${duration(min)}`;
}
function spotCard() {
  if (!spotSet) {
    return (
      '<div class="status unset" id="spotcard" data-state="NO_DATA"><div class="status-top">' +
      `<span class="glyph">${ICON.place}</span><p class="status-word">Choose your spot</p></div>` +
      '<div class="status-body"><p class="sub">Outage watches one block for you. Only the block is saved, never your position.</p>' +
      '<button type="button" class="btn primary lg block" id="setspot">Use Yaba as my spot</button></div></div>'
    );
  }
  return (
    `<div class="status" id="spotcard" data-state="${spotView.s}" aria-live="polite"><div class="status-top">` +
    `<span class="glyph">${ICON.logo}</span><p class="status-word">${WORDS[spotView.s]}</p><p class="status-for">${esc(forLine())}</p></div>` +
    `<div class="status-body"><p class="sub">${esc(spotView.sub)}</p>${track(spotView.step)}` +
    `<button type="button" class="btn primary lg block" id="go"${R && !running ? '' : ' disabled'}>${running ? 'Simulating…' : 'Simulate a blackout'}</button></div></div>`
  );
}
function nearbyRows() {
  return city.areas
    .filter((a) => a.slug !== SPOT_AREA || !spotSet)
    .sort((a, b) => RANK[worst(b.slug)] - RANK[worst(a.slug)] || a.name.localeCompare(b.name))
    .map((a) => {
      const w = worst(a.slug);
      return `<li><button type="button" class="row" data-area="${a.slug}"><span class="txt"><b>${esc(a.name)}</b><span>${esc(areaLine(a.slug))}</span></span><span class="val word" data-state="${w}">${SHORT[w]}</span>${ICON.chevron}</button></li>`;
    })
    .join('');
}
let whyLines = null;
let alarmOn = true;
function renderNow() {
  const a = AREAS[SPOT_AREA];
  const s = summary(city, a, TODAY, 7);
  nowBody.innerHTML =
    `<header class="head"><div><p class="over">${spotSet ? 'Your spot' : 'Welcome'}</p><h1>${spotSet ? esc(a.name) : 'Outage'}</h1></div><span class="tag">Simulated</span></header>` +
    spotCard() +
    `<div class="card why" id="why"${whyLines ? '' : ' hidden'}><h2>How sure is Outage?</h2><ul id="whylist">${(whyLines ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` +
    (spotSet
      ? '<h2 class="sec">Your power</h2><ul class="group tiles">' +
        `<li><button type="button" class="row" id="alarmrow" role="switch" aria-checked="${alarmOn}"><span class="tile red">${ICON.alarm}</span><span class="txt"><b>Light Alarm</b><span>Rings when power comes back</span></span><span class="switch"></span></button></li>` +
        `<li><button type="button" class="row" data-goto="insights"><span class="tile orange">${ICON.bolt}</span><span class="txt"><b>Band ${a.band}</b><span>${s.avgHours} h a day this week, ${city.bands[a.band]} h promised</span></span>${ICON.chevron}</button></li>` +
        `<li class="weekbars"><div class="mini" data-mini="${SPOT_AREA}"></div></li></ul>`
      : '') +
    `<h2 class="sec">${spotSet ? 'Nearby' : 'Areas'}</h2><ul class="group" id="arealist">${nearbyRows()}</ul>` +
    `<ul class="group cards" id="maprow"><li><button type="button" class="row" data-goto="map"><span class="tile blue">${ICON.map}</span><span class="txt"><b>Open the map</b><span>Every block, coloured by power</span></span>${ICON.chevron}</button></li></ul>` +
    '<p class="foot">Simulated city: real neighbourhoods at their real places, made-up power. Map data from OpenStreetMap contributors, tiles by OpenFreeMap.</p>';
  drawMini();
  bindNow();
}
function refreshNowLive() {
  const card = $('spotcard');
  if (card) {
    card.outerHTML = spotCard();
    bindNow();
  }
  const list = $('arealist');
  if (list) {
    list.innerHTML = nearbyRows();
    bindNow();
  }
}
function drawMini() {
  for (const el of QA('[data-mini]')) {
    const a = AREAS[el.getAttribute('data-mini')];
    if (!el.clientWidth) continue;
    el.innerHTML = miniBars(dailyHours(city, a, TODAY, 7), city.bands[a.band], el.clientWidth);
  }
}
function bindNow() {
  for (const b of QA('[data-area]', nowBody)) b.onclick = () => openArea(b.getAttribute('data-area'));
  for (const b of QA('[data-goto]', nowBody)) b.onclick = () => tab(b.getAttribute('data-goto'));
  const go = $('go');
  if (go) go.onclick = start;
  const set = $('setspot');
  if (set) set.onclick = () => land(true);
  const al = $('alarmrow');
  if (al)
    al.onclick = () => {
      alarmOn = !alarmOn;
      al.setAttribute('aria-checked', String(alarmOn));
      toast(alarmOn ? 'Light Alarm on. It rings when power comes back.' : 'Light Alarm off.');
    };
}

/* ---- Map tab: an area's sheet ---- */
const sheet = $('sheet');
const sheetBody = $('sheetbody');
let current = null; // the open area's slug
const followed = {};
function openArea(slug, fly = true) {
  current = slug;
  if (app.dataset.tab !== 'map') tab('map');
  renderArea(slug);
  sheet.hidden = false;
  const a = AREAS[slug];
  if (fly) setTimeout(() => flyTo([a.lng, a.lat], 13.2, 1200), 60);
}
function closeArea() {
  current = null;
  sheet.hidden = true;
  M.select(null);
}
$('grab').onclick = closeArea;
function renderArea(slug) {
  const a = AREAS[slug];
  const w = worst(slug);
  const n = areaCounts(slug);
  const s30 = summary(city, a, TODAY, 30);
  sheetBody.innerHTML =
    `<div class="area-head"><div><h2>${esc(a.name)}</h2><p class="sub"><span class="word" data-state="${w}">${WORDS[w]}</span>, ${esc(areaLine(slug).toLowerCase())}</p></div>` +
    `<button type="button" class="icon-btn" id="close" aria-label="Close">${ICON.close}</button></div>` +
    `<div class="counts">${['CONFIRMED', 'POSSIBLE', 'RESTORED', 'NORMAL'].map((k) => `<div data-state="${k}"><b>${n[k]}</b><span>${SHORT[k]}</span></div>`).join('')}</div>` +
    `<div class="btns"><button type="button" class="btn" id="follow" aria-pressed="${followed[slug] ? 'true' : 'false'}">${followed[slug] ? `${ICON.check}Following` : `${ICON.notifications}Follow`}</button>` +
    `<button type="button" class="btn" id="toinsights">${ICON.chart}Insights</button></div>` +
    `<h2 class="sec">Last 7 days</h2><div class="card"><div class="mini" data-mini="${slug}"></div></div>` +
    '<h2 class="sec">Last 30 days</h2><ul class="group">' +
    `<li><div class="row"><span class="txt"><b>Power a day</b></span><span class="val num">${s30.avgHours} h</span></div></li>` +
    `<li><div class="row"><span class="txt"><b>Band ${a.band} promise</b></span><span class="val num">${s30.promise} h</span></div></li>` +
    `<li><div class="row"><span class="txt"><b>Outages</b></span><span class="val num">${s30.outages}</span></div></li>` +
    `<li><div class="row"><span class="txt"><b>Typical wait for power</b></span><span class="val num">${duration(s30.medianMinutes)}</span></div></li>` +
    `<li><div class="row"><span class="txt"><b>Longest outage</b></span><span class="val num">${duration(s30.longestMinutes)}</span></div></li></ul>` +
    '<p class="foot">Colours show once 3 or more phones in a block agree. The band is made up for the simulation.</p>';
  drawMini();
  $('close').onclick = closeArea;
  $('toinsights').onclick = () => {
    insightsArea = slug;
    tab('insights');
  };
  const follow = $('follow');
  follow.onclick = () => {
    const on = follow.getAttribute('aria-pressed') !== 'true';
    followed[slug] = on;
    follow.setAttribute('aria-pressed', String(on));
    follow.innerHTML = on ? `${ICON.check}Following` : `${ICON.notifications}Follow`;
    toast(on ? `You will hear when ${a.name} loses or gets back power.` : 'Not following any more.');
  };
}
M.on('cell', (id) => {
  if (!id) return;
  if (!spotSet && AREA_OF[id] === SPOT_AREA) {
    land(true);
    return;
  }
  M.select(id);
  if (current !== AREA_OF[id]) openArea(AREA_OF[id], false);
  M.select(id);
});

/* ---- Search ---- */
const q = $('q');
const sug = $('suggest');
function suggestions() {
  const t = q.value.trim().toLowerCase();
  $('clear').hidden = !t;
  if (!t) {
    sug.hidden = true;
    q.setAttribute('aria-expanded', 'false');
    return [];
  }
  const hits = city.areas.filter((a) => a.name.toLowerCase().includes(t) || a.slug.includes(t));
  sug.innerHTML = hits.length
    ? hits.map((a, i) => `<li role="option" id="sg${i}" data-area="${a.slug}"><b>${esc(a.name)}</b><span class="word" data-state="${worst(a.slug)}">${SHORT[worst(a.slug)]}</span></li>`).join('')
    : `<li class="none">No area called “${esc(q.value.trim())}” in the simulated city.</li>`;
  sug.hidden = false;
  q.setAttribute('aria-expanded', 'true');
  for (const li of QA('[data-area]', sug))
    li.onmousedown = (ev) => {
      ev.preventDefault();
      pick(li.getAttribute('data-area'));
    };
  return hits;
}
function pick(slug) {
  q.value = AREAS[slug].name;
  sug.hidden = true;
  $('clear').hidden = false;
  q.blur();
  openArea(slug);
}
q.addEventListener('input', suggestions);
q.addEventListener('focus', suggestions);
q.addEventListener('blur', () => setTimeout(() => (sug.hidden = true), 120));
$('searchform').onsubmit = (ev) => {
  ev.preventDefault();
  const hits = suggestions();
  if (hits.length) pick(hits[0].slug);
};
$('clear').onclick = () => {
  q.value = '';
  suggestions();
  closeArea();
  q.focus();
};

/* ---- Replay of one blackout at the spot ---- */
let R = null;
let frames = [];
let first = 0;
let phones = [];
let on = {};
let timer = 0;
let running = false;
let last = 'NORMAL';
const START = { ...state };
const pct = (p) => (p < 0.0001 ? 'under 0.01%' : `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`);
const stOf = (f) => (WORDS[f.cells[0]?.state] ? f.cells[0].state : 'NORMAL');
function applyEvents(f) {
  for (const ev of f.events) {
    if (ev.type === 'UNPLUG') on[ev.alias] = false;
    else if (ev.type === 'REPLUG' || ev.type === 'ARMED') on[ev.alias] = true;
  }
}
const offCount = () => phones.filter((p) => !on[p.alias]).length;
function setSpotArea(s) {
  const next = { [SPOT]: s };
  const near = s === 'POSSIBLE' ? 2 : city.spotNeighbours.length;
  city.spotNeighbours.forEach((id, i) => {
    next[id] = i < near ? s : s === 'POSSIBLE' ? 'NORMAL' : state[id];
  });
  setStates(next);
}
function why(x) {
  whyLines = [
    `${x.k} of ${x.n} watching phones stopped charging within ${Math.round(x.windowMs / 1000)} s.`,
    `Usual rate: ${(x.lambdaPerSec * 3600).toFixed(1)} unplugs an hour. Chance this is luck: ${pct(x.p)}.`,
    ...(x.restore ? [`Power back: ${x.restore.replugs} phones charging again, ${x.restore.quorum} needed.`] : []),
  ];
  const w = $('why');
  if (w) {
    w.hidden = false;
    $('whylist').innerHTML = whyLines.map((t) => `<li>${esc(t)}</li>`).join('');
  }
}
function show(f) {
  const s = stOf(f);
  const o = offCount();
  const n = phones.length;
  simNow = f.tMs;
  const since = s === spotView.s && spotView.since !== null ? spotView.since : f.tMs;
  if (s === 'NORMAL') spotView = { s, step: 0, since, sub: o === 0 ? `${n} of ${n} phones nearby are charging.` : `${o} of ${n} phones stopped charging. Not enough to call it a cut.` };
  else if (s === 'POSSIBLE') spotView = { s, step: 1, since, sub: `${o} of ${n} phones stopped charging within seconds. Checking.` };
  else if (s === 'CONFIRMED') spotView = { s, step: 2, since, sub: `${o} of ${n} phones lost power together. Too many to be luck.` };
  else spotView = { s, step: 3, since, sub: `${n - o} of ${n} phones are charging again.` };
  if (f.explanation) why(f.explanation);
  setSpotArea(s);
  if (s !== last) {
    if (s === 'POSSIBLE') toast('Phones in Yaba stopped charging. Outage is checking.');
    if (s === 'CONFIRMED') notify('Power cut in Yaba', 'Confirmed by phones at your spot. Outage will ring when it is back.');
    if (s === 'RESTORED' && alarmOn) ring();
  }
  last = s;
}
const gap = (a, b) => {
  const g = b.tMs - a.tMs;
  return g > 5000 ? 2600 : Math.min(1100, Math.max(stOf(a) === 'POSSIBLE' ? 900 : 420, g));
};
function run(i) {
  if (i >= frames.length) {
    running = false;
    refreshNowLive();
    const go = $('go');
    if (go) go.textContent = 'Simulate again';
    return;
  }
  applyEvents(frames[i]);
  show(frames[i]);
  if (i + 1 < frames.length) timer = setTimeout(() => run(i + 1), gap(frames[i], frames[i + 1]));
  else run(i + 1);
}
function reset() {
  on = {};
  for (let i = 0; i < first; i++) applyEvents(frames[i]);
  last = 'NORMAL';
  whyLines = null;
  simNow = null;
  spotView = { s: 'NORMAL', step: 0, since: null, sub: `${phones.length} of ${phones.length} phones nearby are charging.` };
  state = { ...START };
  M.setStates(START);
}
function start() {
  if (running || !R) return;
  running = true;
  clearTimeout(timer);
  reset();
  renderNow();
  if (wide()) flyTo(SPOT_LL, 14.2, 900);
  timer = setTimeout(() => run(first), 1000);
}
function ready(d) {
  R = d;
  frames = d.frames;
  phones = d.phones;
  first = frames.findIndex((f) => ['POSSIBLE', 'CONFIRMED'].includes(stOf(f)));
  if (first < 0) return fail();
  while (first > 0 && frames[first - 1].events.some((ev) => ev.type === 'UNPLUG')) first--;
  reset();
  refreshNowLive();
}
function fail() {
  R = null;
  spotView = { s: 'NO_DATA', step: -1, since: null, sub: "Can't load the simulation. Check your connection and reload." };
  refreshNowLive();
}

/* ---- Light Alarm, as on the phone ---- */
function ring() {
  const a = document.createElement('div');
  a.className = 'alarm';
  a.setAttribute('role', 'alertdialog');
  a.setAttribute('aria-label', 'Light Alarm');
  a.innerHTML = `<div class="alarm-card"><div class="halo">${ICON.alarm}</div><h2>Power is back</h2><p>Power returned at your spot in Yaba.</p><p class="sub">On the phone this rings like an alarm clock, even on silent.</p><button type="button" class="btn primary lg">Stop alarm</button></div>`;
  app.appendChild(a);
  const b = a.querySelector('button');
  b.focus();
  b.onclick = () => {
    a.remove();
    toast('Light Alarm stopped. Power has been back for 1 min.');
  };
}

/* ---- Tabs ---- */
function tab(id) {
  app.dataset.tab = id;
  for (const b of QA('.rail button')) {
    if (b.getAttribute('data-tab') === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  $('now').hidden = id !== 'now';
  $('insights').hidden = id !== 'insights';
  $('settings').hidden = id !== 'settings';
  if (id === 'insights') renderInsights();
  if (id === 'settings') renderSettings();
  if (id === 'now') drawMini();
  if (id === 'map' || (id === 'now' && wide())) requestAnimationFrame(() => M.map.resize());
}
for (const b of QA('.rail button')) b.onclick = () => tab(b.getAttribute('data-tab'));

/* ---- Insights ---- */
let insightsArea = SPOT_AREA;
let rankDays = 7;
let redrawInsights = null;
const tile = (value, label, sub, tone = '') =>
  `<div class="stat"${tone ? ` data-tone="${tone}"` : ''}><b>${esc(value)}</b><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
function renderInsights() {
  const page = $('insights');
  const a = AREAS[insightsArea];
  const s = summary(city, a, TODAY, 30);
  const days = dailyHours(city, a, TODAY, 30);
  const grid = heat(city, a, TODAY, 28);
  const peak = worstHours(grid);
  const weeks = weekly(city, a, TODAY, 5);
  const cuts = outagesIn(city, a, TODAY, 30);
  const prev = weeks[weeks.length - 2]?.offHours ?? 0;
  const lastW = weeks[weeks.length - 1].offHours;
  const change = prev ? Math.round(((lastW - prev) / prev) * 100) : 0;
  const yesterday = days[days.length - 1].date;
  const opts = city.areas.map((x) => `<option value="${x.slug}"${x.slug === insightsArea ? ' selected' : ''}>${esc(x.name)}${x.slug === SPOT_AREA && spotSet ? ' (your spot)' : ''}</option>`).join('');
  page.innerHTML =
    '<div class="screen-in wide">' +
    `<header class="head"><div><p class="over">Last 30 days, to ${fmtLong(yesterday)}</p><h1>Insights</h1></div><span class="tag">Simulated</span></header>` +
    `<div class="toolbar"><label class="select"><span class="visually-hidden">Area</span>${ICON.place}<select id="iarea">${opts}</select></label></div>` +
    '<div class="stats">' +
    tile(`${s.avgHours} h`, 'Power a day', `Band ${s.band} promises ${s.promise} h`, s.avgHours < s.promise ? 'below' : '') +
    tile(`${s.daysBelow} of ${s.days}`, 'Days below the promise', s.daysBelow ? `${Math.round((s.daysBelow / s.days) * 100)}% of days` : 'Every day met it') +
    tile(`${s.outages}`, 'Outages', `${s.offHours} h without power`) +
    tile(duration(s.medianMinutes), 'Typical wait', `Half end sooner. Longest ${duration(s.longestMinutes)}`) +
    '</div><div class="cards">' +
    `<section class="card"><h2>Hours of power each day</h2><p class="sub">${s.daysBelow} of ${s.days} days below Band ${s.band}'s ${s.promise} h</p>` +
    `<div class="legend-inline"><span><i class="sw met"></i>Met the promise</span><span><i class="sw below"></i>Below the promise</span><span><i class="sw dash"></i>Band ${s.band} promise</span></div>` +
    '<div class="plot" data-chart="daily"></div>' +
    `<details><summary>Show as a table</summary><table><thead><tr><th>Day</th><th>Hours of power</th></tr></thead><tbody>${days
      .slice()
      .reverse()
      .map((d) => `<tr><td>${fmtLong(d.date)}</td><td>${d.hours} h</td></tr>`)
      .join('')}</tbody></table></details></section>` +
    `<section class="card"><h2>When the power goes</h2><p class="sub">Most often off ${hourLabel(peak.from)} to ${hourLabel(peak.to)}, on ${Math.round(peak.share * 100)}% of days. Last 4 weeks.</p>` +
    `<div class="plot" data-chart="heat"></div>${heatLegend()}</section>` +
    '</div><div class="cards two">' +
    `<section class="card"><div class="toolbar"><div><h2>Areas compared</h2><p class="sub">Hours of power a day. The red tick is each area's promise.</p></div>` +
    `<div class="seg" role="group" aria-label="Period"><button type="button" data-days="7" aria-pressed="${rankDays === 7}">7 days</button><button type="button" data-days="30" aria-pressed="${rankDays === 30}">30 days</button></div></div>` +
    '<div class="plot" data-chart="rank"></div></section>' +
    `<section class="card"><h2>Hours without power each week</h2><p class="sub">${change === 0 ? 'Same as the week before' : `${Math.abs(change)}% ${change < 0 ? 'less' : 'more'} than the week before`}</p>` +
    '<div class="plot" data-chart="weekly"></div></section>' +
    '</div><div class="cards">' +
    `<section class="card"><h2>Outage history</h2><p class="sub">${cuts.length} outages in ${esc(a.name)} in the last 30 days, newest first</p>` +
    `<table class="log"><thead><tr><th>Day</th><th>Went off</th><th>Came back</th><th>Length</th></tr></thead><tbody>${cuts
      .map((c, i) => {
        const end = new Date(c.start.getTime() + c.minutes * 60000);
        const t = (d) => d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
        return `<tr${i >= 8 ? ' class="more" hidden' : ''}><td>${fmtLong(c.start)}</td><td>${t(c.start)}</td><td>${t(end)}${end.getDate() !== c.start.getDate() ? ' next day' : ''}</td><td><span class="len${c.minutes === s.longestMinutes ? ' longest' : ''}">${duration(c.minutes)}</span></td></tr>`;
      })
      .join('')}</tbody></table>` +
    (cuts.length > 8 ? `<button type="button" class="btn" id="moreLog">Show all ${cuts.length}</button>` : '') +
    '</section></div>' +
    '<p class="foot">Simulated history for a simulated city. Tariff bands are NERC’s minimum hours a day; the band of each area is made up. On the phone these numbers come from your own phone’s record.</p>' +
    '</div>';
  const draw = () => {
    const w = (k) => Math.max(260, page.querySelector(`[data-chart="${k}"]`).clientWidth);
    page.querySelector('[data-chart="daily"]').innerHTML = dailyBars(days, s.promise, s.band, w('daily'));
    page.querySelector('[data-chart="heat"]').innerHTML = heatmap(grid, w('heat'));
    page.querySelector('[data-chart="rank"]').innerHTML = ranked(ranking(city, TODAY, rankDays), insightsArea, w('rank'));
    page.querySelector('[data-chart="weekly"]').innerHTML = weeklyLine(weeks, w('weekly'));
  };
  draw();
  redrawInsights = draw;
  $('iarea').onchange = (ev) => {
    insightsArea = ev.target.value;
    renderInsights();
  };
  for (const b of QA('.seg button', page))
    b.onclick = () => {
      rankDays = Number(b.getAttribute('data-days'));
      for (const x of QA('.seg button', page)) x.setAttribute('aria-pressed', String(x === b));
      page.querySelector('[data-chart="rank"]').innerHTML = ranked(ranking(city, TODAY, rankDays), insightsArea, page.querySelector('[data-chart="rank"]').clientWidth);
    };
  const more = $('moreLog');
  if (more)
    more.onclick = () => {
      for (const r of QA('tr.more', page)) r.hidden = false;
      more.remove();
    };
}
bindTips($('insights'), $('tip'));
bindTips($('now'), $('tip'));
bindTips(sheet, $('tip'));

/* ---- Settings, as iOS-style grouped lists ---- */
const toggles = { 'Freezer Guard': true, 'Share anonymous diagnostics': false };
function renderSettings() {
  const a = AREAS[SPOT_AREA];
  const row = (ic, colour, t, s, sw) =>
    `<li><button type="button" class="row" data-t="${esc(t)}"${sw === undefined ? '' : ` role="switch" aria-checked="${sw}"`}><span class="tile ${colour}">${ICON[ic]}</span><span class="txt"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</span>${sw === undefined ? ICON.chevron : '<span class="switch"></span>'}</button></li>`;
  $('settings').innerHTML =
    '<div class="screen-in"><header class="head"><div><p class="over">Outage 1.0</p><h1>Settings</h1></div><span class="tag">Simulated</span></header>' +
    '<h2 class="sec">Your power</h2><ul class="group tiles">' +
    row('place', 'blue', 'Your spot', spotSet ? a.name : 'Not set') +
    row('bolt', 'orange', 'Tariff band', `Band ${a.band}, ${city.bands[a.band]} hours a day`) +
    row('alarm', 'red', 'Light Alarm', 'Ring when power comes back', alarmOn) +
    row('freezer', 'teal', 'Freezer Guard', 'Warn after 4 h without power', toggles['Freezer Guard']) +
    row('homeWatch', 'green', 'Home Watch', 'Watch a spare phone at home') +
    '</ul><h2 class="sec">This phone</h2><ul class="group tiles">' +
    row('battery', 'green', 'Keep Outage running', 'Battery steps for your phone') +
    row('notifications', 'red', 'Notifications', 'Allowed') +
    row('chart', 'indigo', 'Share anonymous diagnostics', 'Helps fix missed outages', toggles['Share anonymous diagnostics']) +
    row('language', 'blue', 'Language', 'English') +
    '</ul><h2 class="sec">About</h2><ul class="group tiles">' +
    row('play', 'pink', 'Replay a blackout', 'The simulation on the Now tab') +
    row('shield', 'grey', 'About and privacy', 'No account. Only a map cell, never your position.') +
    `</ul><ul class="group cards"><li><button type="button" class="row danger" data-t="Delete my data"><span class="txt"><b>Delete my data</b><span>From this phone and the server</span></span></button></li></ul>` +
    '<p class="foot">Outage 1.0, simulated. Map data from OpenStreetMap contributors, tiles by OpenFreeMap.</p></div>';
  for (const b of QA('.row', $('settings')))
    b.onclick = () => {
      const t = b.getAttribute('data-t');
      if (b.hasAttribute('aria-checked')) {
        const v = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(v));
        if (t === 'Light Alarm') alarmOn = v;
        else toggles[t] = v;
        toast(`${t} ${v ? 'on' : 'off'}.`);
        return;
      }
      if (t === 'Replay a blackout') {
        tab('now');
        start();
        return;
      }
      toast(t === 'Delete my data' ? 'Simulation: there is nothing to delete.' : `On the phone this opens ${t}.`);
    };
}

/* ---- First run, as on a new phone ---- */
function welcome() {
  const w = document.createElement('div');
  w.className = 'scrim';
  w.innerHTML =
    '<div class="dialog welcome" role="dialog" aria-modal="true" aria-labelledby="wt">' +
    `<div class="appicon">${ICON.logo}</div><h2 id="wt">See the power around you</h2>` +
    '<p>Outage notices when your phone stops charging because the power went out, checks with phones nearby, and tells you when the lights are back.</p>' +
    `<div class="note">${ICON.place}<p>Your position is used once to pick your block on the map, then dropped. Only the block is saved.</p></div>` +
    '<div class="acts"><button type="button" class="btn primary lg" id="useloc">Use my location</button><button type="button" class="btn text" id="notnow">Not now</button></div></div>';
  app.appendChild(w);
  $('useloc').focus();
  $('useloc').onclick = () => {
    w.innerHTML =
      '<div class="dialog perm" role="dialog" aria-modal="true" aria-labelledby="pt">' +
      `${ICON.place}<p id="pt" class="h">Allow Outage to use this device’s approximate location?</p>` +
      '<div class="acts"><button type="button" class="btn" data-a="1">While using the app</button><button type="button" class="btn" data-a="1">Only this time</button><button type="button" class="btn" data-a="0">Don’t allow</button></div>' +
      '<p class="sub">Simulation: your real location is never read.</p></div>';
    QA('button', w)[0].focus();
    for (const b of QA('button', w))
      b.onclick = () => {
        w.remove();
        land(b.getAttribute('data-a') === '1');
      };
  };
  $('notnow').onclick = () => {
    w.remove();
    land(false);
  };
}
function land(loc) {
  spotSet = loc;
  app.classList.remove('intro');
  if (loc) {
    M.setSpot(SPOT_LL);
    renderNow();
    flyTo(SPOT_LL, 14, 3200);
    toast('Your spot is set to Yaba. Only the block is stored.');
  } else {
    M.setSpot(null);
    renderNow();
    flyTo(LAGOS, 10.4, 3000);
  }
  if (app.dataset.tab === 'settings') renderSettings();
}

/* ---- Start ---- */
renderNow();
app.classList.add('intro');
welcome();
let rz = 0;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    if (app.dataset.tab === 'insights' && redrawInsights) redrawInsights();
    drawMini();
  }, 120);
});
fetch('/api/v1/public/judge/replay', { headers: { accept: 'application/json' } })
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })
  .then(ready)
  .catch(fail);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/judge-sw.js').catch(() => {});
