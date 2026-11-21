// Every place the browser simulation can run on (ADR 0060): the 20 Lagos LGAs, 376 wards and 4,968 hexes, read from
// /lagos-sim.json (web/ui/simulate/lagos-sim.ts). Pure functions, no DOM: Vitest checks them (web/test/web-sim-places.test.ts).
// A hex id here is "sim-" plus the H3 index, so a simulated block can never be mistaken for a real cell.

const KM = 111.32; // kilometres in one degree of latitude
const NEAR_KM = 1.1; // hex centres on the res-8 grid sit about 0.9 km apart: closer than this means next door

/** Turns the file into places, hexes and the lookups the picker, the search and the replay use. */
export function buildPlaces(sim) {
  const cells = sim.cells.map((c) => {
    const [h, la, ln] = c;
    const ring = [];
    for (let i = 3; i < c.length; i += 2) ring.push([(la + c[i]) / 1e5, (ln + c[i + 1]) / 1e5]);
    return { id: `sim-${h}`, area: '', state: 'NO_DATA', ring, lat: la / 1e5, lng: ln / 1e5 };
  });
  const byId = Object.fromEntries(cells.map((c) => [c.id, c]));
  const areas = {};
  const make = (slug, name, kind, lga, idx) => {
    const own = idx.map((i) => cells[i]);
    const lat = own.reduce((s, c) => s + c.lat, 0) / own.length;
    const lng = own.reduce((s, c) => s + c.lng, 0) / own.length;
    // The middle block is the one closest to the mean of the area, so it is always inside it.
    const centre = own.reduce((best, c) => (d2(c, lat, lng) < d2(best, lat, lng) ? c : best), own[0]);
    areas[slug] = { slug, name, kind, lga, cells: own.map((c) => c.id), lat: centre.lat, lng: centre.lng, centre: centre.id };
    return areas[slug];
  };
  const lgas = sim.lgas.map(([slug, name, idx]) => make(slug, name, 'lga', null, idx));
  const wards = sim.wards.map(([slug, name, li, idx]) => make(slug, name, 'ward', sim.lgas[li][0], idx));
  // The ward a block belongs to, for the colour it is counted in. The first ward that lists it keeps it.
  for (const w of wards) for (const id of w.cells) if (!byId[id].area) byId[id].area = w.slug;
  const wardsByLga = {};
  for (const w of wards) {
    if (!wardsByLga[w.lga]) wardsByLga[w.lga] = [];
    wardsByLga[w.lga].push(w);
  }
  return {
    cells,
    byId,
    areas,
    lgas,
    wards,
    wardsOf: (lga) => wardsByLga[lga] ?? [],
    /** The blocks next door to a block, nearest first. */
    neighbours(id) {
      const c = byId[id];
      if (!c) return [];
      const cos = Math.cos((c.lat * Math.PI) / 180);
      return cells
        .filter((o) => o !== c && Math.abs(o.lat - c.lat) * KM < NEAR_KM && Math.abs(o.lng - c.lng) * KM * cos < NEAR_KM)
        .map((o) => [o, Math.hypot((o.lat - c.lat) * KM, (o.lng - c.lng) * KM * cos)])
        .filter(([, d]) => d < NEAR_KM)
        .sort((a, b) => a[1] - b[1])
        .map(([o]) => o.id);
    },
    /** LGAs and wards whose name or slug holds every word typed. LGAs come first. */
    search(text) {
      const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (!words.length) return [];
      const hit = (a) => words.every((w) => a.name.toLowerCase().includes(w) || a.slug.includes(w));
      return [...lgas.filter(hit), ...wards.filter(hit)];
    },
  };
}

function d2(c, lat, lng) {
  return (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
}

/**
 * The blocks a simulated blackout runs on, the spot first and the rest nearest first. A block gets itself and the
 * blocks next door; a ward or an LGA gets all of its own blocks.
 */
export function targetBlocks(places, slug, cellId) {
  if (cellId) return [cellId, ...places.neighbours(cellId)];
  const a = places.areas[slug];
  const c = places.byId[a.centre];
  const cos = Math.cos((c.lat * Math.PI) / 180);
  const dist = (id) => Math.hypot(places.byId[id].lat - c.lat, (places.byId[id].lng - c.lng) * cos);
  return [a.centre, ...a.cells.filter((id) => id !== a.centre).sort((x, y) => dist(x) - dist(y))];
}
