import { describe, expect, it } from 'vitest';
import sourceJson from '../src/web/catalog/catalog.source.json' with { type: 'json' };
import { buildCatalog } from '../src/web/catalog/build.ts';
import { CATALOG, findArea, LISTED_AREAS } from '../src/web/catalog/index.ts';
import { type CatalogSource, listedAreas, validateCatalog, validateCatalogSource } from '../src/web/catalog/schema.ts';

const source = sourceJson as CatalogSource;

describe('W7 catalog', () => {
  it('W7_source_is_valid_and_every_entry_cites_a_source', () => {
    expect(validateCatalogSource(source)).toEqual([]);
    for (const a of source.areas) expect(a.source).toMatch(/^https:\/\//);
  });

  it('W7_generated_catalog_is_current_with_the_source', () => {
    expect(CATALOG).toEqual(buildCatalog(source));
    expect(validateCatalog(CATALOG)).toEqual([]);
  });

  it('W7_no_area_is_listed_until_a_person_has_checked_it', () => {
    for (const a of source.areas) expect(a.checkedBy).toBe('');
    expect(LISTED_AREAS).toEqual([]);
    expect(findArea('yaba')).toBeUndefined();
  });

  it('W7_listed_areas_are_exactly_those_with_checked_by_set', () => {
    const catalog = buildCatalog({ areas: source.areas.map((a, i) => ({ ...a, checkedBy: i % 2 === 0 ? 'Someone 2026-11-20' : i % 3 === 0 ? '   ' : '' })) });
    const expected = source.areas.filter((_, i) => i % 2 === 0).map((a) => a.slug);
    expect(listedAreas(catalog).map((a) => a.slug)).toEqual(expected);
  });

  it('W7_each_area_has_centre_plus_ring_cells_and_the_starting_lagos_list', () => {
    for (const a of CATALOG.areas) {
      expect(a.cells[0]).toBe(a.centreCell);
      expect(a.cells).toHaveLength(1 + 3 * a.rings * (a.rings + 1)); // hex disk size, no pentagon in Lagos
      expect(a.country).toBe('NG');
    }
    expect(CATALOG.areas.map((a) => a.slug)).toEqual(['yaba', 'surulere', 'ikeja', 'maryland', 'victoria-island', 'ikoyi', 'ajah', 'ikorodu', 'festac']);
  });

  it('W7_generated_file_holds_no_point_coordinates_or_user_data', () => {
    const text = JSON.stringify(CATALOG);
    expect(text).not.toMatch(/"(lat|lng)"/);
  });

  it('W7_validator_rejects_bad_entries', () => {
    const good = source.areas[0] as CatalogSource['areas'][number];
    expect(validateCatalogSource({ areas: [{ ...good, slug: 'Bad Slug' }] })).not.toEqual([]);
    expect(validateCatalogSource({ areas: [{ ...good, source: 'http://plain' }] })).not.toEqual([]);
    expect(validateCatalogSource({ areas: [{ ...good, source: '' }] })).not.toEqual([]);
    expect(validateCatalogSource({ areas: [{ ...good, rings: 99 }] })).not.toEqual([]);
    expect(validateCatalogSource({ areas: [{ ...good, lat: 123 }] })).not.toEqual([]);
    expect(validateCatalogSource({ areas: [{ ...good, checkedBy: undefined }] })).not.toEqual([]);
    expect(validateCatalogSource({ areas: [good, good] })).toContain('duplicate slug: yaba');
    expect(validateCatalogSource('x')).not.toEqual([]);
    const gen = CATALOG.areas[0] as (typeof CATALOG.areas)[number];
    expect(validateCatalog({ areas: [{ ...gen, centreCell: 'zzz' }] })).not.toEqual([]);
    expect(validateCatalog({ areas: [{ ...gen, cells: gen.cells.slice(1) }] })).not.toEqual([]);
  });
});
