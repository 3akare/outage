// The Outage app in the browser (ADR 0054). Simulated data only: the city file (/demo-city.json) and the replay of one
// blackout built by the real detection engine (/api/v1/public/judge/replay). No storage, no cookies, no tracking.
// Three tabs as on the phone: Now (one giant answer for your spot), Map (MapLibre over OpenFreeMap, map.js) and Settings.
// The simulation runs on any place in Lagos: all 20 local governments, 376 wards and 4,968 blocks (places.js, ADR 0060).
import { duration } from './data.js';
import { cellCentre, createMap } from './map.js';
import { buildPlaces, targetBlocks } from './places.js';

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

const places = buildPlaces(await fetch('/lagos-sim.json').then((r) => r.json()));
const city = { cells: places.cells };
const AREA_OF = Object.fromEntries(city.cells.map((c) => [c.id, c.area]));
const AREAS = places.areas;
const CELL = places.byId;
// The place the blackout is simulated on (the rest of Lagos keeps its made-up colours): { slug, cell } and its blocks, the spot first. Null until one is chosen.
let target = null;
let blocks = [];
let SPOT = null;
let SPOT_LL = null;
const targetName = () => (target ? AREAS[target.slug].name : '');

/* ---- Map ---- */
const M = createMap($('map'), city, { fitPadding: 24 });
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
    toast('Choose a place first: pick one below, or tap any block on the map.');
    M.showLagos(1500, padding());
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
      `<span class="glyph">${ICON.place}</span><p class="status-word">Choose a place</p></div>` +
      '<div class="status-body"><p class="sub">Pick any local government, ward or block in Lagos below, or tap a block on the map. The blackout is simulated there.</p></div></div>'
    );
  }
  return (
    `<div class="status" id="spotcard" data-state="${spotView.s}" aria-live="polite"><div class="status-top">` +
    `<span class="glyph">${ICON.logo}</span><p class="status-word">${WORDS[spotView.s]}</p><p class="status-for">${esc(forLine())}</p></div>` +
    `<div class="status-body"><p class="sub">${esc(spotView.sub)}</p>${track(spotView.step)}` +
    `<button type="button" class="btn primary lg block" id="go"${R && !running ? '' : ' disabled'}>${running ? 'Simulating…' : 'Simulate a blackout'}</button></div></div>`
  );
}
/* The picker: local government, then ward, then block. Every one of them is an option. */
const pick3 = { lga: '', ward: '', cell: '' };
function pickerHtml() {
  const lgas = places.lgas.map((a) => `<option value="${a.slug}"${a.slug === pick3.lga ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  const ws = pick3.lga ? places.wardsOf(pick3.lga) : [];
  const wards = ws.map((a) => `<option value="${a.slug}"${a.slug === pick3.ward ? ' selected' : ''}>${esc(a.name.split(',')[0])}</option>`).join('');
  const cs = pick3.ward ? AREAS[pick3.ward].cells : [];
  const blocksOpt = cs.map((id, i) => `<option value="${id}"${id === pick3.cell ? ' selected' : ''}>Block ${i + 1} of ${cs.length}</option>`).join('');
  return (
    '<h2 class="sec">Where to simulate</h2><div class="card picker">' +
    `<label class="field"><span>Local government (${places.lgas.length})</span><select id="plga"><option value="">Choose one</option>${lgas}</select></label>` +
    `<label class="field"><span>Ward${pick3.lga ? ` (${ws.length})` : ''}</span><select id="pward"${pick3.lga ? '' : ' disabled'}><option value="">Whole local government</option>${wards}</select></label>` +
    `<label class="field"><span>Block${pick3.ward ? ` (${cs.length})` : ''}</span><select id="pcell"${pick3.ward ? '' : ' disabled'}><option value="">Whole ward</option>${blocksOpt}</select></label>` +
    `<button type="button" class="btn primary lg block" id="usepick"${pick3.lga ? '' : ' disabled'}>Use this place</button></div>`
  );
}
function bindPicker() {
  const redraw = (focus) => {
    $('picker').innerHTML = pickerHtml();
    bindPicker();
    $(focus)?.focus();
  };
  $('plga').onchange = (e) => {
    Object.assign(pick3, { lga: e.target.value, ward: '', cell: '' });
    redraw('plga');
  };
  $('pward').onchange = (e) => {
    Object.assign(pick3, { ward: e.target.value, cell: '' });
    redraw('pward');
  };
  $('pcell').onchange = (e) => {
    pick3.cell = e.target.value;
    redraw('pcell');
  };
  $('usepick').onclick = () => setTarget(pick3.ward || pick3.lga, pick3.cell || null);
}
function nearbyRows() {
  return places.lgas
    .slice()
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
  nowBody.innerHTML =
    `<header class="head"><div><p class="over">${spotSet ? 'Your place' : 'Welcome'}</p><h1>${spotSet ? esc(targetName()) : 'Outage'}</h1></div><span class="tag">Simulated</span></header>` +
    spotCard() +
    `<div id="picker">${pickerHtml()}</div>` +
    `<div class="card why" id="why"${whyLines ? '' : ' hidden'}><h2>How sure is Outage?</h2><ul id="whylist">${(whyLines ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` +
    (spotSet
      ? '<h2 class="sec">Your power</h2><ul class="group tiles">' +
        `<li><button type="button" class="row" id="alarmrow" role="switch" aria-checked="${alarmOn}"><span class="tile red">${ICON.alarm}</span><span class="txt"><b>Light Alarm</b><span>Rings when power comes back</span></span><span class="switch"></span></button></li></ul>`
      : '') +
    `<h2 class="sec">Local governments</h2><ul class="group" id="arealist">${nearbyRows()}</ul>` +
    `<ul class="group cards" id="maprow"><li><button type="button" class="row" data-goto="map"><span class="tile blue">${ICON.map}</span><span class="txt"><b>Open the map</b><span>Every block, coloured by power</span></span>${ICON.chevron}</button></li></ul>` +
    '<p class="foot">Simulated power on real Lagos places: 20 local governments, 376 wards, 4,968 blocks. Map data from OpenStreetMap contributors, tiles by OpenFreeMap.</p>';
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
function bindNow() {
  for (const b of QA('[data-area]', nowBody)) b.onclick = () => openArea(b.getAttribute('data-area'));
  for (const b of QA('[data-goto]', nowBody)) b.onclick = () => tab(b.getAttribute('data-goto'));
  const go = $('go');
  if (go) go.onclick = start;
  bindPicker();
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
  if (fly) setTimeout(() => flyTo([a.lng, a.lat], a.kind === 'lga' ? 11.4 : 13.2, 1200), 60);
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
  const keep = sheet.scrollTop;
  const kids =
    a.kind === 'lga'
      ? `<h2 class="sec">Wards (${places.wardsOf(slug).length})</h2><ul class="group">${places
          .wardsOf(slug)
          .map((x) => `<li><button type="button" class="row" data-area="${x.slug}"><span class="txt"><b>${esc(x.name.split(',')[0])}</b><span>${esc(areaLine(x.slug))}</span></span>${ICON.chevron}</button></li>`)
          .join('')}</ul>`
      : `<h2 class="sec">Blocks (${a.cells.length})</h2><ul class="group">${a.cells
          .map((id, i) => `<li><button type="button" class="row" data-cell="${id}"><span class="txt"><b>Block ${i + 1}</b><span>Simulate on this block and the ones next to it</span></span><span class="val word" data-state="${state[id]}">${SHORT[state[id]]}</span></button></li>`)
          .join('')}</ul>`;
  sheetBody.innerHTML =
    `<div class="area-head"><div><h2>${esc(a.name)}</h2><p class="sub"><span class="word" data-state="${w}">${WORDS[w]}</span>, ${esc(areaLine(slug).toLowerCase())}</p></div>` +
    `<button type="button" class="icon-btn" id="close" aria-label="Close">${ICON.close}</button></div>` +
    `<div class="counts">${['CONFIRMED', 'POSSIBLE', 'RESTORED', 'NORMAL'].map((k) => `<div data-state="${k}"><b>${n[k]}</b><span>${SHORT[k]}</span></div>`).join('')}</div>` +
    `<div class="btns"><button type="button" class="btn primary" id="simhere"${R && !running ? '' : ' disabled'}>Simulate a blackout here</button>` +
    `<button type="button" class="btn" id="follow" aria-pressed="${followed[slug] ? 'true' : 'false'}">${followed[slug] ? `${ICON.check}Following` : `${ICON.notifications}Follow`}</button></div>` +
    kids +
    '<p class="foot">Colours show once 3 or more phones in a block agree.</p>';
  sheet.scrollTop = keep;
  $('close').onclick = closeArea;
  $('simhere').onclick = () => {
    setTarget(slug, null, false);
    start();
  };
  for (const b of QA('[data-area]', sheetBody)) b.onclick = () => openArea(b.getAttribute('data-area'));
  for (const b of QA('[data-cell]', sheetBody))
    b.onclick = () => {
      const id = b.getAttribute('data-cell');
      setTarget(slug, id, false);
      M.select(id);
      flyTo(cellCentre(CELL[id]), 14.5, 900);
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
  setTarget(AREA_OF[id], id, false);
  if (current !== AREA_OF[id]) openArea(AREA_OF[id], false);
  else renderArea(current);
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
  const found = places.search(t);
  const hits = found.slice(0, 60);
  sug.innerHTML = hits.length
    ? hits.map((a, i) => `<li role="option" id="sg${i}" data-area="${a.slug}"><b>${esc(a.name)}</b><span class="word" data-state="${worst(a.slug)}">${a.kind === 'lga' ? 'LGA' : SHORT[worst(a.slug)]}</span></li>`).join('') +
      (found.length > hits.length ? `<li class="none">${found.length - hits.length} more. Type more of the name.</li>` : '')
    : `<li class="none">No local government or ward called “${esc(q.value.trim())}”.</li>`;
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
q.placeholder = 'Search 20 LGAs and 376 wards';
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
let START = { ...state };
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
  const rest = blocks.slice(1);
  const near = s === 'POSSIBLE' ? Math.min(2, rest.length) : rest.length;
  rest.forEach((id, i) => {
    next[id] = i < near ? s : s === 'POSSIBLE' ? 'NORMAL' : state[id];
  });
  setStates(next);
}
/* Choose the place the blackout runs on: a block (and the ones next door), a ward, or a whole local government. */
function setTarget(slug, cellId = null, fly = true) {
  clearTimeout(timer);
  running = false;
  target = { slug, cell: cellId };
  blocks = targetBlocks(places, slug, cellId);
  SPOT = blocks[0];
  SPOT_LL = cellCentre(CELL[SPOT]);
  spotSet = true;
  const on = new Set(blocks);
  START = Object.fromEntries(city.cells.map((c) => [c.id, on.has(c.id) ? 'NORMAL' : c.state]));
  const a = AREAS[slug];
  Object.assign(pick3, a.kind === 'lga' ? { lga: slug, ward: '', cell: '' } : { lga: a.lga, ward: slug, cell: cellId ?? '' });
  reset();
  M.setSpot(SPOT_LL);
  renderNow();
  if (current) renderArea(current);
  if (fly) flyTo(SPOT_LL, a.kind === 'lga' ? 11.4 : cellId ? 14.5 : 13.2, 1400);
  toast(`Simulating in ${cellId ? 'a block in ' : ''}${a.name}.`);
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
    if (s === 'POSSIBLE') toast(`Phones in ${targetName()} stopped charging. Outage is checking.`);
    if (s === 'CONFIRMED') notify(`Power cut in ${targetName()}`, 'Confirmed by phones at your place. Outage will ring when it is back.');
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
  if (!target) {
    toast('Choose a place first.');
    return;
  }
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
  a.innerHTML = `<div class="alarm-card"><div class="halo">${ICON.alarm}</div><h2>Power is back</h2><p>Power returned in ${esc(targetName())}.</p><p class="sub">On the phone this rings like an alarm clock, even on silent.</p><button type="button" class="btn primary lg">Stop alarm</button></div>`;
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
  $('settings').hidden = id !== 'settings';
  if (id === 'settings') renderSettings();
  if (id === 'map' || (id === 'now' && wide())) requestAnimationFrame(() => M.map.resize());
}
for (const b of QA('.rail button')) b.onclick = () => tab(b.getAttribute('data-tab'));

/* ---- Settings, as iOS-style grouped lists ---- */
function renderSettings() {
  const row = (ic, colour, t, s, sw) =>
    `<li><button type="button" class="row" data-t="${esc(t)}"${sw === undefined ? '' : ` role="switch" aria-checked="${sw}"`}><span class="tile ${colour}">${ICON[ic]}</span><span class="txt"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</span>${sw === undefined ? ICON.chevron : '<span class="switch"></span>'}</button></li>`;
  $('settings').innerHTML =
    '<div class="screen-in"><header class="head"><div><p class="over">Outage 1.0</p><h1>Settings</h1></div><span class="tag">Simulated</span></header>' +
    '<h2 class="sec">Your power</h2><ul class="group tiles">' +
    row('alarm', 'red', 'Light Alarm', 'Ring when power comes back', alarmOn) +
    '</ul><h2 class="sec">About</h2><ul class="group tiles">' +
    row('play', 'pink', 'Replay a blackout', 'The simulation on the Now tab') +
    `</ul><ul class="group cards"><li><button type="button" class="row danger" data-t="Delete my data"><span class="txt"><b>Delete my data</b><span>From this phone and the server</span></span></button></li></ul>` +
    '<p class="foot">Outage 1.0, simulated. Map data from OpenStreetMap contributors, tiles by OpenFreeMap.</p></div>';
  for (const b of QA('.row', $('settings')))
    b.onclick = () => {
      const t = b.getAttribute('data-t');
      if (b.hasAttribute('aria-checked')) {
        const v = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(v));
        alarmOn = v;
        toast(`${t} ${v ? 'on' : 'off'}.`);
        return;
      }
      if (t === 'Replay a blackout') {
        tab('now');
        start();
        return;
      }
      toast('Simulation: there is nothing to delete.');
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
    `<div class="note">${ICON.place}<p>Pick any of the 20 local governments, 376 wards or 4,968 blocks of Lagos. Your real location is never read.</p></div>` +
    '<div class="acts"><button type="button" class="btn primary lg" id="useloc">Choose a place</button><button type="button" class="btn text" id="notnow">Not now</button></div></div>';
  app.appendChild(w);
  $('useloc').focus();
  $('useloc').onclick = () => {
    w.remove();
    land();
    $('plga')?.focus();
  };
  $('notnow').onclick = () => {
    w.remove();
    land();
  };
}
function land() {
  app.classList.remove('intro');
  renderNow();
  M.showLagos(3000, padding());
  if (app.dataset.tab === 'settings') renderSettings();
}

/* ---- Start ---- */
renderNow();
app.classList.add('intro');
welcome();
fetch('/api/v1/public/judge/replay', { headers: { accept: 'application/json' } })
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })
  .then(ready)
  .catch(fail);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/judge-sw.js').catch(() => {});
