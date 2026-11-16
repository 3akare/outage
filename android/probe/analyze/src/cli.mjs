#!/usr/bin/env node
// Read a probe export and write docs/probe/YYYY-MM-DD-<alias>.md plus docs/probe/summary.md.
// Usage: node android/probe/analyze/src/cli.mjs <export.json> [--out docs/probe] [--date YYYY-MM-DD] [--json]
// Kept as .mjs so the TypeScript library needs no Node type definitions. Node 22.18+ runs the .ts imports directly.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyzeDevice } from './analyze.ts';
import { gate } from './gate.ts';
import { parseExport } from './parse.ts';
import { deviceMarkdown, summaryMarkdown } from './report.ts';

const a = process.argv.slice(2);
const get = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const file = a.find((x) => !x.startsWith('--') && x !== get('--out') && x !== get('--date'));
if (!file) { console.error('usage: cli.mjs <export.json> [--out docs/probe] [--date YYYY-MM-DD] [--json]'); process.exit(2); }
const { data, problems } = parseExport(JSON.parse(readFileSync(file, 'utf8')));
const results = data.devices.map(analyzeDevice);
const g = gate(results);
if (a.includes('--json')) { console.log(JSON.stringify({ gate: g, devices: results, problems }, null, 2)); process.exit(0); }
const out = get('--out', 'docs/probe');
const date = get('--date', new Date().toISOString().slice(0, 10));
mkdirSync(out, { recursive: true });
for (const d of results) writeFileSync(path.join(out, `${date}-${d.alias}.md`), deviceMarkdown(d));
writeFileSync(path.join(out, 'summary.md'), summaryMarkdown(results, g, problems));
console.log(`gate ${g.overall}: armed ${g.armed.verdict}, delay ${g.delay.verdict}, maker ${g.oem.verdict}${g.kill.triggered ? ', KILL CRITERION TRIGGERED' : ''}`);
console.log(`wrote ${results.length + 1} file(s) to ${out}`);
