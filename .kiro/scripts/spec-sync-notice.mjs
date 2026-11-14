// spec-sync (command half): after a write to a spec document, tell the agent exactly what to keep in sync.
// The agent half of the hook (matcher "spec") covers the built-in spec tools in the IDE and CLI.
// Kiro Web writes specs through ordinary file tools, so this command runs on every write and speaks only for spec docs.
import { readPayload, toolKind, extractWrites, say, readText } from './lib.mjs';

const payload = readPayload();
if (toolKind(payload) !== 'write') process.exit(0);
const specs = extractWrites(payload).map((w) => w.path).filter((p) => /^\.kiro\/specs\/[^/]+\/(requirements|bugfix|design|tasks)\.md$/.test(p));
if (!specs.length) process.exit(0);

const out = [];
for (const p of specs) {
  const [, , name, file] = p.split('/');
  if (file === 'requirements.md' || file === 'bugfix.md') {
    out.push(`spec-sync: ${p} changed. Update ${name}/design.md (data model, sequence diagrams, error handling, test table) and ${name}/tasks.md so every requirement is covered by a task and every property ID is mapped to a test.`);
  } else if (file === 'design.md') {
    const ids = [...new Set((readText(p, '').match(/^\| ([A-Z]{1,2}\d{1,2}) \|/gm) || []).map((s) => s.replace(/[| ]/g, '')))];
    out.push(`spec-sync: ${p} changed. Keep ${name}/tasks.md in step. Property IDs in its test table: ${ids.join(', ') || 'none found'}. Each needs a task that writes its test, and a row in docs/traceability.md.`);
  } else {
    out.push(`spec-sync: ${p} changed. Check dependencies are real only, tasks cover every requirement, and docs/traceability.md has the task numbers.`);
  }
}
say(out);
process.exit(0);
