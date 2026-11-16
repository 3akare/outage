// The Outage app in the browser (ADR 0053). Simulated data only: the city file (/demo-city.json) and the replay of one
// blackout built by the real detection engine (/api/v1/public/judge/replay). No storage, no cookies, no tracking.
// The map is MapLibre over OpenFreeMap (map.js); Insights are computed in data.js and drawn in charts.js.
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
const filter = new Set();

function padding() {
  if (wide()) return { left: $('panel').getBoundingClientRect().right + 24, top: 80, right: 24, bottom: 24 };
  return { left: 24, right: 24, top: 120, bottom: Math.max(80, window.innerHeight - $('panel').getBoundingClientRect().top + 16) };
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
function applyFilter() {
  const f = filter.size ? ['in', ['get', 'state'], ['literal', [...filter]]] : null;
  M.on('ready', () => {
    M.map.setFilter('cells-fill', f);
    M.map.setFilter('cells-line', f);
  });
}
QA('.chips .chip').forEach((b) => {
  b.onclick = () => {
    const s = b.getAttribute('data-filter');
    if (filter.has(s)) filter.delete(s);
    else filter.add(s);
    b.setAttribute('aria-pressed', String(filter.has(s)));
    applyFilter();
    if (current === null) renderHome();
  };
});

/* ---- State of the city ---- */
let state = M.states();
function setStates(next) {
  Object.assign(state, next);
  M.setStates(next);
  if (current === null) refreshHomeLive();
  else if (current) renderArea(current);
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
  const parts = [];
  if (n.CONFIRMED) parts.push(`${n.CONFIRMED} of ${total} blocks out`);
  if (n.POSSIBLE) parts.push(`${n.POSSIBLE} maybe`);
  if (n.RESTORED) parts.push(`${n.RESTORED} back`);
  if (!parts.length) parts.push(n.NO_DATA === total ? 'No data yet' : `On in ${n.NORMAL} of ${total} blocks`);
  return parts.join(' · ');
}

/* ---- Panel: home, an area, search ---- */
const panel = $('panel');
const body = $('panelbody');
let current = null; // null = home, or an area slug
let sheet = 'peek'; // phone only: peek | full
function layoutSheet() {
  if (wide()) {
    panel.style.transform = '';
    return;
  }
  const full = panel.getBoundingClientRect().height;
  const first = body.querySelector('[data-peek]');
  const peek = first ? Math.min(full, first.offsetTop + first.offsetHeight + 16) : 180;
  panel.style.transform = sheet === 'full' ? 'translateY(0)' : `translateY(${Math.max(0, full - peek)}px)`;
  $('mapctl').style.bottom = `${peek + 76}px`;
  $('grab').setAttribute('aria-label', sheet === 'full' ? 'Show less' : 'Show more');
}
$('grab').onclick = () => {
  sheet = sheet === 'full' ? 'peek' : 'full';
  layoutSheet();
};
let dragY = null;
$('grab').addEventListener('pointerdown', (ev) => {
  dragY = ev.clientY;
});
document.addEventListener('pointerup', (ev) => {
  if (dragY === null) return;
  const d = ev.clientY - dragY;
  dragY = null;
  if (Math.abs(d) > 30) {
    sheet = d < 0 ? 'full' : 'peek';
    layoutSheet();
  }
});

const track = (step) =>
  `<ol class="track" aria-hidden="true">${['On', 'Maybe', 'Out', 'Back'].map((t, i) => `<li class="${i <= step ? 'done' : ''}"><i></i>${t}</li>`).join('')}</ol>`;
let spotView = { s: 'NORMAL', sub: '', step: 0 };
function spotCard() {
  if (!spotSet) {
    return `<div class="card spot" data-peek data-state="NO_DATA"><p class="over">${ICON.place} Your spot</p><p class="big">Choose your spot</p><p class="sub">Tap your block on the map. Only the area is saved, never your position.</p><button type="button" class="btn primary" id="setspot">Use Yaba as my spot</button></div>`;
  }
  const a = AREAS[SPOT_AREA];
  return (
    `<div class="card spot" data-peek data-state="${spotView.s}" id="spotcard" aria-live="polite">` +
    `<p class="over">${ICON.place} Your spot in ${esc(a.name)}<span class="tag">Simulated</span></p>` +
    `<p class="big"><i class="dot" data-state="${spotView.s}"></i>${WORDS[spotView.s]}</p><p class="sub">${esc(spotView.sub)}</p>${track(spotView.step)}` +
    `<div class="metas"><span class="meta">${ICON.bolt}Band ${a.band} · ${city.bands[a.band]} h promised</span><span class="meta">${ICON.alarm}Light Alarm on</span></div>` +
    `<button type="button" class="btn primary" id="go"${R && !running ? '' : ' disabled'}>${running ? 'Simulating…' : 'Simulate a blackout'}</button></div>`
  );
}
function areaRows() {
  return city.areas
    .filter((a) => !filter.size || a.cells.some((c) => filter.has(state[c])))
    .map((a) => {
      const w = worst(a.slug);
      return `<li><button type="button" class="row" data-area="${a.slug}"><i class="dot" data-state="${w}"></i><span class="txt"><b>${esc(a.name)}${a.slug === SPOT_AREA && spotSet ? ' <small>Your spot</small>' : ''}</b><span>${WORDS[w]} · ${esc(areaLine(a.slug))}</span></span><span class="st" data-state="${w}">${SHORT[w]}</span></button></li>`;
    })
    .join('');
}
let whyLines = null;
function renderHome() {
  current = null;
  M.select(null);
  const s = summary(city, AREAS[SPOT_AREA], TODAY, 7);
  const week = dailyHours(city, AREAS[SPOT_AREA], TODAY, 7);
  body.innerHTML =
    spotCard() +
    `<div class="why card flat" id="why"${whyLines ? '' : ' hidden'}><p class="h">How sure is Outage?</p><ul id="whylist">${(whyLines ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` +
    (spotSet
      ? `<div class="card flat"><div class="row-head"><p class="h">Power at your spot this week</p><button type="button" class="link" data-goto="insights">Insights ${ICON.chevron}</button></div>` +
        `<p class="kpi"><b>${s.avgHours} h</b> a day on average · ${s.daysBelow} of 7 days below the promise</p><div class="mini" data-mini="${SPOT_AREA}"></div></div>`
      : '') +
    `<h2 class="sec">Areas${filter.size ? ' matching the filter' : ''}</h2><ul class="rows" id="arealist">${areaRows() || '<li class="empty">No area has blocks in that state right now.</li>'}</ul>` +
    '<p class="foot">Simulated city: real neighbourhoods at their real places, made-up power. Map © OpenStreetMap contributors, OpenFreeMap.</p>';
  drawMini(week);
  bindPanel();
  layoutSheet();
}
function refreshHomeLive() {
  const card = $('spotcard');
  if (card) card.outerHTML = spotCard();
  const list = $('arealist');
  if (list) list.innerHTML = areaRows();
  bindPanel();
  layoutSheet();
}
function drawMini(week) {
  for (const el of QA('[data-mini]', body)) {
    const a = AREAS[el.getAttribute('data-mini')];
    el.innerHTML = miniBars(week ?? dailyHours(city, a, TODAY, 7), city.bands[a.band], el.clientWidth || 300);
  }
}
function bindPanel() {
  for (const b of QA('[data-area]', body)) b.onclick = () => openArea(b.getAttribute('data-area'));
  for (const b of QA('[data-goto]', body)) b.onclick = () => tab(b.getAttribute('data-goto'));
  const go = $('go');
  if (go) go.onclick = start;
  const set = $('setspot');
  if (set) set.onclick = () => land(true);
  const back = $('back');
  if (back) back.onclick = () => renderHome();
  const follow = $('follow');
  if (follow)
    follow.onclick = () => {
      const on = follow.getAttribute('aria-pressed') !== 'true';
      followed[current] = on;
      follow.setAttribute('aria-pressed', String(on));
      follow.innerHTML = on ? `${ICON.check}Following` : `${ICON.notifications}Follow`;
      toast(on ? `You will get a notification when ${AREAS[current].name} loses or gets back power.` : 'Not following any more.');
    };
}
const followed = {};
function openArea(slug, fly = true) {
  current = slug;
  renderArea(slug);
  sheet = 'peek';
  layoutSheet();
  const a = AREAS[slug];
  if (fly) flyTo([a.lng, a.lat], 13.2, 1200);
}
function renderArea(slug) {
  const a = AREAS[slug];
  const w = worst(slug);
  const n = areaCounts(slug);
  const s30 = summary(city, a, TODAY, 30);
  body.innerHTML =
    `<div class="area-head" data-peek><button type="button" class="icon-btn" id="back" aria-label="Back">${ICON.arrow}</button><div><h2>${esc(a.name)}</h2><p class="sub"><i class="dot" data-state="${w}"></i>${WORDS[w]} · ${esc(areaLine(slug))}</p></div></div>` +
    `<div class="split4">${['CONFIRMED', 'POSSIBLE', 'RESTORED', 'NORMAL'].map((k) => `<div class="cnt" data-state="${k}"><b>${n[k]}</b><span>${SHORT[k]}</span></div>`).join('')}</div>` +
    `<div class="btns"><button type="button" class="btn tonal" id="follow" aria-pressed="${followed[slug] ? 'true' : 'false'}">${followed[slug] ? `${ICON.check}Following` : `${ICON.notifications}Follow`}</button>` +
    `<button type="button" class="btn outline" data-goto="insights" data-insights="${slug}">${ICON.chart}Insights</button></div>` +
    `<div class="card flat"><p class="h">Hours of power, last 7 days</p><div class="mini" data-mini="${slug}"></div></div>` +
    `<div class="card flat"><p class="h">Last 30 days</p><dl class="facts"><div><dt>Power a day</dt><dd>${s30.avgHours} h</dd></div><div><dt>Band ${a.band} promise</dt><dd>${s30.promise} h</dd></div>` +
    `<div><dt>Outages</dt><dd>${s30.outages}</dd></div><div><dt>Typical wait for power</dt><dd>${duration(s30.medianMinutes)}</dd></div><div><dt>Longest outage</dt><dd>${duration(s30.longestMinutes)}</dd></div><div><dt>Days below promise</dt><dd>${s30.daysBelow} of 30</dd></div></dl></div>` +
    `<p class="foot">Colours show once 3 or more phones in a block agree. The band is made up for the simulation.</p>`;
  drawMini();
  for (const b of QA('[data-insights]', body)) b.addEventListener('click', () => setInsightsArea(b.getAttribute('data-insights')));
  bindPanel();
  layoutSheet();
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
    ? hits.map((a, i) => `<li role="option" id="sg${i}" data-area="${a.slug}"><i class="dot" data-state="${worst(a.slug)}"></i><b>${esc(a.name)}</b><span>${WORDS[worst(a.slug)]}</span></li>`).join('')
    : `<li class="none">No area called “${esc(q.value.trim())}” in the simulated city.</li>`;
  sug.hidden = false;
  q.setAttribute('aria-expanded', 'true');
  for (const li of QA('[data-area]', sug)) li.onmousedown = (ev) => {
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
  if (app.dataset.tab !== 'home') tab('home');
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
  renderHome();
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
  if (s === 'NORMAL') spotView = { s, step: 0, sub: o === 0 ? `${n} of ${n} phones nearby are charging` : `${o} of ${n} phones stopped charging. Not enough to call it a cut.` };
  else if (s === 'POSSIBLE') spotView = { s, step: 1, sub: `${o} of ${n} phones stopped charging within seconds. Checking.` };
  else if (s === 'CONFIRMED') spotView = { s, step: 2, sub: `${o} of ${n} phones lost power together. Too many to be luck.` };
  else spotView = { s, step: 3, sub: `${n - o} of ${n} phones are charging again.` };
  if (f.explanation) why(f.explanation);
  setSpotArea(s);
  if (s !== last) {
    if (s === 'POSSIBLE') toast('Phones in Yaba stopped charging. Outage is checking.');
    if (s === 'CONFIRMED') notify('Power cut in Yaba', 'Confirmed by phones at your spot. We will ring when it is back.');
    if (s === 'RESTORED') ring();
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
    if (current === null) refreshHomeLive();
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
  spotView = { s: 'NORMAL', step: 0, sub: `${phones.length} of ${phones.length} phones nearby are charging` };
  state = { ...START };
  M.setStates(START);
}
function start() {
  if (running || !R) return;
  running = true;
  clearTimeout(timer);
  reset();
  renderHome();
  sheet = 'peek';
  layoutSheet();
  flyTo(SPOT_LL, 14.2, 900);
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
  if (current === null) refreshHomeLive();
}
function fail() {
  R = null;
  spotView = { s: 'NO_DATA', step: -1, sub: "Can't load the simulation. Check your connection and reload." };
  if (current === null) refreshHomeLive();
}

/* ---- Light Alarm, as on the phone ---- */
function ring() {
  const a = document.createElement('div');
  a.className = 'alarm';
  a.setAttribute('role', 'alertdialog');
  a.setAttribute('aria-label', 'Light Alarm');
  a.innerHTML = `<div class="alarm-card"><div class="halo">${ICON.alarm}</div><h2>Power is back</h2><p>Power returned at your spot in Yaba.</p><p class="sub">On the phone this rings like an alarm clock, even on silent.</p><button type="button" class="btn primary">Stop alarm</button></div>`;
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
  $('insights').hidden = id !== 'insights';
  $('settings').hidden = id !== 'settings';
  if (id === 'insights') renderInsights();
  if (id === 'settings' && !$('settings').innerHTML) renderSettings();
  if (id === 'home') {
    M.map.resize();
    layoutSheet();
  }
}
for (const b of QA('.rail button')) b.onclick = () => tab(b.getAttribute('data-tab'));

/* ---- Insights ---- */
let insightsArea = SPOT_AREA;
let rankDays = 7;
function setInsightsArea(slug) {
  insightsArea = slug;
}
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
    '<div class="page-in">' +
    `<header class="page-head"><div><h1>Insights</h1><p class="sub">Last 30 days, to ${fmtLong(yesterday)} · <span class="tag">Simulated</span></p></div>` +
    `<label class="select"><span class="visually-hidden">Area</span>${ICON.place}<select id="iarea">${opts}</select></label></header>` +
    '<div class="tiles">' +
    tile(`${s.avgHours} h`, 'Power a day', `Band ${s.band} promises ${s.promise} h`, s.avgHours < s.promise ? 'below' : 'met') +
    tile(`${s.daysBelow} of ${s.days}`, 'Days below the promise', s.daysBelow ? `${Math.round((s.daysBelow / s.days) * 100)}% of days` : 'Every day met it') +
    tile(`${s.outages}`, 'Outages', `${s.offHours} h without power`) +
    tile(duration(s.medianMinutes), 'Typical wait for power', 'Half of outages end sooner') +
    tile(duration(s.longestMinutes), 'Longest outage', '') +
    '</div>' +
    `<section class="card"><div class="card-head"><h2>Hours of power each day</h2><p class="sub">${s.daysBelow} of ${s.days} days below Band ${s.band}'s ${s.promise} h</p></div>` +
    `<div class="legend-inline"><span><i class="sw blue"></i>Met the promise</span><span><i class="sw amber"></i>Below the promise</span><span><i class="sw dash"></i>Band ${s.band} promise</span></div>` +
    '<div class="plot" data-chart="daily"></div>' +
    `<details><summary>Show as a table</summary><table><thead><tr><th>Day</th><th>Hours of power</th></tr></thead><tbody>${days
      .slice()
      .reverse()
      .map((d) => `<tr><td>${fmtLong(d.date)}</td><td>${d.hours} h</td></tr>`)
      .join('')}</tbody></table></details></section>` +
    `<section class="card"><div class="card-head"><h2>When the power goes</h2><p class="sub">Most often off ${hourLabel(peak.from)} to ${hourLabel(peak.to)}: on ${Math.round(peak.share * 100)}% of days. Last 4 weeks.</p></div>` +
    `<div class="plot" data-chart="heat"></div>${heatLegend()}</section>` +
    '<div class="two">' +
    `<section class="card"><div class="card-head row"><div><h2>Areas compared</h2><p class="sub">Hours of power a day, the black tick is each area's promise</p></div>` +
    `<div class="seg" role="group" aria-label="Period"><button type="button" data-days="7" aria-pressed="${rankDays === 7}">7 days</button><button type="button" data-days="30" aria-pressed="${rankDays === 30}">30 days</button></div></div>` +
    '<div class="plot" data-chart="rank"></div></section>' +
    `<section class="card"><div class="card-head"><h2>Hours without power each week</h2><p class="sub">${change === 0 ? 'Same as the week before' : `${Math.abs(change)}% ${change < 0 ? 'less' : 'more'} than the week before`}</p></div>` +
    '<div class="plot" data-chart="weekly"></div></section>' +
    '</div>' +
    `<section class="card"><div class="card-head"><h2>Outage history</h2><p class="sub">${cuts.length} outages in ${esc(a.name)} in the last 30 days, newest first</p></div>` +
    `<table class="log"><thead><tr><th>Day</th><th>Went off</th><th>Came back</th><th>Length</th></tr></thead><tbody>${cuts
      .map((c, i) => {
        const end = new Date(c.start.getTime() + c.minutes * 60000);
        const t = (d) => d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
        return `<tr${i >= 8 ? ' class="more" hidden' : ''}><td>${fmtLong(c.start)}</td><td>${t(c.start)}</td><td>${t(end)}${end.getDate() !== c.start.getDate() ? ' next day' : ''}</td><td><span class="len${c.minutes === s.longestMinutes ? ' longest' : ''}">${duration(c.minutes)}</span></td></tr>`;
      })
      .join('')}</tbody></table>` +
    (cuts.length > 8 ? `<button type="button" class="btn outline" id="moreLog">Show all ${cuts.length}</button>` : '') +
    '</section>' +
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
let redrawInsights = null;
const tile = (value, label, sub, tone = '') =>
  `<div class="tile"${tone ? ` data-tone="${tone}"` : ''}><b>${esc(value)}</b><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
bindTips($('insights'), $('tip'));
bindTips(panel, $('tip'));

/* ---- Settings ---- */
function renderSettings() {
  const a = AREAS[SPOT_AREA];
  const row = (ic, t, s, sw) =>
    `<li><button type="button" class="row" data-t="${esc(t)}"${sw === undefined ? '' : ` role="switch" aria-checked="${sw}"`}><span class="lead">${ICON[ic]}</span><span class="txt"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</span>${sw === undefined ? ICON.chevron : '<span class="switch"></span>'}</button></li>`;
  $('settings').innerHTML =
    '<div class="page-in narrow"><header class="page-head"><div><h1>Settings</h1><p class="sub"><span class="tag">Simulated</span></p></div></header>' +
    `<h2 class="sec">Your power</h2><ul class="rows card">${row('place', 'Your spot', spotSet ? a.name : 'Not set')}${row('bolt', 'Tariff band', `Band ${a.band}, ${city.bands[a.band]} hours a day`)}${row('alarm', 'Light Alarm', 'Ring when power comes back', true)}${row('freezer', 'Freezer Guard', 'Warn after 4 h without power', true)}${row('phone', 'Home Watch', 'Watch a spare phone at home')}</ul>` +
    `<h2 class="sec">This phone</h2><ul class="rows card">${row('battery', 'Keep Outage running', 'Battery steps for your phone')}${row('notifications', 'Notifications', 'Allowed')}${row('chart', 'Share anonymous diagnostics', 'Helps fix missed outages', false)}${row('language', 'Language', 'English')}</ul>` +
    `<h2 class="sec">About</h2><ul class="rows card">${row('shield', 'About and privacy', 'No account. Only a map cell, never your position.')}${row('delete', 'Delete my data', 'From this phone and the server')}</ul>` +
    '<p class="foot">Outage 1.0, simulated. Map data © OpenStreetMap contributors, tiles by OpenFreeMap.</p></div>';
  for (const b of QA('.row', $('settings')))
    b.onclick = () => {
      const t = b.getAttribute('data-t');
      if (b.hasAttribute('aria-checked')) {
        const v = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(v));
        toast(`${t} ${v ? 'on' : 'off'}.`);
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
    `<div class="wm">${ICON.logo}</div><h2 id="wt">See the power around you</h2>` +
    '<p>Outage notices when your phone stops charging because the power went out, checks with phones nearby, and tells you when the lights are back.</p>' +
    `<div class="note">${ICON.place}<p>Your position is used once to pick your block on the map, then dropped. Only the block is saved.</p></div>` +
    '<div class="acts"><button type="button" class="btn primary" id="useloc">Use my location</button><button type="button" class="btn text" id="notnow">Not now</button></div></div>';
  app.appendChild(w);
  $('useloc').focus();
  $('useloc').onclick = () => {
    w.innerHTML =
      '<div class="dialog perm" role="dialog" aria-modal="true" aria-labelledby="pt">' +
      `${ICON.place}<p id="pt" class="h">Allow Outage to access this device’s approximate location?</p>` +
      '<div class="stack"><button type="button" class="btn tonal" data-a="1">While using the app</button><button type="button" class="btn tonal" data-a="1">Only this time</button><button type="button" class="btn tonal" data-a="0">Don’t allow</button></div>' +
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
    renderHome();
    flyTo(SPOT_LL, 14, 3200);
    toast('Your spot is set to Yaba. Only the block is stored.');
  } else {
    M.setSpot(null);
    renderHome();
    flyTo(LAGOS, 10.4, 3000);
  }
  if ($('settings').innerHTML) renderSettings();
}

/* ---- Start ---- */
renderHome();
app.classList.add('intro');
welcome();
let rz = 0;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    layoutSheet();
    if (app.dataset.tab === 'insights' && redrawInsights) redrawInsights();
    if (app.dataset.tab === 'home') drawMini();
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
