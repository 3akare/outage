// The simulated city the app shows in the browser (ADR 0049). The same 21 blocks, areas and starting states as the
// phone's sample map (android/outage/.../map/DemoAreaMap.kt), drawn on an axial hex grid. Every cell id starts with
// "sim-", so nothing here can be mistaken for a real H3 cell. Yaba starts with power on: the replay cuts it.
export type SimState = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED' | 'RESTORED' | 'NO_DATA';
export type SimCell = { id: string; q: number; r: number; area: string; state: SimState };
export type SimArea = { slug: string; name: string; centre: string };

export const SPOT_ID = 'sim-0,0';

const AREA_OF: Record<string, readonly [number, number][]> = {
  yaba: [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [-1, -1]],
  surulere: [[-2, 2], [-1, 2], [-2, 1], [0, 2], [-3, 1]],
  ikeja: [[1, -2], [2, -2], [0, -2], [2, -1], [3, -1]],
  lekki: [[2, 0], [1, 1], [-2, 0]],
};

// The phone's sample states (its one unlisted block, -1,-1, falls back to Yaba there too), except Yaba, which starts with power on so the replay can cut it.
const START: Record<string, SimState> = {
  '-2,2': 'NORMAL', '-1,2': 'NO_DATA', '-2,1': 'NORMAL', '0,2': 'NORMAL', '-3,1': 'NO_DATA',
  '1,-2': 'POSSIBLE', '2,-2': 'NO_DATA', '0,-2': 'NORMAL', '2,-1': 'CONFIRMED', '3,-1': 'NO_DATA',
  '2,0': 'NORMAL', '1,1': 'NORMAL', '-2,0': 'NORMAL',
};

export const AREAS: readonly SimArea[] = [
  { slug: 'yaba', name: 'Yaba', centre: 'sim-0,0' },
  { slug: 'surulere', name: 'Surulere', centre: 'sim--1,2' },
  { slug: 'ikeja', name: 'Ikeja', centre: 'sim-1,-2' },
  { slug: 'lekki', name: 'Lekki', centre: 'sim-2,0' },
];

export const CELLS: readonly SimCell[] = Object.entries(AREA_OF).flatMap(([area, list]) =>
  list.map(([q, r]) => ({ id: `sim-${q},${r}`, q, r, area, state: START[`${q},${r}`] ?? 'NORMAL' })),
);

// Geography, the same as the phone's DemoAreaMap: blocks sized like H3 resolution 8 (edge about 0.46 km) around Yaba.
const LAT0 = 6.5158;
const LNG0 = 3.3711;
const EDGE_KM = 0.46;
const KM_PER_DEG = 111.32;

/** Centre of an axial (pointy-top) block as [latitude, longitude]. North is up. */
export function centreLatLng(q: number, r: number): [number, number] {
  const xKm = EDGE_KM * Math.sqrt(3) * (q + r / 2);
  const yKm = -EDGE_KM * 1.5 * r;
  return [LAT0 + yKm / KM_PER_DEG, LNG0 + xKm / (KM_PER_DEG * Math.cos((LAT0 * Math.PI) / 180))];
}

/** The six corners of a block as [latitude, longitude], rounded to about a metre. */
export function ringLatLng(q: number, r: number): [number, number][] {
  const xKm = EDGE_KM * Math.sqrt(3) * (q + r / 2);
  const yKm = -EDGE_KM * 1.5 * r;
  const kLng = KM_PER_DEG * Math.cos((LAT0 * Math.PI) / 180);
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [+(LAT0 + (yKm + EDGE_KM * Math.sin(a)) / KM_PER_DEG).toFixed(5), +(LNG0 + (xKm + EDGE_KM * Math.cos(a)) / kLng).toFixed(5)];
  });
}

/** Empty blocks around the city, drawn faintly at street level so the map reads as part of a larger place. */
export function backdropRings(radius = 6): [number, number][][] {
  const used = new Set(CELLS.map((c) => `${c.q},${c.r}`));
  const out: [number, number][][] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) > radius || used.has(`${q},${r}`)) continue;
      out.push(ringLatLng(q, r));
    }
  }
  return out;
}
