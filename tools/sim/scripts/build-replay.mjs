// Writes replay.json from the synthetic fixture through the real engine (web-and-area-pages task 9).
// Usage: npm run build:replay -w tools/sim [-- <out path>]. Default: packages/shared/fixtures/replay.json
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syntheticFixture } from '../src/fixture.ts';
import { buildReplay } from '../src/replay.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(root, process.argv[2] ?? 'packages/shared/fixtures/replay.json');
const replay = buildReplay(syntheticFixture());
writeFileSync(out, `${JSON.stringify(replay, null, 2)}\n`);
console.log(
  `replay: ${replay.frames.length} frames, source ${replay.source}, ${replay.recordedDevices} real devices -> ${out}`,
);
