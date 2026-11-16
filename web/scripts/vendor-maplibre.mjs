#!/usr/bin/env node
// Copies MapLibre GL JS (BSD-3-Clause) and h3-js (Apache-2.0) from node_modules into public/vendor/, so the website
// serves its map and hexagon libraries from its own origin (ADR 0053, ADR 0054). Run by wrangler before every dev and deploy ("build" in wrangler.jsonc).
// The copy is not committed: the pinned version in package.json is the source.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json'));
const out = join(here, '..', 'public', 'vendor', 'maplibre-gl');
mkdirSync(out, { recursive: true });
for (const f of ['dist/maplibre-gl.mjs', 'dist/maplibre-gl-worker.mjs', 'dist/maplibre-gl.css', 'LICENSE.txt']) {
  copyFileSync(join(pkg, f), join(out, f.replace('dist/', '')));
}
const h3 = dirname(createRequire(import.meta.url).resolve('h3-js/package.json'));
const h3Out = join(here, '..', 'public', 'vendor', 'h3-js');
mkdirSync(h3Out, { recursive: true });
copyFileSync(join(h3, 'dist/browser/h3-js.es.js'), join(h3Out, 'h3-js.es.js'));
copyFileSync(join(h3, 'LICENSE'), join(h3Out, 'LICENSE'));
console.log(`maplibre-gl and h3-js copied to ${join(here, '..', 'public', 'vendor')}`);
