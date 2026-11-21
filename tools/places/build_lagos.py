#!/usr/bin/env python3
"""Build the Lagos places dataset: 20 LGAs -> 376 wards -> H3 res-8 cells.

Source (CC BY-SA 4.0): GRID3 NGA Operational Wards v4.0, Lagos state file
  https://data.humdata.org/dataset/grid3-nga-operational-wards-v4-0
  (state_grid3_nga_operational_wards_v4_0.zip -> GRID3_NGA_Lagos_operational_wards_v4_0.gpkg)

Run:  pip install h3 shapely pyogrio
      python3 tools/places/build_lagos.py path/to/GRID3_NGA_Lagos_operational_wards_v4_0.gpkg

How the grid is drawn and how a person gets a cell (ADR 0056):
  * The grid is H3 resolution 8 (about 0.74 km2 per hex), the unit the server already groups phones by.
  * A hex belongs to the ward that contains its centre point. Every hex has exactly one ward, so exactly one LGA.
    Hexes whose centre is in the lagoon or the sea belong to no ward and are not offered.
  * Each ward has an anchor cell: its own hex nearest the ward's representative point. A small ward (35 of them,
    mostly on Lagos Island, Surulere, Shomolu, Mushin) owns no hex centre, so its anchor is the hex that contains
    its representative point, which belongs to a neighbouring ward. The build stops if that hex is more than 500 m
    from the ward (the widest of the 35 is 384 m).
  * A person picks LGA -> ward. If the ward has one cell (or none of its own) they get the anchor. If it has more,
    the app shows that ward's hexes on a street map with the anchor selected and the person can tap their street.

NIPOST digital postcodes (live 1 Oct 2026, LA-NN-DDD-AA-BB): the NN digits are the LGA, numbered alphabetically.
Checked on 2026-11-21 against postcode.gov.ng reverse lookups at two points in each LGA.

Outputs (generated, do not edit):
  core/shared/fixtures/places/lagos-places.json   LGAs, wards, cells and anchors (no geometry)
  core/shared/fixtures/places/lagos-geo.json      cell hex rings and simplified ward/LGA outlines for maps
"""
import collections, json, re, sys
from pathlib import Path

import h3
import pyogrio
from shapely import wkb
from shapely.geometry import mapping, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'core/shared/fixtures/places'
RES = 8
MAX_ANCHOR_M = 500  # about one hex edge (0.46 km); ADR 0056

# GRID3 LGA spelling -> (display name, NIPOST LGA number). NIPOST numbers the 20 LGAs alphabetically.
LGAS = {
    'Agege': ('Agege', '01'),
    'Ajeromi/Ifelodun': ('Ajeromi-Ifelodun', '02'),
    'Alimosho': ('Alimosho', '03'),
    'Amuwo Odofin': ('Amuwo-Odofin', '04'),
    'Apapa': ('Apapa', '05'),
    'Badagry': ('Badagry', '06'),
    'Epe': ('Epe', '07'),
    'Eti Osa': ('Eti-Osa', '08'),
    'Ibeju Lekki': ('Ibeju-Lekki', '09'),
    'Ifako/Ijaye': ('Ifako-Ijaiye', '10'),
    'Ikeja': ('Ikeja', '11'),
    'Ikorodu': ('Ikorodu', '12'),
    'Kosofe': ('Kosofe', '13'),
    'Lagos Island': ('Lagos Island', '14'),
    'Lagos Mainland': ('Lagos Mainland', '15'),
    'Mushin': ('Mushin', '16'),
    'Ojo': ('Ojo', '17'),
    'Oshodi/Isolo': ('Oshodi-Isolo', '18'),
    'Shomolu': ('Shomolu', '19'),
    'Surulere': ('Surulere', '20'),
}

SMALL = {'of', 'and'}


def tidy(name: str) -> str:
    """'OKE-IRA CENTRAL' / 'g.r.a.' -> 'Oke-Ira Central' / 'G.R.A.'; keeps slashes and dots."""
    name = re.sub(r'\s+', ' ', name.strip())
    name = re.sub(r'\s*/\s*', ' / ', name)
    def word(w):
        if re.fullmatch(r'([A-Za-z]\.)+', w):
            return w.upper()
        if w.lower() in SMALL:
            return w.lower()
        return '-'.join(p[:1].upper() + p[1:].lower() for p in w.split('-'))
    return ' '.join(word(w) for w in name.split(' '))


def slugify(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def alt_names(raw: str, name: str) -> list[str]:
    out = []
    for part in re.split(r'[,;]', raw or ''):
        p = tidy(re.sub(r'\(.*?\)', '', part))
        if p and p.lower() != name.lower() and p not in out:
            out.append(p)
    return out


def ring(cell: str) -> list[list[float]]:
    return [[round(lat, 5), round(lng, 5)] for lat, lng in h3.cell_to_boundary(cell)]


def outline(shape, tol=0.0004):
    s = shape.simplify(tol, preserve_topology=True)
    polys = list(s.geoms) if s.geom_type == 'MultiPolygon' else [s]
    # [[ [lat,lng], ... ]] outer rings only, rounded; tiny islands dropped
    return [[[round(y, 5), round(x, 5)] for x, y in p.exterior.coords] for p in polys if p.area > 2e-7 or len(polys) == 1]


def main(src: str):
    meta, _fid, geom, fields = pyogrio.raw.read(src)
    cols = dict(zip(meta['fields'], fields))
    wards = []
    for i, g in enumerate(geom):
        lga_raw = cols['lga'][i]
        if lga_raw not in LGAS:
            sys.exit(f'unknown LGA {lga_raw!r}')
        name = tidy(cols['ward'][i])
        wards.append({'lga_raw': lga_raw, 'name': name, 'alt': alt_names(cols['ward_alt_names'][i], name), 'shape': wkb.loads(g)})

    owner: dict[str, int] = {}
    for wi, w in enumerate(wards):
        shp = w['shape']
        cells = set()
        for p in (shp.geoms if shp.geom_type == 'MultiPolygon' else [shp]):
            cells |= set(h3.geo_to_cells(mapping(p), RES))
        for c in cells:
            if c in owner:
                sys.exit(f'cell {c} in two wards')
            owner[c] = wi
        w['cells'] = cells

    lga_slugs = {raw: slugify(disp) for raw, (disp, _n) in LGAS.items()}
    used = set()
    for w in wards:
        base = f"{lga_slugs[w['lga_raw']]}-{slugify(w['name'])}"
        slug, k = base, 2
        while slug in used:
            slug, k = f'{base}-{k}', k + 1
        used.add(slug)
        w['slug'] = slug
        rp = w['shape'].representative_point()
        here = h3.latlng_to_cell(rp.y, rp.x, RES)
        if w['cells']:
            # own hex nearest the representative point
            w['anchor'] = min(sorted(w['cells']), key=lambda c: h3.grid_distance(c, here) if h3.is_valid_cell(here) else 0)
        else:
            # No hex of its own: the anchor is the hex that holds its representative point. That hex must be land
            # (some ward owns it) and its centre must be within MAX_ANCHOR_M of the ward, so a big rural ward can never
            # be anchored far away. Measured 2026-11-21: all 35 are within 400 m. Anything wider stops the build.
            if here not in owner:
                # the point sits where the hex centre is water: take the nearest land hex, still checked below
                here = min(owner, key=lambda c: Point(h3.cell_to_latlng(c)[::-1]).distance(rp))
            lat, lng = h3.cell_to_latlng(here)
            gap = w['shape'].distance(Point(lng, lat)) * 111000
            if gap > MAX_ANCHOR_M:
                sys.exit(f"{w['slug']}: anchor is {gap:.0f} m from the ward, more than {MAX_ANCHOR_M} m")
            w['anchor'] = here

    lgas_out = []
    for raw, (disp, num) in LGAS.items():
        ws = sorted((w for w in wards if w['lga_raw'] == raw), key=lambda w: w['name'])
        cells = sorted(c for w in ws for c in w['cells'])
        union = unary_union([w['shape'] for w in ws])
        rp = union.representative_point()
        centre = h3.latlng_to_cell(rp.y, rp.x, RES)
        if centre not in cells:
            centre = min(cells, key=lambda c: Point(h3.cell_to_latlng(c)[::-1]).distance(rp))
        lgas_out.append({'slug': lga_slugs[raw], 'name': disp, 'nipost': num, 'centreCell': centre,
                         'wards': [w['slug'] for w in ws], 'cells': cells, '_union': union})

    places = {
        'version': 1,
        'state': 'Lagos',
        'resolution': RES,
        'source': {
            'name': 'GRID3 NGA Operational Wards v4.0',
            'url': 'https://data.humdata.org/dataset/grid3-nga-operational-wards-v4-0',
            'licence': 'CC BY-SA 4.0',
            'attribution': 'Ward and LGA boundaries: GRID3 (Geo-Referenced Infrastructure and Demographic Data for Development), CC BY-SA 4.0',
        },
        'nipost': {'state': 'LA', 'finder': 'https://postcode.gov.ng/find', 'checked': '2026-11-21'},
        'lgas': [{k: v for k, v in l.items() if not k.startswith('_')} for l in lgas_out],
        'wards': [{'slug': w['slug'], 'name': w['name'], 'alt': w['alt'], 'lga': lga_slugs[w['lga_raw']],
                   'anchor': w['anchor'], 'cells': sorted(w['cells'])} for w in sorted(wards, key=lambda w: w['slug'])],
    }
    geo = {
        'version': 1,
        'attribution': places['source']['attribution'],
        'cells': {c: ring(c) for c in sorted(owner)},
        'lgas': {l['slug']: outline(l['_union'], 0.0006) for l in lgas_out},
        'wards': {w['slug']: outline(w['shape']) for w in sorted(wards, key=lambda w: w['slug'])},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'lagos-places.json').write_text(json.dumps(places, separators=(',', ':'), ensure_ascii=False) + '\n')
    (OUT / 'lagos-geo.json').write_text(json.dumps(geo, separators=(',', ':')) + '\n')
    small = sum(1 for w in wards if not w['cells'])
    print(f"{len(lgas_out)} LGAs, {len(wards)} wards ({small} without a hex of their own), {len(owner)} cells")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'GRID3_NGA_Lagos_operational_wards_v4_0.gpkg')
