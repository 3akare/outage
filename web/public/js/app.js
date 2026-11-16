// The Outage app in the browser (ADR 0054). It is about where you are: it asks the browser for your location once,
// builds a simulated neighbourhood around your own block (sim.js) and shows your area's power, a simulated blackout
// with the Light Alarm, and Insights for your area. Other places only through search (OpenStreetMap's Nominatim, on
// Enter only, as its usage policy asks). Your position never leaves the browser. No storage, no cookies, no tracking.
import { cellToBoundary, cellToLatLng, gridDisk, gridDistance, latLngToCell } from '/vendor/h3-js/h3-js.es.js';
import { bindTips, dailyBars, fmtLong, heatLegend, heatmap, miniBars, weeklyLine } from './charts.js';
import { dailyHours, duration, heat, hourLabel, outagesIn, summary, weekly, worstHours } from './data.js';
import { createMap } from './map.js';
import { areaFor, BANDS, neighbourhood } from './sim.js';

const h3 = { gridDisk, gridDistance };
const $ = (id) => document.getElementById(id);
const QA = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ICON = JSON.parse($('icons')?.textContent ?? '{}');
const WORDS = { NORMAL: 'Power is on', POSSIBLE: 'Power may be out', CONFIRMED: 'Power is out', RESTORED: 'Power is back', NO_DATA: 'Not enough phones yet' };
const SHORT = { NORMAL: 'On', POSSIBLE: 'Maybe', CONFIRMED: 'Out', RESTORED: 'Back', NO_DATA: 'No data' };
const TODAY = new Date();
const app = $('app');
const wide = () => window.matchMedia('(min-width: 900px)').matches;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  }, 5200);
}

/* ---- Places: your own, and one you searched for ---- */
const M = createMap($('map'), { center: [12, 12], zoom: 1.5 });
let mine = null; // { lat, lng, cell, name, area, cells, states }
let viewing = null; // the place on screen: mine, or a searched place

function buildPlace(lat, lng, name) {
  const cell = latLngToCell(lat, lng, 8);
  const states = neighbourhood(h3, cell, 6);
  const cells = Object.keys(states).map((id) => ({ id, ring: cellToBoundary(id) }));
  return { lat, lng, cell, name, area: areaFor(cell, lat, lng), cells, states, start: { ...states } };
}
function padding() {
  if (wide()) return { left: $('panel').getBoundingClientRect().right + 24, top: 96, right: 24, bottom: 24 };
  return { left: 24, right: 24, top: 120, bottom: Math.max(96, window.innerHeight - $('panel').getBoundingClientRect().top + 16) };
}
function show(place, ms = 2600) {
  viewing = place;
  M.setCells(place.cells, place.states);
  M.setSpot(place === mine ? [mine.lng, mine.lat] : null);
  M.select(null);
  const [la, ln] = cellToLatLng(place.cell);
  M.flyTo([ln, la], 14.3, reduced() ? 0 : ms, padding());
  renderHome();
  if (!place.name) M.map.once('idle', () => nameIt(place));
}
function nameIt(place) {
  const n = M.placeNear([place.lng, place.lat]);
  place.name = n ?? (place === mine ? 'Your area' : 'This area');
  if (viewing === place) renderHome();
}

/* ---- Search (Nominatim, on Enter only) ---- */
const q = $('q');
const sug = $('suggest');
let searching = false;
async function search() {
  const text = q.value.trim();
  if (text.length < 2 || searching) return;
  searching = true;
  sug.hidden = false;
  sug.innerHTML = '<li class="none">Searching…</li>';
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { referrerPolicy: 'origin', headers: { accept: 'application/json' } });
    const hits = res.ok ? await res.json() : [];
    sug.innerHTML = hits.length
      ? hits
          .map(
            (h, i) =>
              `<li role="option" data-i="${i}"><span class="ico-tile">${ICON.place}</span><span class="txt"><b>${esc(h.name || h.display_name.split(',')[0])}</b><span>${esc(h.display_name)}</span></span></li>`,
          )
          .join('')
      : `<li class="none">No place called “${esc(text)}”.</li>`;
    for (const li of QA('[data-i]', sug))
      li.onmousedown = (ev) => {
        ev.preventDefault();
        const h = hits[Number(li.getAttribute('data-i'))];
        sug.hidden = true;
        q.blur();
        const place = buildPlace(Number(h.lat), Number(h.lon), h.name || h.display_name.split(',')[0]);
        if (app.dataset.tab !== 'home') tab('home');
        if (!mine) adopt(place);
        else show(place);
      };
  } catch {
    sug.innerHTML = '<li class="none">Search needs a connection.</li>';
  }
  searching = false;
}
$('searchform').onsubmit = (ev) => {
  ev.preventDefault();
  search();
};
q.addEventListener('input', () => {
  $('clear').hidden = !q.value;
  if (!q.value) sug.hidden = true;
});
q.addEventListener('blur', () => setTimeout(() => (sug.hidden = true), 150));
$('clear').onclick = () => {
  q.value = '';
  $('clear').hidden = true;
  sug.hidden = true;
  if (mine && viewing !== mine) show(mine, 1600);
};

/* ---- Map buttons ---- */
$('zin').onclick = () => M.map.zoomIn();
$('zout').onclick = () => M.map.zoomOut();
$('myloc').onclick = () => {
  if (mine) {
    if (viewing !== mine) {
      q.value = '';
      show(mine, 1600);
    } else M.flyTo([mine.lng, mine.lat], 14.3, 900, padding());
  } else locate();
};

/* ---- Panel: your area, or the place you searched ---- */
const panel = $('panel');
const body = $('panelbody');
let sheet = 'peek';
function layoutSheet() {
  if (wide()) {
    panel.style.transform = '';
    return;
  }
  const full = panel.getBoundingClientRect().height;
  const first = body.querySelector('[data-peek]');
  const peek = first ? Math.min(full, first.offsetTop + first.offsetHeight + 20) : 200;
  panel.style.transform = sheet === 'full' ? 'translateY(0)' : `translateY(${Math.max(0, full - peek)}px)`;
  $('mapctl').style.bottom = `${peek + 84}px`;
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
let live = { s: 'NORMAL', sub: '', step: 0 };
let whyLines = null;

function counts(place) {
  const n = { NORMAL: 0, POSSIBLE: 0, CONFIRMED: 0, RESTORED: 0, NO_DATA: 0 };
  for (const id of Object.keys(place.states)) n[place.states[id]] += 1;
  return n;
}
function aroundLine(place) {
  const n = counts(place);
  const bits = [];
  if (n.CONFIRMED) bits.push(`<span><i class="dot" data-state="CONFIRMED"></i>${n.CONFIRMED} out</span>`);
  if (n.POSSIBLE) bits.push(`<span><i class="dot" data-state="POSSIBLE"></i>${n.POSSIBLE} maybe</span>`);
  if (n.RESTORED) bits.push(`<span><i class="dot" data-state="RESTORED"></i>${n.RESTORED} back</span>`);
  bits.push(`<span><i class="dot" data-state="NORMAL"></i>${n.NORMAL} on</span>`);
  return bits.join('');
}

function statusCard(place) {
  const isMine = place === mine;
  const s = isMine ? live.s : place.states[place.cell];
  const sub = isMine ? live.sub : s === 'NORMAL' ? 'Phones here are charging' : WORDS[s];
  return (
    `<section class="status" data-peek data-state="${s}" id="statuscard" aria-live="polite">` +
    `<div class="status-head"><span class="eyebrow-s">${isMine ? 'Your block' : 'This block'}</span><span class="tag">Simulated</span></div>` +
    `<p class="status-word"><i class="dot lg" data-state="${s}"></i>${WORDS[s]}</p><p class="status-sub">${esc(sub)}</p>` +
    (isMine ? track(live.step) : '') +
    (isMine
      ? `<div class="row-btns"><button type="button" class="btn primary" id="go"${R && !running ? '' : ' disabled'}>${running ? 'Simulating…' : 'Simulate a blackout'}</button>` +
        (place.area.promise ? `<span class="chip-static">${ICON.bolt}Band ${place.area.band} · ${place.area.promise} h</span>` : '') +
        '</div>'
      : `<div class="row-btns"><button type="button" class="btn secondary" id="backmine">${ICON.arrow}Back to my area</button></div>`) +
    '</section>'
  );
}

function renderHome() {
  if (!viewing) return;
  const p = viewing;
  const s7 = summary(p.area, TODAY, 7);
  body.innerHTML =
    `<header class="place-head"><p class="eyebrow-s">${p === mine ? 'Your area' : 'Viewing'}</p><h2>${esc(p.name ?? '…')}</h2></header>` +
    statusCard(p) +
    `<div class="why" id="why"${whyLines && p === mine ? '' : ' hidden'}><p class="h">How sure is Outage?</p><ul id="whylist">${(whyLines ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` +
    `<section class="card"><div class="card-row"><p class="h">This week</p><button type="button" class="link" data-goto="insights">Insights ${ICON.chevron}</button></div>` +
    `<div class="kpis"><div><b>${s7.avgHours} h</b><span>power a day</span></div><div><b>${s7.outages}</b><span>outages</span></div><div><b>${s7.outages ? duration(s7.medianMinutes) : '–'}</b><span>typical wait</span></div></div>` +
    `<div class="mini" data-mini></div></section>` +
    `<section class="card"><p class="h">Around ${p === mine ? 'you' : 'here'}</p><p class="around">${aroundLine(p)}</p><p class="fine">Blocks within about 2 km. Tap one on the map.</p></section>` +
    '<p class="fine pad">Simulated data for a demo. Map © OpenStreetMap contributors, OpenFreeMap.</p>';
  drawMini();
  bind();
  layoutSheet();
}
function drawMini() {
  const el = body.querySelector('[data-mini]');
  if (el && viewing) el.innerHTML = miniBars(dailyHours(viewing.area, TODAY, 7), viewing.area.promise, el.clientWidth || 300);
}
function bind() {
  for (const b of QA('[data-goto]', body)) b.onclick = () => tab(b.getAttribute('data-goto'));
  const go = $('go');
  if (go) go.onclick = start;
  const back = $('backmine');
  if (back)
    back.onclick = () => {
      q.value = '';
      $('clear').hidden = true;
      show(mine, 1600);
    };
}
M.on('cell', (id) => {
  if (!id || !viewing) return;
  M.select(id);
  const s = viewing.states[id];
  const d = gridDistance(viewing.cell, id);
  toast(`${WORDS[s]} in this block, ${d === 0 ? 'your own block' : `about ${(d * 0.9).toFixed(1)} km away`}.`);
});

/* ---- Replay of one blackout at your block ---- */
let R = null;
let frames = [];
let first = 0;
let phones = [];
let on = {};
let timer = 0;
let running = false;
let last = 'NORMAL';
const pct = (p) => (p < 0.0001 ? 'under 0.01%' : `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`);
const stOf = (f) => (WORDS[f.cells[0]?.state] ? f.cells[0].state : 'NORMAL');
function applyEvents(f) {
  for (const ev of f.events) {
    if (ev.type === 'UNPLUG') on[ev.alias] = false;
    else if (ev.type === 'REPLUG' || ev.type === 'ARMED') on[ev.alias] = true;
  }
}
const offCount = () => phones.filter((p) => !on[p.alias]).length;
function setMine(s) {
  const ring = gridDisk(mine.cell, 1).filter((c) => c !== mine.cell);
  const next = { [mine.cell]: s };
  ring.forEach((id, i) => {
    next[id] = s === 'POSSIBLE' ? (i < 2 ? s : 'NORMAL') : s;
  });
  Object.assign(mine.states, next);
  if (viewing === mine) M.setStates(next);
}
function why(x) {
  whyLines = [
    `${x.k} of ${x.n} watching phones stopped charging within ${Math.round(x.windowMs / 1000)} s.`,
    `Usual rate: ${(x.lambdaPerSec * 3600).toFixed(1)} unplugs an hour. Chance this is luck: ${pct(x.p)}.`,
    ...(x.restore ? [`Power back: ${x.restore.replugs} phones charging again, ${x.restore.quorum} needed.`] : []),
  ];
}
function frame(f) {
  const s = stOf(f);
  const o = offCount();
  const n = phones.length;
  if (s === 'NORMAL') live = { s, step: 0, sub: o === 0 ? `${n} of ${n} phones nearby are charging` : `${o} of ${n} stopped charging. Not enough to call it a cut.` };
  else if (s === 'POSSIBLE') live = { s, step: 1, sub: `${o} of ${n} phones stopped charging within seconds. Checking.` };
  else if (s === 'CONFIRMED') live = { s, step: 2, sub: `${o} of ${n} phones lost power together. Too many to be luck.` };
  else live = { s, step: 3, sub: `${n - o} of ${n} phones are charging again.` };
  if (f.explanation) why(f.explanation);
  setMine(s);
  if (viewing === mine) renderHome();
  const name = mine.name ?? 'your area';
  if (s !== last) {
    if (s === 'POSSIBLE') toast(`Phones in ${name} stopped charging. Outage is checking.`);
    if (s === 'CONFIRMED') notify(`Power cut in ${name}`, 'Confirmed by phones at your block. We will ring when it is back.');
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
    if (viewing === mine) renderHome();
    const go = $('go');
    if (go) go.textContent = 'Simulate again';
    return;
  }
  applyEvents(frames[i]);
  frame(frames[i]);
  if (i + 1 < frames.length) timer = setTimeout(() => run(i + 1), gap(frames[i], frames[i + 1]));
  else run(i + 1);
}
function reset() {
  on = {};
  for (let i = 0; i < first; i++) applyEvents(frames[i]);
  last = 'NORMAL';
  whyLines = null;
  live = { s: 'NORMAL', step: 0, sub: `${phones.length} of ${phones.length} phones nearby are charging` };
  if (mine) {
    Object.assign(mine.states, mine.start);
    if (viewing === mine) M.setStates(mine.start);
  }
}
function start() {
  if (running || !R || !mine) return;
  if (viewing !== mine) show(mine, 900);
  running = true;
  clearTimeout(timer);
  reset();
  renderHome();
  sheet = 'peek';
  layoutSheet();
  M.flyTo([mine.lng, mine.lat], 14.8, 900, padding());
  timer = setTimeout(() => run(first), 1000);
}
function ready(d) {
  R = d;
  frames = d.frames;
  phones = d.phones;
  first = frames.findIndex((f) => ['POSSIBLE', 'CONFIRMED'].includes(stOf(f)));
  if (first < 0) return;
  while (first > 0 && frames[first - 1].events.some((ev) => ev.type === 'UNPLUG')) first--;
  reset();
  if (viewing === mine) renderHome();
}

/* ---- Light Alarm, as on the phone ---- */
function ring() {
  const a = document.createElement('div');
  a.className = 'alarm';
  a.setAttribute('role', 'alertdialog');
  a.setAttribute('aria-label', 'Light Alarm');
  a.innerHTML = `<div class="alarm-card"><div class="halo">${ICON.alarm}</div><p class="alarm-time">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p><h2>Power is back</h2><p>Power returned at your block in ${esc(mine.name ?? 'your area')}.</p><button type="button" class="btn light">Stop alarm</button></div>`;
  app.appendChild(a);
  const b = a.querySelector('button');
  b.focus();
  b.onclick = () => {
    a.remove();
    toast('Light Alarm stopped.');
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
  if (id === 'settings') renderSettings();
  if (id === 'home') {
    M.map.resize();
    layoutSheet();
  }
}
for (const b of QA('.rail button')) b.onclick = () => tab(b.getAttribute('data-tab'));

/* ---- Insights: your area; a searched place only if you chose one ---- */
let insightsOf = 'mine';
let redraw = null;
const tile = (value, label, sub, tone = '') =>
  `<div class="tile"${tone ? ` data-tone="${tone}"` : ''}><span>${esc(label)}</span><b>${esc(value)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
function renderInsights() {
  const page = $('insights');
  const place = insightsOf === 'viewing' && viewing && viewing !== mine ? viewing : mine;
  if (!place) {
    page.innerHTML = `<div class="page-in narrow"><div class="empty-state">${ICON.place}<h1>Insights are about your area</h1><p>Share your location or search for your town, and Insights show how power behaves there.</p><button type="button" class="btn primary" id="ilocate">Use my location</button></div></div>`;
    $('ilocate').onclick = () => {
      tab('home');
      locate();
    };
    return;
  }
  const a = place.area;
  const s = summary(a, TODAY, 30);
  const days = dailyHours(a, TODAY, 30);
  const grid = heat(a, TODAY, 28);
  const peak = worstHours(grid);
  const weeks = weekly(a, TODAY, 5);
  const cuts = outagesIn(a, TODAY, 30);
  const prev = weeks[weeks.length - 2]?.offHours ?? 0;
  const lastW = weeks[weeks.length - 1].offHours;
  const change = prev ? Math.round(((lastW - prev) / prev) * 100) : 0;
  const switcher =
    viewing && mine && viewing !== mine
      ? `<div class="seg" role="group" aria-label="Place"><button type="button" data-of="mine" aria-pressed="${place === mine}">My area</button><button type="button" data-of="viewing" aria-pressed="${place !== mine}">${esc(viewing.name ?? 'Searched place')}</button></div>`
      : '';
  page.innerHTML =
    '<div class="page-in">' +
    `<header class="page-head"><div><p class="eyebrow-s">${place === mine ? 'Your area' : 'Viewing'}</p><h1>${esc(place.name ?? 'Your area')}</h1><p class="sub">Last 30 days, to ${fmtLong(days[days.length - 1].date)} <span class="tag">Simulated</span></p></div>${switcher}</header>` +
    '<div class="tiles">' +
    tile(`${s.avgHours} h`, 'Power a day', s.promise ? `Band ${s.band} promises ${s.promise} h` : `${Math.round((s.avgHours / 24) * 100)}% of the time`, s.promise ? (s.avgHours < s.promise ? 'below' : 'met') : '') +
    (s.promise ? tile(`${s.daysBelow} of ${s.days}`, 'Days below the promise', `${Math.round((s.daysBelow / s.days) * 100)}% of days`) : tile(`${s.offHours} h`, 'Without power', 'in 30 days')) +
    tile(`${s.outages}`, 'Outages', `${(s.outages / 30).toFixed(1)} a day`) +
    tile(s.outages ? duration(s.medianMinutes) : '–', 'Typical wait', 'until power is back') +
    tile(s.outages ? duration(s.longestMinutes) : '–', 'Longest outage', '') +
    '</div>' +
    `<section class="card"><div class="card-head"><h2>Hours of power each day</h2><p class="sub">${s.promise ? `${s.daysBelow} of ${s.days} days below Band ${s.band}'s ${s.promise} h` : `Average ${s.avgHours} h a day`}</p></div>` +
    (s.promise
      ? `<div class="legend-inline"><span><i class="sw blue"></i>Met the promise</span><span><i class="sw amber"></i>Below the promise</span><span><i class="sw dash"></i>Band ${s.band} promise</span></div>`
      : '') +
    '<div class="plot" data-chart="daily"></div>' +
    `<details><summary>Show as a table</summary><table><thead><tr><th>Day</th><th>Hours of power</th></tr></thead><tbody>${days
      .slice()
      .reverse()
      .map((d) => `<tr><td>${fmtLong(d.date)}</td><td>${d.hours} h</td></tr>`)
      .join('')}</tbody></table></details></section>` +
    '<div class="two">' +
    `<section class="card"><div class="card-head"><h2>When the power goes</h2><p class="sub">Most often off ${hourLabel(peak.from)} to ${hourLabel(peak.to)}, on ${Math.round(peak.share * 100)}% of days</p></div><div class="plot" data-chart="heat"></div>${heatLegend()}</section>` +
    `<section class="card"><div class="card-head"><h2>Hours without power each week</h2><p class="sub">${change === 0 ? 'Same as the week before' : `${Math.abs(change)}% ${change < 0 ? 'less' : 'more'} than the week before`}</p></div><div class="plot" data-chart="weekly"></div></section>` +
    '</div>' +
    `<section class="card"><div class="card-head"><h2>Outage history</h2><p class="sub">${cuts.length} outages in the last 30 days, newest first</p></div>` +
    `<table class="log"><thead><tr><th>Day</th><th>Went off</th><th>Came back</th><th>Length</th></tr></thead><tbody>${cuts
      .map((c, i) => {
        const end = new Date(c.start.getTime() + c.minutes * 60000);
        const t = (d) => d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
        return `<tr${i >= 8 ? ' class="more" hidden' : ''}><td>${fmtLong(c.start)}</td><td>${t(c.start)}</td><td>${t(end)}${end.getDate() !== c.start.getDate() ? ' (next day)' : ''}</td><td><span class="len${c.minutes === s.longestMinutes ? ' longest' : ''}">${duration(c.minutes)}</span></td></tr>`;
      })
      .join('')}</tbody></table>` +
    (cuts.length > 8 ? `<button type="button" class="btn secondary" id="moreLog">Show all ${cuts.length}</button>` : '') +
    '</section>' +
    `<p class="fine">Simulated history for a demo. On the phone, Insights come from your own phone's record of every cut at your block.${s.promise ? ' Tariff bands are NERC minimum hours of supply a day.' : ''}</p>` +
    '</div>';
  const draw = () => {
    const w = (k) => Math.max(260, page.querySelector(`[data-chart="${k}"]`).clientWidth);
    page.querySelector('[data-chart="daily"]').innerHTML = dailyBars(days, s.promise, s.band, w('daily'));
    page.querySelector('[data-chart="heat"]').innerHTML = heatmap(grid, w('heat'));
    page.querySelector('[data-chart="weekly"]').innerHTML = weeklyLine(weeks, w('weekly'));
  };
  draw();
  redraw = draw;
  for (const b of QA('[data-of]', page))
    b.onclick = () => {
      insightsOf = b.getAttribute('data-of');
      renderInsights();
    };
  const more = $('moreLog');
  if (more)
    more.onclick = () => {
      for (const r of QA('tr.more', page)) r.hidden = false;
      more.remove();
    };
}
bindTips($('insights'), $('tip'));
bindTips(panel, $('tip'));

/* ---- Settings ---- */
const prefs = { alarm: true, freezer: true, diagnostics: false };
function renderSettings() {
  const row = (ic, t, s, key) =>
    `<li><button type="button" class="row" data-t="${esc(t)}"${key ? ` data-key="${key}" role="switch" aria-checked="${prefs[key]}"` : ''}><span class="lead">${ICON[ic]}</span><span class="txt"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</span>${key ? '<span class="switch"></span>' : ICON.chevron}</button></li>`;
  const band = mine?.area.band;
  $('settings').innerHTML =
    '<div class="page-in narrow"><header class="page-head"><div><h1>Settings</h1></div></header>' +
    `<h2 class="group">Your power</h2><ul class="list">${row('place', 'Your area', mine?.name ?? 'Not set')}${band ? row('bolt', 'Tariff band', `Band ${band}, ${BANDS[band]} hours a day`) : ''}${row('alarm', 'Light Alarm', 'Ring when power comes back', 'alarm')}${row('freezer', 'Freezer Guard', 'Warn after 4 h without power', 'freezer')}${row('phone', 'Home Watch', 'Watch a spare phone at home')}</ul>` +
    `<h2 class="group">This phone</h2><ul class="list">${row('battery', 'Keep Outage running', 'Battery settings for your phone')}${row('notifications', 'Notifications', 'Allowed')}${row('chart', 'Share anonymous diagnostics', 'Helps fix missed outages', 'diagnostics')}${row('language', 'Language', 'English')}</ul>` +
    `<h2 class="group">About</h2><ul class="list">${row('shield', 'Privacy', 'No account. Only your block is saved, never your position.')}${row('delete', 'Delete my data', 'From this phone and the server')}</ul>` +
    '<p class="fine">Outage 1.0 · demo with simulated data. Map © OpenStreetMap contributors, OpenFreeMap.</p></div>';
  for (const b of QA('.row', $('settings')))
    b.onclick = () => {
      const key = b.getAttribute('data-key');
      if (key) {
        prefs[key] = !prefs[key];
        b.setAttribute('aria-checked', String(prefs[key]));
        return;
      }
      const t = b.getAttribute('data-t');
      toast(t === 'Delete my data' ? 'Nothing to delete: the demo keeps nothing.' : `On the phone this opens ${t}.`);
    };
}

/* ---- First run: your location ---- */
function adopt(place) {
  mine = place;
  app.classList.remove('intro');
  show(mine, reduced() ? 0 : 3200);
  if (R) reset();
}
function locate() {
  const btn = $('useloc');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Finding you…';
  }
  if (!('geolocation' in navigator)) return noLocation();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('welcome')?.remove();
      adopt(buildPlace(pos.coords.latitude, pos.coords.longitude, null));
    },
    noLocation,
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
  );
}
function noLocation() {
  $('welcome')?.remove();
  app.classList.remove('intro');
  toast('Location not shared. Search for your town or area.');
  q.focus();
}
function welcome() {
  const w = document.createElement('div');
  w.className = 'scrim';
  w.id = 'welcome';
  w.innerHTML =
    '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="wt">' +
    `<div class="dialog-icon">${ICON.myLocation}</div><h2 id="wt">See the power around you</h2>` +
    '<p>Outage shows your own block and the area around it. Your browser asks for your location once; it stays in your browser and is never sent to us.</p>' +
    '<div class="acts"><button type="button" class="btn primary lg" id="useloc">Use my location</button><button type="button" class="btn ghost lg" id="searchinstead">Search for a place instead</button></div>' +
    '<p class="fine">Demo with simulated data around wherever you are.</p></div>';
  app.appendChild(w);
  $('useloc').focus();
  $('useloc').onclick = locate;
  $('searchinstead').onclick = () => {
    w.remove();
    app.classList.remove('intro');
    q.focus();
  };
}

/* ---- Start ---- */
app.classList.add('intro');
welcome();
let rz = 0;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    layoutSheet();
    if (app.dataset.tab === 'insights' && redraw) redraw();
    if (app.dataset.tab === 'home') drawMini();
  }, 120);
});
fetch('/api/v1/public/judge/replay', { headers: { accept: 'application/json' } })
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => d && ready(d))
  .catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/judge-sw.js').catch(() => {});
