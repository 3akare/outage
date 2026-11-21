#!/usr/bin/env node
// Rebuilds core/shared/design/icons.json from Lucide's SVGs (ISC, https://lucide.dev): one stroke path per icon, every
// shape (line, circle, rect, polyline) turned into path data. Usage: npm pack lucide-static, untar it, then
//   node tools/icon/lucide.mjs <package/icons dir> core/shared/design/icons.json && node tools/icon/build.mjs
// The MAP below names which Lucide glyph each Outage icon uses.
import { readFileSync, writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const MAP = {
  home: 'house',
  insights: 'chart-column',
  settings: 'settings',
  myLocation: 'locate-fixed',
  add: 'plus',
  remove: 'minus',
  bolt: 'zap',
  notifications: 'bell',
  alarm: 'alarm-clock',
  place: 'map-pin',
  lock: 'lock',
  shield: 'shield',
  download: 'download',
  freezer: 'snowflake',
  phone: 'smartphone',
  chart: 'trending-up',
  info: 'info',
  check: 'circle-check',
  language: 'languages',
  delete: 'trash-2',
  battery: 'battery-charging',
  play: 'play',
  android: 'smartphone',
  store: 'download',
  code: 'code',
  arrow: 'arrow-right',
  chevron: 'chevron-right',
  back: 'chevron-left',
  layers: 'layers',
  groups: 'users',
  receipt: 'receipt',
  search: 'search',
  close: 'x',
  map: 'map',
  plug: 'plug-zap',
  clock: 'clock',
  offline: 'wifi-off',
  share: 'share',
  sun: 'sun',
  moon: 'moon',
  alert: 'circle-alert',
};
const num = (a, k) => Number(a.match(new RegExp(`\\b${k}="([^"]+)"`))?.[1] ?? 0);
function toD(el) {
  const tag = el.match(/^<(\w+)/)[1];
  if (tag === 'path') return el.match(/\bd="([^"]+)"/)[1].replace(/^m\s*(-?[\d.]+)[\s,]*(-?[\d.]+)\s*(?=[-\d.])/, 'M$1 $2l').replace(/^m/, 'M');
  if (tag === 'line') return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`;
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = num(el, 'cx'),
      cy = num(el, 'cy');
    const rx = tag === 'circle' ? num(el, 'r') : num(el, 'rx');
    const ry = tag === 'circle' ? rx : num(el, 'ry');
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  }
  if (tag === 'rect') {
    const x = num(el, 'x'),
      y = num(el, 'y'),
      w = num(el, 'width'),
      h = num(el, 'height');
    let r = num(el, 'rx') || num(el, 'ry');
    r = Math.min(r, w / 2, h / 2);
    if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
    return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const p = el
      .match(/points="([^"]+)"/)[1]
      .trim()
      .split(/[\s,]+/);
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
    return tag === 'polygon' ? d + 'z' : d;
  }
  throw new Error(tag);
}
// A path's leading "m" is an absolute move whose following pairs are relative lines, so it becomes "M x y l",
// which keeps its meaning once the paths are joined into one.
const icons = {};
for (const [name, file] of Object.entries(MAP)) {
  const svg = readFileSync(`${dir}/${file}.svg`, 'utf8');
  const els = svg.match(/<(path|line|circle|ellipse|rect|polyline|polygon)\b[^>]*\/>/g);
  icons[name] = els.map(toD).join('');
}
writeFileSync(
  out,
  JSON.stringify(
    {
      license: 'Lucide icons (ISC License, https://lucide.dev/license), 24 x 24, drawn as 1.75 px round strokes.',
      stroke: 1.75,
      icons,
    },
    null,
    2,
  ) + '\n',
);
