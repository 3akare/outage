// The CLI around the generator (field-telemetry tasks 6 and 7): files written, fetch failure note, corrupt failures.json.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../bin/field-report.mjs';
import { DAY, richDump } from './build.ts';

const TOKEN_VALUE = 'cli-test-bearer-value';

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'field-cli-'));
  mkdirSync(path.join(dir, '.kiro', 'specs'), { recursive: true });
  return dir;
}
const input = (dir) => {
  const file = path.join(dir, 'dump.json');
  writeFileSync(file, JSON.stringify(richDump()));
  return file;
};
const specDirs = (dir) => readdirSync(path.join(dir, '.kiro', 'specs')).sort();

describe('field-report CLI', () => {
  it('R6.1 R8.4 writes the report, the specs and failures.json from an input file, and the report passes the checker', async () => {
    const dir = repo();
    const { code, out } = await main({ argv: ['--day', DAY, '--input', input(dir), '--repo', dir], env: {} });
    expect(code).toBe(0);
    expect(out).toMatchObject({ status: 'report_written', report: `docs/field/${DAY}.md`, devices: 3, signatures: 9 });
    expect(existsSync(path.join(dir, 'docs', 'field', `${DAY}.md`))).toBe(true);
    expect(specDirs(dir)).toHaveLength(9);
    const failures = JSON.parse(readFileSync(path.join(dir, 'docs', 'field', 'failures.json'), 'utf8'));
    expect(Object.keys(failures.failures)).toHaveLength(9);
  });

  it('design 8 a second run of the same day changes nothing', async () => {
    const dir = repo();
    const argv = ['--day', DAY, '--input', input(dir), '--repo', dir];
    await main({ argv, env: {} });
    const report = readFileSync(path.join(dir, 'docs', 'field', `${DAY}.md`), 'utf8');
    const failures = readFileSync(path.join(dir, 'docs', 'field', 'failures.json'), 'utf8');
    const again = await main({ argv, env: {} });
    expect(again.code).toBe(0);
    expect(again.out.newSpecs).toEqual(expect.any(Array));
    expect(readFileSync(path.join(dir, 'docs', 'field', `${DAY}.md`), 'utf8')).toBe(report);
    expect(readFileSync(path.join(dir, 'docs', 'field', 'failures.json'), 'utf8')).toBe(failures);
    expect(specDirs(dir)).toHaveLength(9);
  });

  it('--dry-run writes nothing', async () => {
    const dir = repo();
    const { out } = await main({ argv: ['--day', DAY, '--input', input(dir), '--repo', dir, '--dry-run'], env: {} });
    expect(out.status).toBe('report_written');
    expect(existsSync(path.join(dir, 'docs'))).toBe(false);
    expect(specDirs(dir)).toEqual([]);
  });

  it('R7.3 fetches with the bearer token from the environment and never prints it', async () => {
    const dir = repo();
    let seen;
    const fetch = async (url, init) => {
      seen = { url, auth: init.headers.authorization };
      return { ok: true, status: 200, json: async () => richDump() };
    };
    const { code, out } = await main({
      argv: ['--day', DAY, '--repo', dir],
      env: { WORKER_URL: 'https://outage.example', FIELD_READ_TOKEN: TOKEN_VALUE },
      fetch,
    });
    expect(code).toBe(0);
    expect(seen).toEqual({ url: `https://outage.example/v1/admin/field/${DAY}`, auth: `Bearer ${TOKEN_VALUE}` });
    expect(JSON.stringify(out)).not.toContain(TOKEN_VALUE);
    expect(readFileSync(path.join(dir, 'docs', 'field', `${DAY}.md`), 'utf8')).not.toContain(TOKEN_VALUE);
  });

  it('R7.4 a failed fetch writes a one-line note, no report, no Bugfix Spec, and exits 0', async () => {
    for (const fetch of [
      async () => ({ ok: false, status: 401, json: async () => ({}) }),
      async () => {
        throw new Error(`boom ${TOKEN_VALUE}`);
      },
    ]) {
      const dir = repo();
      const { code, out } = await main({
        argv: ['--day', DAY, '--repo', dir],
        env: { WORKER_URL: 'https://outage.example', FIELD_READ_TOKEN: TOKEN_VALUE },
        fetch,
      });
      expect(code).toBe(0);
      expect(out.status).toBe('fetch_failed');
      const note = readFileSync(path.join(dir, 'docs', 'field', `${DAY}.md`), 'utf8');
      expect(note).toMatch(/^Data not fetched: .+\n$/);
      expect(note + JSON.stringify(out)).not.toContain(TOKEN_VALUE);
      expect(specDirs(dir)).toEqual([]);
      expect(existsSync(path.join(dir, 'docs', 'field', 'failures.json'))).toBe(false);
    }
  });

  it('R7.5 without WORKER_URL or the token, or with a plain http URL, nothing is sent', async () => {
    let called = 0;
    const fetch = async () => {
      called++;
      return { ok: true, status: 200, json: async () => richDump() };
    };
    for (const env of [
      {},
      { WORKER_URL: 'https://x.example' },
      { FIELD_READ_TOKEN: TOKEN_VALUE },
      { WORKER_URL: 'http://outage.example', FIELD_READ_TOKEN: TOKEN_VALUE },
    ]) {
      const { out } = await main({ argv: ['--day', DAY, '--repo', repo()], env, fetch });
      expect(out.status).toBe('fetch_failed');
    }
    expect(called).toBe(0);
  });

  it('design 8 a corrupt failures.json stops the run: a note, no report, no spec', async () => {
    const dir = repo();
    mkdirSync(path.join(dir, 'docs', 'field'), { recursive: true });
    writeFileSync(path.join(dir, 'docs', 'field', 'failures.json'), '{ not json');
    const { code, out } = await main({ argv: ['--day', DAY, '--input', input(dir), '--repo', dir], env: {} });
    expect(code).toBe(1);
    expect(out.status).toBe('failures_corrupt');
    expect(readFileSync(path.join(dir, 'docs', 'field', `${DAY}.md`), 'utf8')).toContain('could not be read');
    expect(specDirs(dir)).toEqual([]);
  });

  it('data for another day, a bad day, or a file that is not a field dump is refused', async () => {
    const dir = repo();
    expect((await main({ argv: ['--day', '2026-11-15', '--input', input(dir), '--repo', dir], env: {} })).code).toBe(1);
    expect((await main({ argv: ['--day', 'yesterday', '--repo', dir], env: {} })).code).toBe(1);
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, '{"v":1}');
    expect((await main({ argv: ['--day', DAY, '--input', bad, '--repo', dir], env: {} })).out.status).toBe('error');
    expect(existsSync(path.join(dir, 'docs'))).toBe(false);
  });

  it('the default day is yesterday in UTC', async () => {
    const dir = repo();
    const { out } = await main({
      argv: ['--repo', dir, '--dry-run', '--input', input(dir)],
      env: {},
      nowMs: Date.parse('2026-11-15T06:00:00Z'),
    });
    expect(out.report).toBe('docs/field/2026-11-14.md');
  });
});
