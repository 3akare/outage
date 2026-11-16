// Catalog schema and validators (R10). The catalog holds named areas only, never user data (R10.4).
// A person must check each centre before the area is listed: `checkedBy` non-empty (R10.3, W7).
import { isValidRes8Cell } from '@outage/shared';

/** One entry of catalog.source.json. The centre is a point from a cited open source, turned into a res-8 cell by the generator. */
export type CatalogSourceArea = {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  rings: number;
  tzOffsetMin: number;
  country: string;
  source: string; // URL that was read to find the centre
  checkedBy: string; // person and date; empty until a person has checked the centre
};

export type CatalogSource = { areas: CatalogSourceArea[] };

/** One entry of catalog.generated.json (design section 10). No point coordinates, only cells. */
export type CatalogArea = {
  slug: string;
  name: string;
  centreCell: string;
  rings: number;
  tzOffsetMin: number;
  country: string;
  source: string;
  checkedBy: string;
  cells: string[]; // gridDisk(centreCell, rings)
};

export type Catalog = { areas: CatalogArea[] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_RINGS = 6;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHttps = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

function commonErrors(a: Record<string, unknown>, where: string): string[] {
  const e: string[] = [];
  if (typeof a.slug !== 'string' || !SLUG.test(a.slug)) e.push(`${where}: slug must be lowercase letters, digits and dashes`);
  if (typeof a.name !== 'string' || a.name.trim() === '') e.push(`${where}: name is required`);
  if (!Number.isInteger(a.rings) || (a.rings as number) < 0 || (a.rings as number) > MAX_RINGS) e.push(`${where}: rings must be an integer 0 to ${MAX_RINGS}`);
  if (!Number.isInteger(a.tzOffsetMin) || Math.abs(a.tzOffsetMin as number) > 14 * 60) e.push(`${where}: tzOffsetMin must be an integer number of minutes within 14 hours`);
  if (typeof a.country !== 'string' || !/^[A-Z]{2}$/.test(a.country)) e.push(`${where}: country must be a two-letter upper-case code`);
  if (!isHttps(a.source)) e.push(`${where}: source must be an https URL that was read to find the centre`);
  if (typeof a.checkedBy !== 'string') e.push(`${where}: checkedBy must be a string (empty until a person has checked)`);
  return e;
}

function duplicateSlugs(areas: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of areas) {
    const slug = isObj(a) && typeof a.slug === 'string' ? a.slug : null;
    if (slug === null) continue;
    if (seen.has(slug)) out.push(`duplicate slug: ${slug}`);
    seen.add(slug);
  }
  return out;
}

/** Returns a list of problems; empty means valid. */
export function validateCatalogSource(value: unknown): string[] {
  if (!isObj(value) || !Array.isArray(value.areas)) return ['catalog source must be { areas: [...] }'];
  const errors: string[] = [];
  value.areas.forEach((a, i) => {
    const where = `areas[${i}]`;
    if (!isObj(a)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    errors.push(...commonErrors(a, where));
    if (typeof a.lat !== 'number' || !(a.lat >= -90 && a.lat <= 90)) errors.push(`${where}: lat must be a number within -90 and 90`);
    if (typeof a.lng !== 'number' || !(a.lng >= -180 && a.lng <= 180)) errors.push(`${where}: lng must be a number within -180 and 180`);
  });
  return [...errors, ...duplicateSlugs(value.areas)];
}

/** Returns a list of problems; empty means valid. */
export function validateCatalog(value: unknown): string[] {
  if (!isObj(value) || !Array.isArray(value.areas)) return ['catalog must be { areas: [...] }'];
  const errors: string[] = [];
  value.areas.forEach((a, i) => {
    const where = `areas[${i}]`;
    if (!isObj(a)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    errors.push(...commonErrors(a, where));
    if (!isValidRes8Cell(a.centreCell)) errors.push(`${where}: centreCell must be a valid res-8 cell`);
    if (!Array.isArray(a.cells) || !a.cells.every((c) => isValidRes8Cell(c))) errors.push(`${where}: cells must be valid res-8 cells`);
    else if (!(a.cells as unknown[]).includes(a.centreCell)) errors.push(`${where}: cells must include the centre cell`);
    else if (new Set(a.cells).size !== a.cells.length) errors.push(`${where}: cells must be unique`);
  });
  return [...errors, ...duplicateSlugs(value.areas)];
}

/** Only areas a person has checked are listed (W7). Everything public reads the catalog through this. */
export function listedAreas(catalog: Catalog): CatalogArea[] {
  return catalog.areas.filter((a) => a.checkedBy.trim() !== '');
}
