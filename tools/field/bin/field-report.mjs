#!/usr/bin/env -S node --experimental-strip-types
// Field report CLI (field-telemetry task 6 and 7). Dependency-free Node ESM around the pure generator in src/run.ts.
//   WORKER_URL=https://... FIELD_READ_TOKEN=... npm run report -w tools/field -- --day 2026-11-14
//   npm run report -w tools/field -- --day 2026-11-14 --input /tmp/field-2026-11-14.json   (no network)
// Options: --day YYYY-MM-DD (default: yesterday, UTC), --input <file>, --repo <dir> (default: current directory), --dry-run.
// Prints one JSON line. Exit 0: report written or "Data not fetched" note written. Exit 1: nothing written (bad input, a
// report that fails the checker, corrupt failures.json). The token is read from the environment and is never printed.
// Fetch API in Node: https://nodejs.org/api/globals.html#fetch
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkReport } from '../../../.kiro/skills/field-report/scripts/check-report.mjs';
import { parseFailures } from '../src/failures.ts';
import { buildDay, corruptFailuresNote, fetchFailedNote } from '../src/run.ts';

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAY_MS = 86_400_000;

function option(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** WORKER_URL must be https, or plain http on this machine (a local `wrangler dev`). */
function endpoint(workerUrl, day) {
  let u;
  try {
    u = new URL(workerUrl);
  } catch {
    return null;
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return new URL(`/v1/admin/field/${day}`, u).href;
}

async function fetchDump(env, day, fetchFn) {
  const url = endpoint(env.WORKER_URL ?? '', day);
  if (!url || !env.FIELD_READ_TOKEN)
    return { ok: false, reason: 'WORKER_URL or FIELD_READ_TOKEN is not set or not valid' };
  try {
    const res = await fetchFn(url, {
      headers: { authorization: `Bearer ${env.FIELD_READ_TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, reason: 'network error or unreadable answer' };
  }
}

/**
 * @param {{argv: string[], env: Record<string, string | undefined>, fetch?: typeof fetch, nowMs?: number}} io
 * @returns {Promise<{code: number, out: Record<string, unknown>}>}
 */
export async function main(io) {
  const { argv, env } = io;
  const repo = path.resolve(option(argv, '--repo') ?? '.');
  const dry = argv.includes('--dry-run');
  const day = option(argv, '--day') ?? new Date((io.nowMs ?? Date.now()) - DAY_MS).toISOString().slice(0, 10);
  if (!DAY.test(day)) return { code: 1, out: { status: 'error', reason: 'bad --day' } };
  const reportFile = path.join(repo, 'docs', 'field', `${day}.md`);
  const failuresFile = path.join(repo, 'docs', 'field', 'failures.json');
  const write = (file, text) => {
    if (dry) return;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };

  const failures = parseFailures(existsSync(failuresFile) ? readFileSync(failuresFile, 'utf8') : undefined);
  if (!failures.ok) {
    write(reportFile, corruptFailuresNote(day));
    return { code: 1, out: { status: 'failures_corrupt', day, reason: failures.reason } };
  }

  let json;
  const inputFile = option(argv, '--input');
  if (inputFile) {
    try {
      json = JSON.parse(readFileSync(path.resolve(inputFile), 'utf8'));
    } catch {
      return { code: 1, out: { status: 'error', reason: 'cannot read --input as JSON' } };
    }
  } else {
    const got = await fetchDump(env, day, io.fetch ?? fetch);
    if (!got.ok) {
      write(reportFile, fetchFailedNote(got.reason));
      return { code: 0, out: { status: 'fetch_failed', day, reason: got.reason, report: `docs/field/${day}.md` } };
    }
    json = got.json;
  }

  const specsDir = path.join(repo, '.kiro', 'specs');
  const existingDirs = existsSync(specsDir)
    ? readdirSync(specsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  const result = buildDay({ json, failures: failures.value, existingDirs });
  if (!result.ok) return { code: 1, out: { status: 'error', day, reason: result.reason } };
  if (result.day !== day) return { code: 1, out: { status: 'error', day, reason: 'the data is for another day' } };

  const problems = checkReport(result.markdown);
  if (problems.length > 0) return { code: 1, out: { status: 'report_rejected', day, problems } };

  write(reportFile, result.markdown);
  for (const [rel, text] of Object.entries(result.specFiles)) write(path.join(repo, rel), text);
  write(failuresFile, `${JSON.stringify(result.failures, null, 2)}\n`);
  return {
    code: 0,
    out: { status: 'report_written', dryRun: dry, report: result.reportPath, ...result.summary },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, out } = await main({ argv: process.argv.slice(2), env: process.env });
  console.log(JSON.stringify(out));
  process.exitCode = code;
}
