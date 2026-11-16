// Catalog generator. Run from the repo root (Node 22.18+ runs the .ts imports directly):
//   node web/areas/catalog/generate.mjs           writes catalog.generated.json
//   node web/areas/catalog/generate.mjs --check   exits 1 when the generated file is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCatalog } from './build.ts';
import { validateCatalog, validateCatalogSource } from './schema.ts';

const sourcePath = new URL('catalog.source.json', import.meta.url);
const outPath = new URL('catalog.generated.json', import.meta.url);

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const problems = validateCatalogSource(source);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const catalog = buildCatalog(source);
const outProblems = validateCatalog(catalog);
if (outProblems.length) {
  console.error(outProblems.join('\n'));
  process.exit(1);
}
const text = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    // missing file counts as stale
  }
  if (current !== text) {
    console.error('catalog.generated.json is stale: run node web/areas/catalog/generate.mjs');
    process.exit(1);
  }
} else {
  writeFileSync(outPath, text);
  console.log(`wrote ${catalog.areas.length} areas`);
}
