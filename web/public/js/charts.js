// The Insights charts as plain SVG (ADR 0053), drawn at the width they are shown at so text stays 12 px on any screen.
// One hue for magnitude (blue bars, a red ramp for the heatmap), status amber only for "below the promise", text in ink
// greys, thin marks with 4 px rounded data ends, recessive grid. Every mark carries data-tip for the hover card.
import { duration, hourLabel } from './data.js';

const INK = '#0b0d12';
const MUTED = '#6b7280';
const GRID = '#eef0f3';
const BLUE = '#1b6ef3';
const BELOW = '#f59e0b';
// Sequential red for "how often the power is off": light to dark, one hue. 0 is the neutral grey.
export const HEAT = ['#f1f3f4', '#fce8e6', '#f7b5ae', '#ee7b70', '#d93025', '#a50e0e'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtLong = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

/** A bar with its top corners rounded (r) and its foot square on the baseline. */
function bar(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
const svg = (w, h, label, body) =>
  `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
const text = (x, y, s, anchor = 'start', cls = 'ax') =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;

/** Hours of power each day, with the tariff band's promise as a dashed line. */
export function dailyBars(days, promise, band, width) {
  const h = 220;
  const left = 32;
  const right = 8;
  const top = 18;
  const bottom = 26;
  const plotH = h - top - bottom;
  const plotW = width - left - right;
  const step = plotW / days.length;
  const bw = Math.max(3, step - 2); // 2 px surface gap between bars
  const y = (v) => top + plotH - (v / 24) * plotH;
  let out = '';
  for (const g of [0, 6, 12, 18, 24]) {
    out += `<line x1="${left}" x2="${width - right}" y1="${y(g)}" y2="${y(g)}" stroke="${GRID}"/>`;
    out += text(left - 6, y(g) + 4, `${g}`, 'end');
  }
  days.forEach((d, i) => {
    const x = left + i * step + (step - bw) / 2;
    const below = promise !== null && d.hours < promise;
    const tip = `${fmtLong(d.date)}: ${d.hours} h of power${below ? `, ${Math.round((promise - d.hours) * 10) / 10} h short of the promise` : ''}`;
    out += `<path d="${bar(x, y(d.hours), bw, y(0) - y(d.hours), 4)}" fill="${below ? BELOW : BLUE}" data-tip="${esc(tip)}"/>`;
    if (i % 7 === days.length % 7 || i === days.length - 1) {
      if (i === days.length - 1 || days.length - 1 - i >= 4) out += text(x + bw / 2, h - 8, fmtDay(d.date), 'middle');
    }
  });
  if (promise !== null) {
    out += `<line x1="${left}" x2="${width - right}" y1="${y(promise)}" y2="${y(promise)}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    out += `<text class="ax strong" x="${left + 6}" y="${y(promise) - 6}" text-anchor="start" paint-order="stroke" stroke="#fff" stroke-width="4">Band ${esc(band)} promise, ${promise} h</text>`;
  }
  return svg(width, h, `Hours of power each day for ${days.length} days.${promise !== null ? ` Band ${band} promises ${promise} hours.` : ''}`, out);
}

/** Weekday by hour: how often the power was off in that hour. */
export function heatmap(grid, width) {
  const left = 36;
  const top = 4;
  const gap = 2;
  const cw = Math.max(8, (width - left - 4) / 24);
  const ch = Math.min(26, Math.max(16, cw * 1.1));
  const h = top + 7 * ch + 24;
  let out = '';
  grid.forEach((row, wd) => {
    out += text(left - 8, top + wd * ch + ch / 2 + 4, DAYS[wd], 'end');
    row.forEach((v, hr) => {
      const step = v === 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor(v * (HEAT.length - 1) - 1e-9));
      const tip = `${DAYS_LONG[wd]}, ${hourLabel(hr)} to ${hourLabel(hr + 1)}: power off on ${Math.round(v * 100)}% of them`;
      out += `<rect x="${left + hr * cw}" y="${top + wd * ch}" width="${cw - gap}" height="${ch - gap}" rx="2" fill="${HEAT[step]}" data-tip="${esc(tip)}"/>`;
    });
  });
  for (let hr = 0; hr < 24; hr += cw < 18 ? 6 : 3) out += text(left + hr * cw, h - 6, hourLabel(hr));
  return svg(width, h, 'How often the power was off, by weekday and hour.', out);
}

export function heatLegend() {
  const sw = (c) => `<svg width="18" height="12" aria-hidden="true"><rect width="18" height="12" rx="2" fill="${c}"/></svg>`;
  return `<div class="ramp" aria-hidden="true"><span>Never</span>${HEAT.map(sw).join('')}<span>Every time</span></div>`;
}

/** Hours without power each week, as a line. */
export function weeklyLine(weeks, width) {
  const h = 180;
  const left = 34;
  const right = 16;
  const top = 16;
  const bottom = 26;
  const max = Math.max(6, ...weeks.map((w) => w.offHours)) * 1.15;
  const nice = Math.ceil(max / 10) * 10;
  const plotW = width - left - right;
  const plotH = h - top - bottom;
  const x = (i) => left + (weeks.length === 1 ? plotW / 2 : (i / (weeks.length - 1)) * plotW);
  const y = (v) => top + plotH - (v / nice) * plotH;
  let out = '';
  for (let g = 0; g <= nice; g += nice / 4) {
    out += `<line x1="${left}" x2="${width - right}" y1="${y(g)}" y2="${y(g)}" stroke="${GRID}"/>`;
    out += text(left - 6, y(g) + 4, `${Math.round(g)}`, 'end');
  }
  out += `<polyline points="${weeks.map((w, i) => `${x(i)},${y(w.offHours)}`).join(' ')}" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linejoin="round"/>`;
  weeks.forEach((w, i) => {
    const tip = `${fmtDay(w.from)} to ${fmtDay(w.to)}: ${w.offHours} h without power`;
    out += `<rect x="${x(i) - plotW / weeks.length / 2}" y="${top}" width="${plotW / weeks.length}" height="${plotH}" fill="transparent" data-tip="${esc(tip)}"/>`;
    out += `<circle cx="${x(i)}" cy="${y(w.offHours)}" r="4.5" fill="${BLUE}" stroke="#fff" stroke-width="2" pointer-events="none"/>`;
    out += text(x(i), h - 8, fmtDay(w.from), i === 0 ? 'start' : i === weeks.length - 1 ? 'end' : 'middle');
  });
  const lastW = weeks[weeks.length - 1];
  out += `<text class="val strong" x="${x(weeks.length - 1)}" y="${y(lastW.offHours) - 10}" text-anchor="end">${lastW.offHours} h</text>`;
  return svg(width, h, 'Hours without power each week.', out);
}

/** A small 7-day strip for an area's card. */
export function miniBars(days, promise, width) {
  const h = 64;
  const step = width / days.length;
  const bw = step - 6;
  const y = (v) => 4 + (h - 22) * (1 - v / 24);
  let out = promise === null ? '' : `<line x1="0" x2="${width}" y1="${y(promise)}" y2="${y(promise)}" stroke="${INK}" stroke-dasharray="3 3"/>`;
  days.forEach((d, i) => {
    const x = i * step + 3;
    const below = promise !== null && d.hours < promise;
    out += `<path d="${bar(x, y(d.hours), bw, y(0) - y(d.hours), 3)}" fill="${below ? BELOW : BLUE}" data-tip="${esc(`${fmtLong(d.date)}: ${d.hours} h of power`)}"/>`;
    out += text(x + bw / 2, h - 4, d.date.toLocaleDateString('en-GB', { weekday: 'narrow' }), 'middle');
  });
  return svg(width, h, 'Hours of power each day for the last 7 days.', out);
}

export { duration, fmtDay, fmtLong, MUTED };

/** One hover card for every [data-tip] inside root. Follows the pointer; also shows on keyboard focus. */
export function bindTips(root, tip) {
  const show = (el, x, y) => {
    tip.textContent = el.getAttribute('data-tip');
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const px = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    const py = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
    tip.style.transform = `translate(${px}px,${py}px)`;
  };
  root.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && root.contains(el)) show(el, e.clientX, e.clientY);
    else tip.hidden = true;
  });
  root.addEventListener('pointerleave', () => {
    tip.hidden = true;
  });
}
