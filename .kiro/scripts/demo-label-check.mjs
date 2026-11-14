// demo-label-check: fail if a simulated event in tools/sim lacks `simulated: true`.
// Triggers: PostFileSave on tools/sim/** (IDE, CLI v3) and PostToolUse write (Kiro Web). Rule: .kiro/steering/demo-mode.md, property P9.
// Heuristic: every object literal with `type: 'UNPLUG' | 'REPLUG' | 'ARMED' | 'DISARMED' | 'BATTERY_FULL' | 'LABEL' | 'REPORT'`
// must contain `simulated: true` (or `simulated,` spread from a typed factory) inside the same braces.
import { readPayload, toolKind, extractWrites, say, readText, debounced, ROOT } from './lib.mjs';
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const EVENT_TYPE = /\btype\s*:\s*['"`](UNPLUG|REPLUG|ARMED|DISARMED|BATTERY_FULL|LABEL|REPORT)['"`]/g;

/** Returns [{ line, type }] for event literals without `simulated: true`. */
export function findUnlabeled(text) {
  const bad = [];
  for (const m of text.matchAll(EVENT_TYPE)) {
    const at = m.index;
    let start = at, depth = 0;
    for (; start >= 0; start--) { const c = text[start]; if (c === '}') depth++; else if (c === '{') { if (depth === 0) break; depth--; } }
    let end = at; depth = 0;
    for (; end < text.length; end++) { const c = text[end]; if (c === '{') depth++; else if (c === '}') { if (depth === 0) break; depth--; } }
    const literal = text.slice(Math.max(start, 0), end + 1);
    if (!/\bsimulated\s*:\s*true\b/.test(literal) && !/demo-label-check:allow/.test(literal)) {
      bad.push({ line: text.slice(0, at).split('\n').length, type: m[1] });
    }
  }
  return bad;
}

function main() {
  const force = process.argv.includes('--all');
  let targets = [];
  if (force) {
    const walk = (d) => existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|mjs|js)$/.test(e.name) ? [path.relative(ROOT, path.join(d, e.name))] : []) : [];
    targets = walk(path.join(ROOT, 'tools', 'sim'));
  } else {
    const payload = readPayload();
    const p = (payload.file_path || payload.filePath || '').toString();
    targets = toolKind(payload) === 'write' ? extractWrites(payload).map((w) => w.path) : p ? [p.replace(ROOT + '/', '')] : [];
    targets = targets.filter((t) => /^tools\/sim\/.*\.(ts|mjs|js)$/.test(t));
    if (!targets.length || debounced('demo-label:' + targets.join(','), 8000)) return;
  }
  const failures = [];
  for (const t of targets) {
    for (const b of findUnlabeled(readText(t, ''))) failures.push(`  ${t}:${b.line} ${b.type} event without simulated: true`);
  }
  if (failures.length) {
    say(['HOOK FAILED: demo-label-check. Simulated events must carry `simulated: true` so they never enter real history (P9, .kiro/steering/demo-mode.md):', ...failures]);
    process.exitCode = force ? 1 : 0;
  } else if (force) say('demo-label-check: all simulated events are labeled.');
}
if (import.meta.url === `file://${process.argv[1]}`) main();
