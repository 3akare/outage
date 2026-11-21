import { describe, expect, it } from 'vitest';
import { LGA_OUTLINES } from '../areas/catalog/index.ts';
import { areaStates, renderMap } from '../areas/map-svg.ts';
import { renderHomePage } from '../areas/pages.ts';
import { AREAS, cellView, confirmedNow, IKEJA, MAINLAND, NOW, parentView, SITE } from './web-helpers.ts';

const countOf = (s: string, sub: string) => s.split(sub).length - 1;
const draw = (areas: typeof AREAS, views: Parameters<typeof areaStates>[1] = []) =>
  renderMap(areas, LGA_OUTLINES, areaStates(areas, views, NOW));

describe('map renderer (R5, ADR 0056)', () => {
  it('map_draws_one_outline_per_lga_and_one_label_per_lga_not_one_per_hex', () => {
    const svg = draw(AREAS);
    expect(countOf(svg, '<path ')).toBe(3); // two LGA outlines and the hex grid
    expect(countOf(svg, '<path class="grid"')).toBe(1);
    expect(countOf(svg, '<text ')).toBe(2);
    expect(svg).toContain('>Lagos Mainland</text>');
    expect(svg).toContain('>Ikeja</text>');
    expect(svg).toContain('class="none"');
  });

  it('map_colours_lgas_by_state_and_is_decorative', () => {
    const views = [
      cellView(MAINLAND.cells[0] as string, confirmedNow()),
      cellView(MAINLAND.cells[1] as string, { status: 'POSSIBLE' }),
    ];
    const svg = draw(AREAS, views);
    expect(countOf(svg, 'data-state="CONFIRMED"')).toBe(1); // the worst state in the LGA wins
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('<a ');
  });

  it('map_colours_an_lga_from_a_parent_scope_view_over_its_cells', () => {
    const states = areaStates(
      AREAS,
      [parentView(MAINLAND.cells[0] as string, { status: 'CONFIRMED', ...confirmedNow() })],
      NOW,
    );
    expect(states.get('lagos-mainland')).toBe('CONFIRMED');
    expect(states.get('ikeja')).toBeNull();
  });

  it('map_never_colours_an_lga_from_a_cell_outside_it', () => {
    const outside = cellView('88a5a8c4a1fffff', confirmedNow());
    const svg = draw([MAINLAND], [outside]);
    expect(svg).toContain('class="none"');
    expect(svg).not.toContain('88a5a8c4a1fffff');
  });

  it('map_has_an_outline_for_every_lga_and_each_is_small', () => {
    expect(Object.keys(LGA_OUTLINES)).toHaveLength(20);
    for (const poly of Object.values(LGA_OUTLINES)) expect(poly.length).toBeGreaterThan(0);
    expect(draw(AREAS).length).toBeLessThan(40_000);
  });

  it('map_is_empty_for_no_areas_and_needs_no_outside_service', () => {
    expect(renderMap([], LGA_OUTLINES, new Map())).toBe('');
    const svg = draw(AREAS);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('style=');
  });

  it('map_escapes_area_names', () => {
    const evil = { ...IKEJA, name: '<script>x</script>', slug: 'ikeja' };
    const svg = draw([evil]);
    expect(svg).not.toContain('<script');
  });

  it('map_home_page_contains_the_map_and_a_text_list_alternative', () => {
    const out = renderHomePage({ site: SITE, areas: AREAS, views: [], nowMs: NOW }).body;
    expect(out).toContain('<svg class="map" aria-hidden="true"');
    expect(out).toContain('<h2>Local governments</h2><ul class="plain">');
  });
});
