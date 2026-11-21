// Types for data.js, so the Worker's tests can import it with the TypeScript checker on.
export type City = {
  historyWeeks: number;
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
  avgHours: number;
  days: number;
  outages: number;
  medianMinutes: number;
  longestMinutes: number;
  offHours: number;
};
export declare function duration(minutes: number): string;
