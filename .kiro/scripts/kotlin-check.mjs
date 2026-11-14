// kotlin-check: run the Kotlin unit tests after a change under modules/**.kt
// Triggers: PostFileSave (IDE, CLI v3) and PostToolUse write (Kiro Web). Also called by verify.mjs with --run.
// The Gradle task name is fixed by sensor-android task 1 (scaffold); update TASKS below then.
import { readPayload, toolKind, extractWrites, say, run, ROOT, debounced, tail } from './lib.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const force = process.argv.includes('--run');
if (!force) {
  const payload = readPayload();
  const p = (payload.file_path || payload.filePath || payload.path || '').toString();
  const paths = toolKind(payload) === 'write' ? extractWrites(payload).map((w) => w.path) : p ? [p.replace(ROOT + '/', '')] : [];
  if (!paths.some((x) => /^modules\/.*\.kt$/.test(x))) process.exit(0);
  if (debounced('kotlin-check:' + paths.join(','), 8000)) process.exit(0);
}

const dirs = ['modules/outage-sensor/android', 'apps/mobile/android'].map((d) => path.join(ROOT, d));
const gradleDir = dirs.find((d) => existsSync(path.join(d, 'gradlew')));
if (!gradleDir) { say('kotlin-check: skipped (no gradlew yet; the module is scaffolded by sensor-android task 1).'); process.exit(0); }

const TASKS = [':outage-sensor:testDebugUnitTest']; // JVM unit tests for the pure state machine (S1..S8, T1..T7, L1..L12)
const r = run('./gradlew', ['--offline', '--console=plain', '-q', ...TASKS], { cwd: gradleDir, timeout: 590000 });
if (r.code === 0) say('kotlin-check: PASS (Kotlin unit tests green).');
else say(['KOTLIN TESTS FAILED (HOOK FAILED: kotlin-check). Fix the code or the test; never skip a test.', tail(r.out, 60, 3500)]);
process.exit(0);
