// kotlin-check: run the Kotlin unit tests after a change under apps/android or tools/probe/android (**.kt).
// Triggers: PostFileSave (IDE, CLI v3) and PostToolUse write (Kiro Web). Also called by verify.mjs with --run.
// It uses .kiro/scripts/android-sandbox.sh, which needs the SDK from `android-sandbox.sh setup`. Without the SDK it says so and skips.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { debounced, extractWrites, ROOT, readPayload, run, say, tail, toolKind } from './lib.mjs';

const PROJECTS = ['apps/android', 'tools/probe/android'];
const force = process.argv.includes('--run');
let touched = PROJECTS;
if (!force) {
  const payload = readPayload();
  const p = (payload.file_path || payload.filePath || payload.path || '').toString();
  const paths = toolKind(payload) === 'write' ? extractWrites(payload).map((w) => w.path) : p ? [p.replace(`${ROOT}/`, '')] : [];
  touched = PROJECTS.filter((d) => paths.some((x) => x.startsWith(`${d}/`) && /\.kts?$/.test(x)));
  if (!touched.length) process.exit(0);
  if (debounced(`kotlin-check:${touched.join(',')}`, 8000)) process.exit(0);
}

const sandbox = path.join(ROOT, '.kiro/scripts/android-sandbox.sh');
const toolchain = process.env.OUTAGE_TOOLCHAIN || '/projects/sandbox/.toolchain';
const ready = existsSync(path.join(toolchain, 'android/platforms/android-36'));
const targets = touched.filter((d) => existsSync(path.join(ROOT, d, 'gradlew')));
if (!targets.length) { say('kotlin-check: skipped (no gradlew in the touched project yet).'); process.exit(0); }
if (!ready) { say('kotlin-check: skipped (Android SDK not installed here; run .kiro/scripts/android-sandbox.sh setup). CI still compiles and tests on push.'); process.exit(0); }

for (const dir of targets) {
  // JVM unit tests (S1..S8, T1..T7 and the other IDs in test names). The compile step runs first inside the task graph.
  const r = run('bash', [sandbox, 'gradle', dir, '--console=plain', '-q', ':app:testDebugUnitTest'], { cwd: ROOT, timeout: 590000 });
  if (r.code === 0) say(`kotlin-check: PASS ${dir} (compile and Kotlin unit tests green).`);
  else say([`KOTLIN BUILD OR TESTS FAILED in ${dir} (HOOK FAILED: kotlin-check). Fix the code or the test; never skip a test.`, tail(r.out, 60, 3500)]);
}
process.exit(0);
