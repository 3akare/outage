import { describe, expect, it } from 'vitest';
import places from '@outage/shared/fixtures/places/lagos-places.json' with { type: 'json' };
import geo from '@outage/shared/fixtures/places/lagos-geo.json' with { type: 'json' };
import { buildCatalog, buildOutlines } from '../areas/catalog/build.ts';
import { CATALOG, findArea, LGA_OUTLINES, LISTED_AREAS } from '../areas/catalog/index.ts';
import { type PlacesSource, listedAreas, lgasOf, validateCatalog, validateCatalogSource, wardsOf } from '../areas/catalog/schema.ts';
import { searchAreas } from '../areas/catalog/search.ts';

const source = places as unknown as PlacesSource;

describe('W7 catalog (ADR 0056)', () => {
  it('W7_source_is_valid_and_cites_grid3', () => {
    expect(validateCatalogSource(source)).toEqual([]);
    expect(source.source.url).toMatch(/^https:\/\//);
  });

  it('W7_generated_files_are_current_with_the_places_file', () => {
    expect(CATALOG).toEqual(buildCatalog(source));
    expect(validateCatalog(CATALOG)).toEqual([]);
    expect(LGA_OUTLINES).toEqual(buildOutlines(geo as never, source));
  });

  it('W7_has_20_lgas_and_376_wards_all_listed', () => {
    expect(lgasOf(CATALOG.areas)).toHaveLength(20);
    expect(CATALOG.areas.filter((a) => a.kind === 'ward')).toHaveLength(376);
    expect(LISTED_AREAS).toHaveLength(396);
    expect(findArea('ikeja')?.name).toBe('Ikeja');
    expect(findArea('ikeja-alade')?.name).toBe('Alade, Ikeja');
    expect(findArea('nope')).toBeUndefined();
  });

  it('W7_lgas_cover_all_4968_hexes_once_and_each_ward_belongs_to_one_lga', () => {
    const cells = lgasOf(CATALOG.areas).flatMap((a) => a.cells);
    expect(cells).toHaveLength(4968);
    expect(new Set(cells).size).toBe(4968);
    for (const lga of lgasOf(CATALOG.areas)) {
      expect(lga.cells[0]).toBe(lga.centreCell);
      for (const w of wardsOf(CATALOG.areas, lga.slug)) {
        expect(w.name.endsWith(`, ${lga.name}`)).toBe(true);
        expect(w.cells[0]).toBe(w.centreCell);
        expect(w.country).toBe('NG');
      }
    }
    expect(wardsOf(CATALOG.areas, 'ikeja')).toHaveLength(places.lgas.find((l) => l.slug === 'ikeja')?.wards.length ?? -1);
  });

  it('W7_a_ward_smaller_than_a_hex_uses_its_anchor_hex', () => {
    const small = places.wards.filter((w) => w.cells.length === 0);
    expect(small.length).toBeGreaterThan(0);
    for (const w of small) expect(findArea(w.slug)?.cells).toEqual([w.anchor]);
  });

  it('W7_generated_file_holds_no_point_coordinates_or_user_data', () => {
    expect(JSON.stringify(CATALOG)).not.toMatch(/"(lat|lng)"/);
  });

  it('W7_listed_areas_are_exactly_those_with_checked_by_set', () => {
    const catalog = buildCatalog(source);
    const edited = { areas: catalog.areas.map((a, i) => ({ ...a, checkedBy: i % 2 === 0 ? 'Someone 2026-11-20' : i % 3 === 0 ? '   ' : '' })) };
    expect(listedAreas(edited).map((a) => a.slug)).toEqual(catalog.areas.filter((_, i) => i % 2 === 0).map((a) => a.slug));
  });

  it('W7_validators_reject_bad_entries', () => {
    expect(validateCatalogSource('x')).not.toEqual([]);
    expect(validateCatalogSource({ ...source, source: { ...source.source, url: 'http://plain' } })).not.toEqual([]);
    const bad = { ...source, wards: [{ ...(source.wards[0] as object), lga: 'nowhere' }, ...source.wards.slice(1)] };
    expect(validateCatalogSource(bad)).not.toEqual([]);
    expect(validateCatalogSource({ ...source, wards: [...source.wards, source.wards[0]] })).toContain(`duplicate slug: ${source.wards[0]?.slug}`);
    const lga = CATALOG.areas[0] as (typeof CATALOG.areas)[number];
    expect(validateCatalog({ areas: [{ ...lga, centreCell: 'zzz' }] })).not.toEqual([]);
    expect(validateCatalog({ areas: [{ ...lga, cells: lga.cells.slice(1) }] })).not.toEqual([]);
    expect(validateCatalog({ areas: [{ ...lga, slug: 'Bad Slug' }] })).not.toEqual([]);
    expect(validateCatalog({ areas: [{ ...lga, kind: 'ward', lga: 'nowhere' }] })).not.toEqual([]);
  });
});

describe('search by LGA or ward name', () => {
  const names = (q: string) => searchAreas(CATALOG.areas, q).map((a) => a.name);

  it('finds an LGA by name, ignoring case and punctuation', () => {
    expect(names('ikeja')[0]).toBe('Ikeja');
    expect(names('  AJEROMI ifelodun ')[0]).toBe('Ajeromi-Ifelodun');
    expect(names('eti osa')[0]).toBe('Eti-Osa');
  });

  it('finds a ward by name, with its LGA in the name', () => {
    expect(names('alade')).toContain('Alade, Ikeja');
    expect(names('Alade Ikeja')[0]).toBe('Alade, Ikeja');
  });

  it('finds a ward by an alternative name', () => {
    const w = places.wards.find((x) => x.alt.length > 0);
    if (!w) throw new Error('no ward with another name');
    expect(searchAreas(CATALOG.areas, w.alt[0] as string).map((a) => a.slug)).toContain(w.slug);
  });

  it('puts LGAs before wards and returns nothing for an empty or unknown query', () => {
    expect(searchAreas(CATALOG.areas, 'ikeja')[0]?.kind).toBe('lga');
    expect(searchAreas(CATALOG.areas, '   ')).toEqual([]);
    expect(searchAreas(CATALOG.areas, 'zzzzqqq')).toEqual([]);
    expect(searchAreas(CATALOG.areas, 'a', 5).length).toBeLessThanOrEqual(5);
  });
});
