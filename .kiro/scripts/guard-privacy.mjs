// PreToolUse (write): block writes that store raw coordinates, phone numbers or names,
// or that add forbidden permissions. Rules: .kiro/steering/privacy.md
// Escape hatch for a reviewed false positive: add `privacy-guard:allow <reason>` on the line.
import { readPayload, toolKind, extractWrites, block } from './lib.mjs';
import { findPrivacy, formatFindings } from './scan.mjs';

const payload = readPayload();
if (toolKind(payload) !== 'write') process.exit(0);

const problems = [];
for (const w of extractWrites(payload)) {
  const f = findPrivacy(w.path, w.content);
  if (f.length) problems.push(formatFindings(w.path, f));
}
if (problems.length) {
  block([
    'privacy-guard: blocked. This write breaks .kiro/steering/privacy.md.',
    ...problems,
    'Store only the H3 cell (res 8) and an optional postcode prefix. Use the coarse location permission only. No microphone, no accelerometer, no phone numbers or names.',
    'If this is a reviewed false positive, add `privacy-guard:allow <reason>` on that line and ask the human.',
  ]);
}
process.exit(0);
