// Catalog schema and validators (R10, ADR 0056). The catalog holds named places only, never user data (R10.4).
// The places are the 20 Lagos LGAs and their 376 wards from GRID3 (core/shared/fixtures/places/lagos-places.json).
import { isValidRes8Cell } from '@outage/shared';

/** The part of lagos-places.json the catalog reads. */
export type PlacesSource = {
  source: { name: string; url: string; licence: string };
  lgas: { slug: string; name: string; centreCell: string; wards: string[]; cells: string[] }[];
  wards: { slug: string; name: string; alt: string[]; lga: string; anchor: string; cells: string[] }[];
};

export type AreaKind = 'lga' | 'ward';

/** One entry of catalog.generated.json. No point coordinates, only cells. */
export type CatalogArea = {
  slug: string;
  /** An LGA is "Ikeja". A ward is "Ward, LGA", for example "Alade, Ikeja". */
  name: string;
  kind: AreaKind;
  /** Slug of the LGA a ward is in. Null for an LGA. */
  lga: string | null;
  /** Other names for the place, used by search only. */
  alt: string[];
  /** An LGA's middle hex, or a ward's anchor hex. */
  centreCell: string;
  tzOffsetMin: number;
  country: string;
  source: string;
  checkedBy: string;
  /** An LGA's hexes, or a ward's own hexes (just the anchor when the ward is smaller than a hex). */
  cells: string[];
};

export type Catalog = { areas: CatalogArea[] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHttps = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};
const allCells = (v: unknown): v is string[] => Array.isArray(v) && v.every((c) => isValidRes8Cell(c));

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

/** Returns a list of problems with the places file; empty means valid. */
export function validateCatalogSource(value: unknown): string[] {
  if (!isObj(value) || !Array.isArray(value.lgas) || !Array.isArray(value.wards)) return ['places must be { lgas: [...], wards: [...] }'];
  const errors: string[] = [];
  if (!isObj(value.source) || !isHttps(value.source.url)) errors.push('source.url must be an https URL');
  const lgaSlugs = new Set<string>();
  value.lgas.forEach((l, i) => {
    const where = `lgas[${i}]`;
    if (!isObj(l)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof l.slug !== 'string' || !SLUG.test(l.slug)) errors.push(`${where}: slug must be lowercase letters, digits and dashes`);
    else lgaSlugs.add(l.slug);
    if (typeof l.name !== 'string' || l.name.trim() === '') errors.push(`${where}: name is required`);
    if (!isValidRes8Cell(l.centreCell)) errors.push(`${where}: centreCell must be a valid res-8 cell`);
    if (!allCells(l.cells)) errors.push(`${where}: cells must be valid res-8 cells`);
  });
  value.wards.forEach((w, i) => {
    const where = `wards[${i}]`;
    if (!isObj(w)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof w.slug !== 'string' || !SLUG.test(w.slug)) errors.push(`${where}: slug must be lowercase letters, digits and dashes`);
    if (typeof w.name !== 'string' || w.name.trim() === '') errors.push(`${where}: name is required`);
    if (!Array.isArray(w.alt) || !w.alt.every((a) => typeof a === 'string')) errors.push(`${where}: alt must be a list of names`);
    if (typeof w.lga !== 'string' || !lgaSlugs.has(w.lga)) errors.push(`${where}: lga must be one of the LGAs`);
    if (!isValidRes8Cell(w.anchor)) errors.push(`${where}: anchor must be a valid res-8 cell`);
    if (!allCells(w.cells)) errors.push(`${where}: cells must be valid res-8 cells`);
  });
  return [...errors, ...duplicateSlugs([...value.lgas, ...value.wards])];
}

/** Returns a list of problems with the built catalog; empty means valid. */
export function validateCatalog(value: unknown): string[] {
  if (!isObj(value) || !Array.isArray(value.areas)) return ['catalog must be { areas: [...] }'];
  const errors: string[] = [];
  const lgaSlugs = new Set(value.areas.filter((a) => isObj(a) && a.kind === 'lga').map((a) => (a as Record<string, unknown>).slug));
  value.areas.forEach((a, i) => {
    const where = `areas[${i}]`;
    if (!isObj(a)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof a.slug !== 'string' || !SLUG.test(a.slug)) errors.push(`${where}: slug must be lowercase letters, digits and dashes`);
    if (typeof a.name !== 'string' || a.name.trim() === '') errors.push(`${where}: name is required`);
    if (a.kind !== 'lga' && a.kind !== 'ward') errors.push(`${where}: kind must be lga or ward`);
    if (a.kind === 'lga' && a.lga !== null) errors.push(`${where}: an LGA has no parent`);
    if (a.kind === 'ward' && !lgaSlugs.has(a.lga)) errors.push(`${where}: a ward needs an LGA from the catalog`);
    if (!Array.isArray(a.alt) || !a.alt.every((n) => typeof n === 'string')) errors.push(`${where}: alt must be a list of names`);
    if (!Number.isInteger(a.tzOffsetMin) || Math.abs(a.tzOffsetMin as number) > 14 * 60) errors.push(`${where}: tzOffsetMin must be an integer number of minutes within 14 hours`);
    if (typeof a.country !== 'string' || !/^[A-Z]{2}$/.test(a.country)) errors.push(`${where}: country must be a two-letter upper-case code`);
    if (!isHttps(a.source)) errors.push(`${where}: source must be an https URL`);
    if (typeof a.checkedBy !== 'string') errors.push(`${where}: checkedBy must be a string`);
    if (!isValidRes8Cell(a.centreCell)) errors.push(`${where}: centreCell must be a valid res-8 cell`);
    if (!allCells(a.cells) || a.cells.length === 0) errors.push(`${where}: cells must be valid res-8 cells`);
    else if (!a.cells.includes(a.centreCell as string)) errors.push(`${where}: cells must include the centre cell`);
    else if (new Set(a.cells).size !== a.cells.length) errors.push(`${where}: cells must be unique`);
  });
  return [...errors, ...duplicateSlugs(value.areas)];
}

/** Only areas a person has checked are listed (W7). Everything public reads the catalog through this. */
export function listedAreas(catalog: Catalog): CatalogArea[] {
  return catalog.areas.filter((a) => a.checkedBy.trim() !== '');
}

/** The 20 LGAs, in catalog order. */
export const lgasOf = (areas: readonly CatalogArea[]): CatalogArea[] => areas.filter((a) => a.kind === 'lga');

/** The wards of one LGA. */
export const wardsOf = (areas: readonly CatalogArea[], lgaSlug: string): CatalogArea[] => areas.filter((a) => a.lga === lgaSlug);
