// The landing page's live map (ADR 0054): the simulated city on the real street map.
import { createMap } from './map.js';
import { buildPlaces } from './places.js';

const box = document.getElementById('heromap');
// All 4,968 Lagos blocks with the same made-up colours as the app (places.js reads the states from /lagos-sim.json).
const city = { cells: buildPlaces(await fetch('/lagos-sim.json').then((r) => r.json())).cells };
if (box) {
  const m = createMap(box, city, { cooperative: true, globe: false, fitLagos: true, fitPadding: 8 });
  m.on('ready', () => box.setAttribute('data-ready', '1'));
}
