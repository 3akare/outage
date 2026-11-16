// Types for data.js, so the Worker's tests can import it with the TypeScript checker on.
export type City = {
  historyWeeks: number;
  bands: Record<string, number>;
  areas: Area[];
};
export type Area = { slug: string; name: string; band: string; outages: [number, number, number][] };
export declare const DAY_MIN: number;
export declare function weekday(date: Date): number;
export declare function calendar(city: City, today: Date): { last: number; yesterday: Date; dateOf(i: number): Date };
export declare function offByDay(area: Area, days: number): number[];
export declare function dailyHours(city: City, area: Area, today: Date, n?: number): { date: Date; hours: number }[];
export declare function outagesIn(city: City, area: Area, today: Date, n?: number): { start: Date; minutes: number }[];
export declare function median(values: number[]): number;
export declare function summary(
  city: City,
  area: Area,
  today: Date,
  n?: number,
): {
  band: string;
  promise: number;
  avgHours: number;
  daysBelow: number;
  days: number;
  outages: number;
  medianMinutes: number;
  longestMinutes: number;
  offHours: number;
};
export declare function heat(city: City, area: Area, today: Date, n?: number): number[][];
export declare function worstHours(grid: number[][], width?: number): { from: number; to: number; share: number };
export declare function ranking(
  city: City,
  today: Date,
  n: number,
): { slug: string; name: string; band: string; promise: number; avgHours: number; outages: number }[];
export declare function weekly(city: City, area: Area, today: Date, weeks?: number): { from: Date; to: Date; offHours: number }[];
export declare function duration(minutes: number): string;
export declare function hourLabel(h: number): string;
