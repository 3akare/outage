import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../areas/catalog/build.ts';
import { cellStates, renderMap } from '../areas/map-svg.ts';
import { renderHomePage } from '../areas/pages.ts';
import { AREAS, cellView, confirmedNow, IKEJA, NOW, parentView, SITE, YABA } from './web-helpers.ts';

const countOf = (s: string, sub: string) => s.split(sub).length - 1;

describe('map renderer (R5)', () => {
  it('map_draws_one_path_per_catalog_cell_and_one_label_per_area', () => {
    const svg = renderMap(AREAS, cellStates(AREAS, [], NOW));
    expect(countOf(svg, '<path ')).toBe(YABA.cells.length + IKEJA.cells.length);
    expect(countOf(svg, '<text ')).toBe(2);
    expect(svg).toContain('>Yaba</text>');
    expect(svg).toContain('>Ikeja</text>');
    expect(svg).toContain('class="none"');
  });

  it('map_colours_cells_by_state_and_carries_text_titles', () => {
    const views = [cellView(YABA.cells[0] as string, confirmedNow()), cellView(YABA.cells[1] as string, { status: 'POSSIBLE' })];
    const svg = renderMap(AREAS, cellStates(AREAS, views, NOW));
    expect(countOf(svg, 'data-state="CONFIRMED"')).toBe(1);
    expect(countOf(svg, 'data-state="POSSIBLE"')).toBe(1);
    expect(svg).toContain('<title>Yaba: Power cut</title>');
    expect(svg).toContain('<title>Yaba: Possible power cut</title>');
    expect(svg).toContain('<title>Ikeja: no phones here yet</title>');
  });

  it('map_draws_the_boundary_of_the_scope_used_not_a_smaller_part', () => {
    const states = cellStates(AREAS, [parentView(YABA.cells[0] as string, { status: 'CONFIRMED', ...confirmedNow() })], NOW);
    const coloured = [...states.entries()].filter(([, s]) => s === 'CONFIRMED').map(([c]) => c);
    expect(coloured.length).toBeGreaterThan(1); // all catalog cells under the parent, not only one
    expect(coloured.every((c) => YABA.cells.includes(c) || IKEJA.cells.includes(c))).toBe(true);
  });

  it('map_never_draws_a_cell_outside_the_catalog', () => {
    const outside = cellView('88a5a8c4a1fffff', confirmedNow());
    const only = renderMap([YABA], cellStates([YABA], [outside], NOW));
    expect(countOf(only, '<path ')).toBe(YABA.cells.length);
    expect(only).not.toContain('88a5a8c4a1fffff');
  });

  it('map_overlapping_areas_draw_each_cell_once', () => {
    const twin = { ...YABA, slug: 'yaba-twin', name: 'Yaba Twin' };
    const svg = renderMap([YABA, twin], cellStates([YABA, twin], [], NOW));
    expect(countOf(svg, '<path ')).toBe(YABA.cells.length);
  });

  it('map_is_empty_for_no_areas_and_needs_no_outside_service', () => {
    expect(renderMap([], new Map())).toBe('');
    const svg = renderMap(AREAS, new Map());
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('style=');
  });

  it('map_escapes_area_names', () => {
    const evil = { ...YABA, name: '<script>x</script>', slug: 'y"z' };
    const svg = renderMap([evil], new Map());
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('y"z');
  });

  it('map_snapshot_single_cell_area', () => {
    const one = buildCatalog({ areas: [{ slug: 'tiny', name: 'Tiny', lat: 6.5068, lng: 3.3755, rings: 0, tzOffsetMin: 60, country: 'NG', source: 'https://example.test', checkedBy: 'x' }] }).areas[0];
    if (!one) throw new Error('no area');
    const svg = renderMap([one], new Map([[one.centreCell, 'CONFIRMED']]));
    expect(svg).toMatchInlineSnapshot(`"<svg class="map" role="group" aria-label="Map of areas with their power status. The list below has the same information." viewBox="0 0 1000 970" xmlns="http://www.w3.org/2000/svg"><a href="/area/tiny"><path d="M138 130.7L40 575.8L402 930.1L862 839.4L960 394.4L598 40Z" data-state="CONFIRMED"><title>Tiny: Power cut</title></path></a><text x="500" y="469.1" text-anchor="middle" aria-hidden="true">Tiny</text></svg>"`);
  });

  it('map_home_page_contains_the_map_and_a_text_list_alternative', () => {
    const out = renderHomePage({ site: SITE, areas: AREAS, views: [], nowMs: NOW }).body;
    expect(out).toContain('aria-label="Map of areas');
    expect(out).toContain('<h2>Areas</h2><ul class="plain">');
  });
});
