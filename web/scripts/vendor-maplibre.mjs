#!/usr/bin/env node
// Copies MapLibre GL JS (BSD-3-Clause) from node_modules into public/vendor/maplibre-gl/, so the website serves the map
// library from its own origin (ADR 0053). Run by wrangler before every dev and deploy ("build" in wrangler.jsonc).
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
console.log(`maplibre-gl copied to ${out}`);
