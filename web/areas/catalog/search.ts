// Find places by name (ADR 0056). Matches an LGA or ward name, or a ward's other names, ignoring case, accents and punctuation.
import type { CatalogArea } from './schema.ts';

export const MAX_QUERY = 60;

/** Lower case, accents removed, anything that is not a letter or digit becomes one space. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Places whose name or other name contains every word of the query. Names that start with the query come first, LGAs before wards. */
export function searchAreas(areas: readonly CatalogArea[], query: string, limit = 20): CatalogArea[] {
  const words = fold(query.slice(0, MAX_QUERY)).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const scored: { area: CatalogArea; rank: number; i: number }[] = [];
  areas.forEach((area, i) => {
    let best = Infinity;
    for (const name of [area.name, ...area.alt]) {
      const f = fold(name);
      if (!words.every((w) => f.includes(w))) continue;
      best = Math.min(best, f.startsWith(words.join(' ')) ? 0 : 1);
    }
    if (best !== Infinity) scored.push({ area, rank: best * 2 + (area.kind === 'lga' ? 0 : 1), i });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, limit).map((s) => s.area);
}
