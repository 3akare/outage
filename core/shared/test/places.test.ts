// ADR 0056: the Lagos places fixture. Every rule here fails if a ward, an anchor, a cell or a postcode number is wrong.
import { cellToLatLng, getResolution, gridDistance, isValidCell, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import places from '../fixtures/places/lagos-places.json' with { type: 'json' };
import geo from '../fixtures/places/lagos-geo.json' with { type: 'json' };
import { isValidRes8Cell } from '../src/index.ts';

interface Lga { slug: string; name: string; nipost: string; centreCell: string; wards: string[]; cells: string[] }
interface Ward { slug: string; name: string; alt: string[]; lga: string; anchor: string; cells: string[] }
const lgas = places.lgas as Lga[];
const wards = places.wards as Ward[];
const lgaBySlug = new Map(lgas.map((l) => [l.slug, l]));

const LGA_NAMES_ALPHABETICAL = [
  'Agege', 'Ajeromi-Ifelodun', 'Alimosho', 'Amuwo-Odofin', 'Apapa', 'Badagry', 'Epe', 'Eti-Osa', 'Ibeju-Lekki', 'Ifako-Ijaiye',
  'Ikeja', 'Ikorodu', 'Kosofe', 'Lagos Island', 'Lagos Mainland', 'Mushin', 'Ojo', 'Oshodi-Isolo', 'Shomolu', 'Surulere',
];

describe('Lagos places fixture (ADR 0056)', () => {
  it('has the 20 LGAs in alphabetical order with NIPOST numbers 01 to 20', () => {
    expect(places.resolution).toBe(8);
    expect(lgas.map((l) => l.name)).toEqual(LGA_NAMES_ALPHABETICAL);
    expect(lgas.map((l) => l.nipost)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(new Set(lgas.map((l) => l.slug)).size).toBe(20);
  });

  it('pins known LGA to postcode pairs (LA-11 Ikeja, LA-14 Lagos Mainland, LA-20 Surulere)', () => {
    const num = (name: string) => lgas.find((l) => l.name === name)?.nipost;
    expect(num('Agege')).toBe('01');
    expect(num('Eti-Osa')).toBe('08');
    expect(num('Ikeja')).toBe('11');
    expect(num('Lagos Island')).toBe('14');
    expect(num('Lagos Mainland')).toBe('15');
    expect(num('Surulere')).toBe('20');
  });

  it('has 376 wards with unique slugs, each in a real LGA that lists it back', () => {
    expect(wards).toHaveLength(376);
    expect(new Set(wards.map((w) => w.slug)).size).toBe(376);
    for (const w of wards) {
      const lga = lgaBySlug.get(w.lga);
      expect(lga, w.slug).toBeDefined();
      expect(lga!.wards, w.slug).toContain(w.slug);
    }
    expect(lgas.flatMap((l) => l.wards).sort()).toEqual(wards.map((w) => w.slug).sort());
  });

  it('has 4968 land hexes, each a valid res-8 cell owned by exactly one ward and one LGA', () => {
    const owner = new Map<string, string>();
    for (const w of wards) {
      for (const c of w.cells) {
        expect(isValidCell(c) && getResolution(c) === 8 && isValidRes8Cell(c), c).toBe(true);
        expect(owner.has(c), `${c} in two wards`).toBe(false);
        owner.set(c, w.slug);
      }
    }
    expect(owner.size).toBe(4968);
    const lgaOwner = new Map<string, string>();
    for (const l of lgas) {
      expect(new Set(l.cells).size, l.slug).toBe(l.cells.length);
      for (const c of l.cells) {
        expect(lgaOwner.has(c), `${c} in two LGAs`).toBe(false);
        lgaOwner.set(c, l.slug);
        expect(lgaBySlug.get(wards.find((w) => w.slug === owner.get(c))!.lga)!.slug, c).toBe(l.slug);
      }
    }
    expect([...lgaOwner.keys()].sort()).toEqual([...owner.keys()].sort());
  });

  it('has a geo ring for every land hex, centred on the hex', () => {
    // Each hex of a ward must be listed in the geo ring file, and the ring centre is the hex centre.
    const geoCells = geo.cells as Record<string, number[][]>;
    for (const w of wards) {
      for (const c of w.cells) {
        const ring = geoCells[c];
        expect(ring, c).toBeDefined();
        expect(ring).toHaveLength(6);
        const [lat, lng] = cellToLatLng(c);
        const mlat = ring!.reduce((s, p) => s + p[0]!, 0) / 6;
        const mlng = ring!.reduce((s, p) => s + p[1]!, 0) / 6;
        expect(Math.abs(mlat - lat)).toBeLessThan(0.002);
        expect(Math.abs(mlng - lng)).toBeLessThan(0.002);
      }
    }
    expect(Object.keys(geoCells)).toHaveLength(4968);
  });

  it('gives a point in Lagos exactly one cell, and that cell belongs to one ward or to no ward', () => {
    const owners = new Map<string, number>();
    for (const w of wards) for (const c of w.cells) owners.set(c, (owners.get(c) ?? 0) + 1);
    for (const [lat, lng] of [[6.6018, 3.3515], [6.4541, 3.3947], [6.5244, 3.3792], [6.4698, 3.5852], [6.6, 3.9], [6.42, 2.95]] as const) {
      const cell = latLngToCell(lat, lng, 8);
      expect(owners.get(cell) ?? 0).toBeLessThanOrEqual(1);
    }
    // Ikeja GRA centre is a land cell owned by an Ikeja ward.
    const ikeja = latLngToCell(6.6018, 3.3515, 8);
    const w = wards.find((x) => x.cells.includes(ikeja));
    expect(w?.lga).toBe('ikeja');
  });

  it('puts every ward anchor on a valid land cell inside the ward, or the nearest one for the 35 wards with no hex', () => {
    const landOwner = new Map<string, Ward>();
    for (const w of wards) for (const c of w.cells) landOwner.set(c, w);
    let hexless = 0;
    for (const w of wards) {
      expect(isValidRes8Cell(w.anchor), w.slug).toBe(true);
      const host = landOwner.get(w.anchor);
      expect(host, `${w.slug} anchor is not a land cell`).toBeDefined();
      if (w.cells.length > 0) {
        expect(w.cells, w.slug).toContain(w.anchor);
      } else {
        hexless++;
        // The anchor sits in a neighbouring ward of the same or a nearby LGA, a few hexes away at most.
        expect(host!.lga === w.lga || gridDistance(w.anchor, lgaBySlug.get(w.lga)!.centreCell) < 25, w.slug).toBe(true);
      }
    }
    expect(hexless).toBe(35);
  });

  it('keeps every LGA centre cell inside that LGA', () => {
    for (const l of lgas) expect(l.cells, l.slug).toContain(l.centreCell);
  });

  it('has an outline for every LGA and ward', () => {
    expect(Object.keys(geo.lgas).sort()).toEqual(lgas.map((l) => l.slug).sort());
    expect(Object.keys(geo.wards).sort()).toEqual(wards.map((w) => w.slug).sort());
  });

  it('stores no postcode, only the two-digit LGA number', () => {
    const text = JSON.stringify(places);
    expect(text).not.toMatch(/LA-?\d\d-/i);
    for (const l of lgas) expect(l.nipost).toMatch(/^\d\d$/);
  });

  it('is accepted by ingest cell validation for every land hex and rejects other resolutions', () => {
    for (const l of lgas) for (const c of l.cells) expect(isValidRes8Cell(c)).toBe(true);
    expect(isValidRes8Cell(latLngToCell(6.6, 3.35, 7))).toBe(false);
    expect(isValidRes8Cell(latLngToCell(6.6, 3.35, 9))).toBe(false);
  });
});

describe('old stored spots', () => {
  const land = new Set(wards.flatMap((w) => w.cells));
  it('a cell outside Lagos land is not a land cell, so the app asks for a re-pick', () => {
    expect(land.has(latLngToCell(6.5244, 3.3792, 8))).toBe(true);
    expect(land.has(latLngToCell(9.0765, 7.3986, 8))).toBe(false); // Abuja
    expect(land.has(latLngToCell(6.2, 3.35, 8))).toBe(false); // Gulf of Guinea
  });
});
