// Catalog generator. Run from the repo root (Node 22.18+ runs the .ts imports directly):
//   node web/areas/catalog/generate.mjs           writes catalog.generated.json and outlines.generated.json
//   node web/areas/catalog/generate.mjs --check   exits 1 when a generated file is stale
// Input: core/shared/fixtures/places/lagos-places.json and lagos-geo.json (built by tools/places/build_lagos.py, ADR 0056).
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCatalog, buildOutlines } from './build.ts';
import { validateCatalog, validateCatalogSource } from './schema.ts';

const read = (url) => JSON.parse(readFileSync(url, 'utf8'));
const places = read(new URL('../../../core/shared/fixtures/places/lagos-places.json', import.meta.url));
const geo = read(new URL('../../../core/shared/fixtures/places/lagos-geo.json', import.meta.url));

const problems = validateCatalogSource(places);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const catalog = buildCatalog(places);
const outProblems = validateCatalog(catalog);
if (outProblems.length) {
  console.error(outProblems.join('\n'));
  process.exit(1);
}
// One area per line keeps the file small and the diffs readable.
const catalogText = `{\n  "areas": [\n${catalog.areas.map((a) => `    ${JSON.stringify(a)}`).join(',\n')}\n  ]\n}\n`;
const outlinesText = `${JSON.stringify(buildOutlines(geo, places))}\n`;
const files = [
  [new URL('catalog.generated.json', import.meta.url), catalogText],
  [new URL('outlines.generated.json', import.meta.url), outlinesText],
];
if (process.argv.includes('--check')) {
  for (const [path, text] of files) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // missing file counts as stale
    }
    if (current !== text) {
      console.error(`${path.pathname.split('/').pop()} is stale: run node web/areas/catalog/generate.mjs`);
      process.exit(1);
    }
  }
} else {
  for (const [path, text] of files) writeFileSync(path, text);
  console.log(`wrote ${catalog.areas.length} areas`);
}
