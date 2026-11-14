#!/usr/bin/env node
// Check a field report (docs/field/YYYY-MM-DD.md) before it is committed.
// Rules: .kiro/specs/field-telemetry (R1.6, R6.2, R6.3) and .kiro/steering/privacy.md.
//   - required sections are present, in the layout of references/report-template.md
//   - a gate line and a kill-criterion line are near the top
//   - no install IDs, push tokens, H3 cells or coordinates; devices appear only as aliases (D1, D2, ...)
// Usage: node check-report.mjs <report.md>      Exit 0 = clean, 1 = problems.
import { readFileSync } from 'node:fs';

export const SECTIONS = ['Devices', 'Gates', 'Metrics', 'Outages', 'False alarms and misses', 'New failures', 'Fixture candidates', 'Parameters in use'];

const FORBIDDEN = [
  ['install ID (base32, 26+ characters)', /\b[a-z2-7]{26,}\b/],
  ['hex identifier (32+ characters)', /\b[0-9a-f]{32,}\b/i],
  ['H3 cell index', /\b8[0-9a-f]{14}\b/],
  ['coordinate pair', /-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/],
  ['FCM registration token', /\b[\w-]{11}:APA91[\w-]{20,}/],
  ['install id field', /\binstall_?id\b\s*[:=]/i],
  ['phone number', /(?<![\w.])\+?\d[\d\s-]{9,}\d(?![\w.])/],
];

export function checkReport(text) {
  const problems = [];
  const first = text.split('\n').find((l) => l.trim()) || '';
  if (!/^# Field report \d{4}-\d{2}-\d{2}\s*$/.test(first)) problems.push('first line must be "# Field report YYYY-MM-DD"');

  const head = text.split('\n').slice(0, 25).join('\n');
  if (!/^Gate status \(milestone 1\):/m.test(head)) problems.push('missing "Gate status (milestone 1):" line near the top');
  if (!/^Kill criterion:/m.test(head)) problems.push('missing "Kill criterion:" line near the top');

  const headings = [...text.matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1]);
  let last = -1;
  for (const s of SECTIONS) {
    const i = headings.findIndex((h) => h.toLowerCase().startsWith(s.toLowerCase()));
    if (i < 0) problems.push(`missing section "## ${s}"`);
    else { if (i < last) problems.push(`section "## ${s}" is out of order`); last = i; }
  }

  text.split('\n').forEach((line, idx) => {
    for (const [name, re] of FORBIDDEN) {
      if (re.test(line)) problems.push(`line ${idx + 1}: ${name}`);
    }
  });

  // devices only as aliases
  const devSection = text.split(/^## /m).find((b) => /^Devices/i.test(b)) || '';
  const rows = devSection.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1);
  for (const r of rows) {
    const first = r.split('|')[1]?.trim();
    if (first && !/^D\d+$/.test(first)) problems.push(`Devices table: "${first}" is not an alias (D1, D2, ...)`);
  }
  return problems;
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: check-report.mjs <report.md>'); process.exit(2); }
  const problems = checkReport(readFileSync(file, 'utf8'));
  if (problems.length) { console.error(`report problems (${file}):\n` + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log(`report ok: ${file}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
