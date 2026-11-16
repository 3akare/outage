// The landing page's live pieces (ADR 0054): the app's map on the phone in the hero, a globe turning slowly with
// simulated power around cities where the grid is unreliable, and a real Insights chart from simulated history.
import { cellToBoundary, gridDisk, latLngToCell } from '/vendor/h3-js/h3-js.es.js';
import { bindTips, dailyBars } from './charts.js';
import { dailyHours } from './data.js';
import { createMap } from './map.js';
import { areaFor } from './sim.js';

// Cities where power cuts are part of daily life. Only to place simulated blocks on the globe.
const CITIES = [
  [6.52, 3.38],
  [7.38, 3.94],
  [9.06, 7.49],
  [5.6, -0.19],
  [-1.29, 36.82],
  [-26.2, 28.05],
  [-4.32, 15.31],
  [24.86, 67.0],
  [23.81, 90.41],
  [33.89, 35.5],
  [18.54, -72.34],
  [10.49, -66.88],
];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const box = document.getElementById('heromap');
if (box) {
  const cells = [];
  const states = {};
  // Each city gets one simulated state for its blocks, so the globe shows cuts, returns and doubts around the world.
  const LOOK = ['CONFIRMED', 'RESTORED', 'POSSIBLE', 'CONFIRMED', 'RESTORED', 'POSSIBLE'];
  CITIES.forEach(([lat, lng], i) => {
    for (const id of gridDisk(latLngToCell(lat, lng, 3), 1)) {
      states[id] = LOOK[i % LOOK.length];
      cells.push({ id, ring: cellToBoundary(id) });
    }
  });
  const m = createMap(box, { center: [12, 8], zoom: 0.9, interactive: false, attribution: false });
  m.on('ready', () => {
    m.setCells(cells, states);
    if (reduced) return;
    // A slow, steady turn: one degree of longitude about every 120 ms.
    let lng = 12;
    const turn = () => {
      lng = lng >= 180 ? -180 : lng + 1;
      m.map.easeTo({ center: [lng, 8], duration: 120, easing: (t) => t });
    };
    setInterval(turn, 120);
  });
}

const chart = document.getElementById('herochart');
if (chart) {
  const today = new Date();
  const area = areaFor('demo', 6.52, 3.38);
  const draw = () => {
    chart.innerHTML = dailyBars(dailyHours(area, today, 30), area.promise, area.band, Math.max(240, chart.clientWidth));
  };
  draw();
  window.addEventListener('resize', draw);
  const tip = document.getElementById('tip');
  if (tip) bindTips(chart, tip);
}
