// Types for sim.js, so the Worker's tests can import it with the TypeScript checker on.
import type { Area } from './data.js';
export declare const HISTORY_WEEKS: number;
export declare const BANDS: { A: number; B: number; C: number; D: number; E: number };
export declare function prng(seed: number): () => number;
export declare function hash(s: string): number;
export declare function history(seed: string, meanHours: number): [number, number, number][];
export declare function inNigeria(lat: number, lng: number): boolean;
export declare function meanHoursFor(cell: string): number;
export declare function neighbourhood(
  h3: { gridDisk(c: string, k: number): string[]; gridDistance(a: string, b: string): number },
  centre: string,
  radius?: number,
): Record<string, string>;
export declare function areaFor(cell: string, lat: number, lng: number): Area & { cell: string; meanHours: number };
