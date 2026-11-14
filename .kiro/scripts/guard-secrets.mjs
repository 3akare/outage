// PreToolUse (write, shell): block keys, tokens and .env values in tracked files.
// Rules: Part A.5 of the brief. Secrets live in Wrangler secrets and GitHub Actions secrets.
// Escape hatch for a reviewed false positive: `secrets-guard:allow <reason>` on the line.
import { readPayload, toolKind, extractWrites, shellCommand, block } from './lib.mjs';
import { findSecrets, sensitivePath, formatFindings } from './scan.mjs';

const payload = readPayload();
const kind = toolKind(payload);
const problems = [];

if (kind === 'write') {
  for (const w of extractWrites(payload)) {
    const s = sensitivePath(w.path);
    if (s) problems.push(`  ${w.path}: ${s}`);
    const f = findSecrets(w.content);
    if (f.length) problems.push(formatFindings(w.path, f));
  }
} else if (kind === 'shell') {
  const cmd = shellCommand(payload);
  const f = findSecrets(cmd);
  if (f.length) problems.push(formatFindings('(shell command)', f));
  // stage, print or write secret files
  const sens = /(?:^|[\s"'=/])(\.env(?:\.[A-Za-z0-9_-]+)?|\.dev\.vars(?:\.[A-Za-z0-9_-]+)?|[\w.-]+\.(?:pem|p12|pfx|jks|keystore)|service-?account[\w.-]*\.json|google-services\.json)(?=$|[\s"';|&])/gi;
  const hits = [...cmd.matchAll(sens)].map((m) => m[1]).filter((n) => !/\.(example|sample|template)$/.test(n));
  if (hits.length) {
    const risky = /(\bgit\s+(add|commit|stash)\b|\bcat\b|\bhead\b|\btail\b|\bless\b|\bprintenv\b|>>?|\btee\b|\bcp\b|\bmv\b|\bbase64\b|\bcurl\b[^|]*-d\s*@|\bscp\b)/.test(cmd);
    if (risky) problems.push(`  shell command touches secret-bearing file(s): ${[...new Set(hits)].join(', ')}`);
  }
  if (/\bprintenv\b|(^|[;&|]\s*)env\s*($|[;&|])/.test(cmd)) problems.push('  shell command prints the whole environment');
  if (/\bgit\s+add\s+(-A|--all|-f|--force)\b|\bgit\s+add\s+\.(\s|$)/.test(cmd) && /\.env|\.dev\.vars/.test(cmd)) problems.push('  git add of broad paths together with env files');
}

if (problems.length) {
  block([
    'secrets-guard: blocked. A secret or secret-bearing file would end up in a tracked file or in output.',
    ...problems,
    'Use `wrangler secret put NAME` for Worker secrets and GitHub Actions secrets for builds. Read values from env at run time. Never print or commit them.',
    'If this is a reviewed false positive, add `secrets-guard:allow <reason>` on that line and ask the human.',
  ]);
}
process.exit(0);
