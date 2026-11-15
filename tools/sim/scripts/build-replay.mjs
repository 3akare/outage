// Writes replay.json (the synthetic replay plus the unplug track) through the real engine (web-and-area-pages task 9,
// demo-mode task 3). Usage: npm run build:replay -w tools/sim [-- <out path>]. Default: packages/shared/fixtures/replay.json
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoReplay } from '../src/scenario.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(root, process.argv[2] ?? 'packages/shared/fixtures/replay.json');
const replay = buildDemoReplay();
writeFileSync(out, `${JSON.stringify(replay, null, 2)}\n`);
const t = replay.unplugTrack;
console.log(
  `replay: ${replay.frames.length} frames, source ${replay.source}, ${replay.recordedDevices} real devices; ` +
    `unplug track: ${t.drops} of ${t.armed} phones drop, confirmed ${t.confirmedAtMs} ms after the unplug -> ${out}`,
);
