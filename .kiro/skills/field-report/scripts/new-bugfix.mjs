#!/usr/bin/env node
// File a Bugfix Spec for a new field failure, once per signature. It writes documents only; it never changes code.
// Format: https://kiro.dev/docs/specs/bugfix-specs/  (bugfix.md: Current, Expected and Unchanged behavior in EARS)
// Rules:  .kiro/specs/field-telemetry (R8): signature = CHECK:maker:androidMajor:mode, dedup by docs/field/failures.json
// Usage:  node new-bugfix.mjs --signature ARMED_LOW:tecno:13:normal --date 2026-11-21 [--evidence "armed ratio 0.62 over 3 device-days"] [--repo .] [--dry-run]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const CHECKS = {
  ARMED_LOW: {
    title: 'Sensor is armed less than 90% of charging time',
    when: (s) => `a ${s.maker} phone on Android ${s.android} charges in ${s.mode} mode for at least one hour`,
    current: 'arms the sensor for less than 90% of the charging time',
    expected: 'keep the sensor armed for at least 90% of the charging time',
  },
  ARMED_CRITICAL: {
    title: 'Sensor is armed less than 50% of charging time (kill criterion)',
    when: (s) => `a ${s.maker} phone on Android ${s.android} charges in ${s.mode} mode for at least one hour`,
    current: 'arms the sensor for less than 50% of the charging time',
    expected: 'keep the sensor armed for at least 90% of the charging time, or switch the phone to Station mode and say so',
    note: 'Kill criterion of the brief: below 50% on every phone, even with battery exemption and the Station mode fallback, means stop and rethink the sensor. Tell the human.',
  },
  DELAY_SLOW: {
    title: 'Plug-in is noticed too late',
    when: (s) => `power returns and a ${s.maker} phone on Android ${s.android} (${s.mode} mode) is plugged in`,
    current: 'notices the plug-in more than 60 seconds later at the 95th percentile',
    expected: 'notice the plug-in within 60 seconds at the 95th percentile',
  },
  ALARM_MISSED: {
    title: 'Light Alarm did not ring when it should have',
    when: (s) => `the user answered Yes and power returns on a ${s.maker} phone on Android ${s.android}`,
    current: 'does not ring the Light Alarm',
    expected: 'ring the Light Alarm without network access',
  },
  FALSE_ALARM: {
    title: 'Confirmed outage that the labels show was human unplugs',
    when: (s) => `phones report drops together and every labeled drop is No (${s.maker}, Android ${s.android}, ${s.mode})`,
    current: 'confirms an outage',
    expected: 'not confirm an outage that all labeled users say was a human unplug, unless the decision data justifies it; the human reviews the thresholds in ADR 0005 before any change',
  },
  MISS: {
    title: 'Real outage not detected',
    when: (s) => `a user answered Yes after an unplug and at least 3 phones were armed in the scope (${s.maker}, Android ${s.android})`,
    current: 'raises no Possible or Confirmed outage for that unplug',
    expected: 'cover the unplug with an outage, or record in the decision data why it did not',
  },
  WRITE_FAIL: {
    title: 'Sensor failed to store a stop record',
    when: (s) => `the sensor stores a stop record on a ${s.maker} phone on Android ${s.android}`,
    current: 'fails to write the record',
    expected: 'write the record before it reschedules the job',
  },
  FGS_BLOCKED: {
    title: 'Station mode foreground service could not start',
    when: (s) => `Station mode is turned on on a ${s.maker} phone on Android ${s.android}`,
    current: 'is not allowed to start the foreground service',
    expected: 'start the service, or fall back to job-only mode and tell the user',
  },
  UPLOAD_GAP: {
    title: 'Opted-in device stopped uploading',
    when: (s) => `a ${s.maker} phone on Android ${s.android} has diagnostics turned on`,
    current: 'uploads nothing for more than a day',
    expected: 'upload one aggregate per day',
  },
};

const UNCHANGED = [
  'a phone on a detection plug loses power THEN the system SHALL CONTINUE TO emit one UNPLUG with its stop reason, plug type and monotonic time (sensor-android R2, R3)',
  'events are delivered late or twice THEN the system SHALL CONTINUE TO give the same decisions (detection-engine P3, P4)',
  'a simulated event is processed THEN the system SHALL CONTINUE TO keep it out of real state, history and statistics (P9)',
  'a user deletes their data THEN the system SHALL CONTINUE TO remove everything tied to the install (privacy.md)',
];

const MAKERS = ['tecno', 'infinix', 'itel', 'samsung', 'xiaomi', 'pixel', 'other'];

export function parseSignature(sig) {
  const m = /^([A-Z_]+):([a-z]+):(\d{1,2}|unknown):(normal|station)$/.exec(sig || '');
  if (!m) return { error: `signature "${sig}" must look like CHECK:maker:androidMajor:mode (mode is normal or station)` };
  const [, check, maker, android, mode] = m;
  if (!CHECKS[check]) return { error: `unknown check ${check}; expected one of ${Object.keys(CHECKS).join(', ')}` };
  if (!MAKERS.includes(maker)) return { error: `unknown maker ${maker}; expected one of ${MAKERS.join(', ')}` };
  return { check, maker, android, mode };
}

export const slugify = (sig) => sig.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function renderBugfix(s, sig, date, evidence) {
  const c = CHECKS[s.check];
  const when = c.when(s);
  return `# Bugfix: ${c.title}

Signature: \`${sig}\`
First seen: ${date} (docs/field/${date}.md)
Opened by: the field-report skill. Documents only. No code has been changed.

## Current Behavior (Defect)

1. WHEN ${when} THEN the system ${c.current}

## Expected Behavior (Correct)

1. WHEN ${when} THEN the system SHALL ${c.expected}

## Unchanged Behavior (Regression Prevention)

${UNCHANGED.map((u, i) => `${i + 1}. WHEN ${u}`).join('\n')}

## Evidence

${evidence ? evidence : 'See the numbers in docs/field/' + date + '.md.'}
${c.note ? `\n## Note for the human\n\n${c.note}\n` : ''}
## Status

Waiting for root cause analysis and the human's approval of the design. Do not patch code outside this spec.
`;
}

const DESIGN = (sig) => `# Design: bugfix ${sig}

Status: not started. Find the root cause first, then propose the fix approach and the properties to test: the bug is reproducible, the fix works, and the unchanged behavior still holds (https://kiro.dev/docs/specs/bugfix-specs/). Ask the human to approve the design before tasks run.
`;
const TASKS = (sig) => `# Tasks: bugfix ${sig}

Status: not started. Tasks are generated after the design is approved. Each fix task needs a test that reproduces the bug first.
`;

/** Pure plan: no file access. Returns what to write and the new failures index. */
export function planBugfix({ signature, date, evidence = '', failures = { version: 1, failures: {} }, existingDirs = [] }) {
  const s = parseSignature(signature);
  if (s.error) return { error: s.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { error: 'date must be YYYY-MM-DD' };
  const next = JSON.parse(JSON.stringify(failures));
  next.version = 1; next.failures = next.failures || {};
  const known = next.failures[signature];
  if (known) {
    if (known.lastSeen !== date) { known.count += 1; known.lastSeen = date; }
    return { action: 'updated', signature, spec: known.spec, failures: next, files: {} };
  }
  const dir = `bugfix-${date.replace(/-/g, '')}-${slugify(signature)}`;
  if (existingDirs.includes(dir)) return { error: `spec folder ${dir} already exists but the signature is not in failures.json; fix failures.json by hand` };
  next.failures[signature] = { firstSeen: date, lastSeen: date, count: 1, spec: `.kiro/specs/${dir}` };
  return {
    action: 'created', signature, spec: `.kiro/specs/${dir}`, failures: next,
    files: { 'bugfix.md': renderBugfix(s, signature, date, evidence), 'design.md': DESIGN(signature), 'tasks.md': TASKS(signature) },
  };
}

function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const repo = path.resolve(get('--repo') || '.');
  const failuresFile = path.join(repo, 'docs', 'field', 'failures.json');
  const specsDir = path.join(repo, '.kiro', 'specs');
  const failures = existsSync(failuresFile) ? JSON.parse(readFileSync(failuresFile, 'utf8')) : undefined;
  const existingDirs = existsSync(specsDir) ? (await_list(specsDir)) : [];
  const plan = planBugfix({ signature: get('--signature'), date: get('--date'), evidence: get('--evidence'), failures, existingDirs });
  if (plan.error) { console.error('new-bugfix: ' + plan.error); process.exit(1); }
  if (!a.includes('--dry-run')) {
    if (plan.action === 'created') {
      const dir = path.join(repo, plan.spec);
      mkdirSync(dir, { recursive: true });
      for (const [f, text] of Object.entries(plan.files)) writeFileSync(path.join(dir, f), text);
    }
    mkdirSync(path.dirname(failuresFile), { recursive: true });
    writeFileSync(failuresFile, JSON.stringify(plan.failures, null, 2) + '\n');
  }
  console.log(JSON.stringify({ action: plan.action, signature: plan.signature, spec: plan.spec, dryRun: a.includes('--dry-run') }));
}
import { readdirSync } from 'node:fs';
const await_list = (d) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
if (import.meta.url === `file://${process.argv[1]}`) main();
