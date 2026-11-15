// Filing failure signatures (field-telemetry R8.3 to R8.6). The Bugfix Spec skeleton and the dedup rule are NOT written
// here: they come from the skill's own planBugfix, so there is one copy (.kiro/skills/field-report/scripts/new-bugfix.mjs).
// This job writes documents only. It never edits code.
// Bugfix Spec form: https://kiro.dev/docs/specs/bugfix-specs/
import type { FailuresIndex } from '../../../.kiro/skills/field-report/scripts/new-bugfix.mjs';
import { planBugfix } from '../../../.kiro/skills/field-report/scripts/new-bugfix.mjs';
import type { FilingView } from './render.ts';
import type { SignatureHit } from './signatures.ts';

export type { FailuresIndex };
export const EMPTY_FAILURES: FailuresIndex = { version: 1, failures: {} };

export type ParsedFailures = { ok: true; value: FailuresIndex } | { ok: false; reason: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `docs/field/failures.json` must be well formed. If it is not, the run stops and files nothing (design section 8). */
export function parseFailures(text: string | undefined): ParsedFailures {
  if (text === undefined) return { ok: true, value: JSON.parse(JSON.stringify(EMPTY_FAILURES)) as FailuresIndex };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'failures.json is not valid JSON' };
  }
  const o = raw as { version?: unknown; failures?: unknown } | null;
  if (typeof o !== 'object' || o === null || o.version !== 1 || typeof o.failures !== 'object' || o.failures === null) {
    return { ok: false, reason: 'failures.json has an unexpected shape' };
  }
  for (const [sig, e] of Object.entries(o.failures as Record<string, unknown>)) {
    const f = e as Record<string, unknown> | null;
    const ok =
      typeof f === 'object' &&
      f !== null &&
      typeof f.firstSeen === 'string' &&
      DAY.test(f.firstSeen) &&
      typeof f.lastSeen === 'string' &&
      DAY.test(f.lastSeen) &&
      typeof f.count === 'number' &&
      Number.isInteger(f.count) &&
      f.count >= 1 &&
      typeof f.spec === 'string' &&
      f.spec.startsWith('.kiro/specs/');
    if (!ok) return { ok: false, reason: `failures.json entry ${sig.slice(0, 60)} is malformed` };
  }
  return { ok: true, value: raw as FailuresIndex };
}

export interface Filing {
  view: FilingView;
  /** Files of a new Bugfix Spec, as path (from the repo root) to text. Empty for a known signature. */
  files: Record<string, string>;
}

export type FileResult = { ok: true; failures: FailuresIndex; filings: Filing[] } | { ok: false; reason: string };

/**
 * One call of `planBugfix` per signature, in order, each on the index the previous one returned. A signature in the
 * index never gets a second spec; it only gets its count and last-seen date updated (R8.5). A signature first seen on
 * `day` is still listed as new when the same day is run again, so the report is the same on a second run.
 */
export function fileFailures(
  hits: readonly SignatureHit[],
  day: string,
  failures: FailuresIndex,
  existingDirs: readonly string[],
): FileResult {
  let index = failures;
  const filings: Filing[] = [];
  for (const h of hits) {
    const plan = planBugfix({
      signature: h.signature,
      date: day,
      evidence: h.evidence,
      failures: index,
      existingDirs: [...existingDirs],
    });
    if ('error' in plan) return { ok: false, reason: `${h.signature}: ${plan.error}` };
    index = plan.failures;
    const entry = index.failures[h.signature];
    const files: Record<string, string> = {};
    for (const [name, text] of Object.entries(plan.files)) files[`${plan.spec}/${name}`] = text;
    filings.push({
      view: {
        signature: h.signature,
        spec: plan.spec,
        count: entry.count,
        isNew: plan.action === 'created' || entry.firstSeen === day,
      },
      files,
    });
  }
  return { ok: true, failures: index, filings };
}
