// The landing page's live map and chart (ADR 0053): the simulated Lagos on the real street map, and Yaba's last 30 days.
import { bindTips, dailyBars } from './charts.js';
import { dailyHours, summary } from './data.js';
import { createMap } from './map.js';

const box = document.getElementById('heromap');
const chart = document.getElementById('herochart');
const city = await fetch('/demo-city.json').then((r) => r.json());
if (box) {
  const m = createMap(box, city, { center: [3.42, 6.5], zoom: 10.3, cooperative: true, globe: false });
  m.on('ready', () => box.setAttribute('data-ready', '1'));
}
if (chart) {
  const today = new Date();
  const yaba = city.areas.find((a) => a.slug === 'yaba');
  const s = summary(city, yaba, today, 30);
  const draw = () => {
    chart.innerHTML = dailyBars(dailyHours(city, yaba, today, 30), s.promise, s.band, Math.max(260, chart.clientWidth));
  };
  draw();
  window.addEventListener('resize', draw);
  const tip = document.getElementById('tip');
  if (tip) bindTips(chart, tip);
  const n = document.getElementById('herostat');
  if (n) n.textContent = `${s.avgHours} h of power a day on average; ${s.daysBelow} of ${s.days} days below Band ${s.band}'s ${s.promise} h.`;
}
