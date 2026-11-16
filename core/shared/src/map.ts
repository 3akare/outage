// Public map JSON served by GET /api/map.json (spec app-map-insights design section 3, ADR 0007, ADR 0022).
// Types only. The Worker builds it and the Kotlin parser (AreaMapParser) reads the fixture in fixtures/map/.
// There is no member count and no device id in this shape: a cell under the 3-phone floor is NO_DATA with no history.
export type MapCellState = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED' | 'RESTORED' | 'NO_DATA';

export type MapOutageJson = { startMs: number; endMs: number | null; level: 'POSSIBLE' | 'CONFIRMED' };

export type MapCellJson = {
  id: string;
  area: string;
  state: MapCellState;
  sinceMs: number | null;
  restoredMs: number | null;
  history30d: MapOutageJson[];
  /** Six [lat, lng] vertices of the hex, from h3 cellToBoundary. */
  ring: [number, number][];
};

export type MapAreaJson = { slug: string; name: string; centreCell: string; cells: string[] };

export type MapJson = {
  city: string;
  generatedMs: number;
  simulated: false;
  areas: MapAreaJson[];
  cells: MapCellJson[];
};
