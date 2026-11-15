// field-telemetry task 7: the schedule record, the /field-test steering, and a dry run of the scheduled procedure on a recorded day.
// R7.1 R7.2 R7.4 R7.5. The dry run starts the real command as the prompt writes it (as a child process), with no network.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const RECORD = '.kiro/schedules/field-test.md';
const STEERING = '.kiro/steering/field-test.md';
const RECORDED = path.join(ROOT, 'tools/field/test/recorded/2026-11-15-samsung-probe.json');
const GOLDEN = path.join(ROOT, 'tools/field/test/golden/recorded-samsung.md');
const DAY = '2026-11-15';
const GENERATE = 'node --experimental-strip-types tools/field/bin/field-report.mjs';
const CHECK = 'node .kiro/skills/field-report/scripts/check-report.mjs';

const prompt = () => /```text\n([\s\S]*?)```/.exec(read(RECORD))?.[1] ?? '';

function run(args, env = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const lastJson = (out) => JSON.parse(out.trim().split('\n').pop());

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'field-schedule-'));
  mkdirSync(path.join(dir, '.kiro', 'specs'), { recursive: true });
  return dir;
}

describe('R7.2 the schedule record', () => {
  const record = read(RECORD);

  it('states the name, the time, the repository and the prompt', () => {
    expect(record).toContain('`outage-field-test`');
    expect(record).toContain('Daily at 06:00 UTC (07:00 West Africa Time)');
    expect(record).toContain('cron(0 6 * * ? *)');
    expect(record).toContain('`3akare/outage`');
    expect(prompt().length).toBeGreaterThan(500);
  });

  it('the prompt fits the 10,000 character limit of a Kiro Web scheduled task', () => {
    expect(prompt().length).toBeLessThanOrEqual(10_000);
  });

  it('R7.5 names the secret and the variable, holds no secret value, and says the run opens a pull request', () => {
    expect(record).toContain('npx wrangler secret put FIELD_READ_TOKEN');
    expect(record).toContain('`WORKER_URL`');
    expect(record).not.toMatch(/(?<![\w/.-])[A-Za-z0-9+]{40,}={0,2}(?![\w/.-])/);
    expect(record).not.toMatch(/Bearer [A-Za-z0-9]/);
    expect(record).toContain('pull request');
    expect(prompt()).toContain('Never print, log, echo or write FIELD_READ_TOKEN');
  });

  it('cites the Kiro documentation it follows', () => {
    for (const url of [
      'https://kiro.dev/docs/web/automations.md',
      'https://kiro.dev/docs/web/sandbox/environment-variables.md',
    ]) {
      expect(record).toContain(url);
    }
  });

  it('every repository path the prompt and the steering name exists', () => {
    const text = `${prompt()}\n${read(STEERING)}`;
    const paths = new Set(
      [...text.matchAll(/(?:\.kiro|tools|docs|packages)\/[A-Za-z0-9_./-]+/g)]
        .map((m) => m[0].replace(/[.,:)]+$/, ''))
        // docs/field/failures.json and the report files are created by the first run.
        .filter(
          (p) =>
            !/[$*<]/.test(p) &&
            !p.endsWith('/') &&
            !/YYYY/.test(p) &&
            p !== 'docs/field/failures.json' &&
            !p.includes('bugfix-'),
        ),
    );
    expect(paths.size).toBeGreaterThan(5);
    for (const p of paths) expect(existsSync(path.join(ROOT, p)), p).toBe(true);
  });

  it('the prompt and the steering give the same generate and check commands', () => {
    for (const text of [prompt(), read(STEERING)]) {
      expect(text).toContain(GENERATE);
      expect(text).toContain(CHECK);
    }
  });
});

describe('dry run of the scheduled procedure on a recorded day', () => {
  it('R6.1 R8.4 the generate command writes the report, one Bugfix Spec and failures.json; the checker passes; the report is the golden file', () => {
    const dir = repo();
    const g = run([
      '--experimental-strip-types',
      'tools/field/bin/field-report.mjs',
      '--day',
      DAY,
      '--input',
      RECORDED,
      '--repo',
      dir,
    ]);
    expect(g.code).toBe(0);
    const line = lastJson(g.out);
    expect(line).toMatchObject({
      status: 'report_written',
      report: `docs/field/${DAY}.md`,
      devices: 1,
      milestone: 'not met',
    });
    expect(line.newSpecs).toEqual(['.kiro/specs/bugfix-20261115-armed-critical-samsung-15-normal']);

    const report = path.join(dir, 'docs', 'field', `${DAY}.md`);
    expect(readFileSync(report, 'utf8')).toBe(readFileSync(GOLDEN, 'utf8'));
    const c = run(['.kiro/skills/field-report/scripts/check-report.mjs', report]);
    expect(c.code).toBe(0);
    expect(c.out).toContain('report ok');

    const spec = path.join(dir, line.newSpecs[0]);
    expect(readdirSync(spec).sort()).toEqual(['bugfix.md', 'design.md', 'tasks.md']);
    expect(readFileSync(path.join(spec, 'bugfix.md'), 'utf8')).toContain('Current Behavior (Defect)');
    expect(JSON.parse(readFileSync(path.join(dir, 'docs', 'field', 'failures.json'), 'utf8')).failures).toHaveProperty(
      'ARMED_CRITICAL:samsung:15:normal',
    );
  });

  it('design 8 a second run of the same day (the schedule fires twice) changes no file and opens no second spec', () => {
    const dir = repo();
    const args = [
      '--experimental-strip-types',
      'tools/field/bin/field-report.mjs',
      '--day',
      DAY,
      '--input',
      RECORDED,
      '--repo',
      dir,
    ];
    run(args);
    const before = readFileSync(path.join(dir, 'docs', 'field', 'failures.json'), 'utf8');
    const second = run(args);
    expect(second.code).toBe(0);
    expect(readdirSync(path.join(dir, '.kiro', 'specs'))).toHaveLength(1);
    expect(readFileSync(path.join(dir, 'docs', 'field', 'failures.json'), 'utf8')).toBe(before);
    expect(readFileSync(path.join(dir, 'docs', 'field', `${DAY}.md`), 'utf8')).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('R7.4 R7.5 a fetch that cannot connect writes the one-line note, opens no spec, and prints no token', () => {
    const dir = repo();
    const secretValue = 'dry-run-value-that-must-not-appear';
    const g = run(['--experimental-strip-types', 'tools/field/bin/field-report.mjs', '--day', DAY, '--repo', dir], {
      WORKER_URL: 'http://127.0.0.1:9',
      FIELD_READ_TOKEN: secretValue,
    });
    expect(g.code).toBe(0);
    expect(lastJson(g.out)).toMatchObject({ status: 'fetch_failed', day: DAY });
    expect(readFileSync(path.join(dir, 'docs', 'field', `${DAY}.md`), 'utf8')).toMatch(/^Data not fetched: .+\n$/);
    expect(readdirSync(path.join(dir, '.kiro', 'specs'))).toEqual([]);
    expect(g.out + g.err).not.toContain(secretValue);
  });

  it('R7.5 without the environment variables the command fetches nothing and says why', () => {
    const dir = repo();
    const g = run(['--experimental-strip-types', 'tools/field/bin/field-report.mjs', '--day', DAY, '--repo', dir]);
    expect(g.code).toBe(0);
    expect(lastJson(g.out)).toMatchObject({ status: 'fetch_failed' });
  });
});
