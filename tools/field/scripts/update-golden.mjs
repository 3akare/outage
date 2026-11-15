// Rewrites the golden report files in test/golden from the builders in test/build.ts. Run it only after reading the diff:
//   npm run golden -w tools/field
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY_FAILURES } from '../src/failures.ts';
import { buildDay } from '../src/run.ts';
import { emptyDump, richDump } from '../test/build.ts';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../test/golden');
for (const [name, dump] of [
  ['rich', richDump()],
  ['empty', emptyDump()],
  ['recorded-samsung', JSON.parse(readFileSync(resolve(dir, '../recorded/2026-11-15-samsung-probe.json'), 'utf8'))],
]) {
  const r = buildDay({ json: dump, failures: JSON.parse(JSON.stringify(EMPTY_FAILURES)), existingDirs: [] });
  if (!r.ok) throw new Error(`${name}: ${r.reason}`);
  writeFileSync(resolve(dir, `${name}.md`), r.markdown);
  console.log(`${name}.md: ${r.markdown.length} bytes`);
}
