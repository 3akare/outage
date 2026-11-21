// The landing page's live map (ADR 0054): the simulated city on the real street map.
import { createMap } from './map.js';

const box = document.getElementById('heromap');
const city = await fetch('/demo-city.json').then((r) => r.json());
if (box) {
  const m = createMap(box, city, { center: [3.45, 6.5], zoom: window.innerWidth < 600 ? 9.6 : 10.4, cooperative: true, globe: false, fitLagos: true, fitPadding: 8 });
  m.on('ready', () => box.setAttribute('data-ready', '1'));
}
