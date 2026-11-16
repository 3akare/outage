// The simulated city the app shows in the browser (ADR 0049). The same 21 blocks, areas and starting states as the
// phone's sample map (android/outage/.../map/DemoAreaMap.kt), drawn on an axial hex grid. Every cell id starts with
// "sim-", so nothing here can be mistaken for a real H3 cell. Yaba starts with power on: the replay cuts it.
export type SimState = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED' | 'RESTORED' | 'NO_DATA';
export type SimCell = { id: string; q: number; r: number; area: string; state: SimState };
export type SimArea = { slug: string; name: string; centre: string };

export const SPOT_ID = 'sim-0,0';
export const HEX_SIZE = 46;

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

/** Centre of an axial (pointy-top) hex in SVG units. North is up. */
export function centre(q: number, r: number, s = HEX_SIZE): [number, number] {
  return [s * Math.sqrt(3) * (q + r / 2), s * 1.5 * r];
}

export function hexPath(q: number, r: number, s = HEX_SIZE, inset = 0): string {
  const [cx, cy] = centre(q, r, s);
  const k = s - inset;
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${i ? 'L' : 'M'}${(cx + k * Math.cos(a)).toFixed(1)} ${(cy + k * Math.sin(a)).toFixed(1)}`;
  });
  return `${pts.join('')}Z`;
}

/** Empty blocks around the city, drawn faintly so the map reads as part of a larger place. Decoration only. */
export function backdrop(): string {
  const used = new Set(CELLS.map((c) => `${c.q},${c.r}`));
  const out: string[] = [];
  for (let q = -6; q <= 6; q++) {
    for (let r = -6; r <= 6; r++) {
      if (Math.abs(q + r) > 6 || used.has(`${q},${r}`)) continue;
      out.push(hexPath(q, r));
    }
  }
  return `<path class="bgx" d="${out.join('')}"/>`;
}
