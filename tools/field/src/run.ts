// One field day, end to end, as a pure function (field-telemetry R6.4, R7.3). The CLI only reads and writes files.
import { DEFAULT_PARAMS, type Params } from '@outage/detection';
import { type FailuresIndex, fileFailures } from './failures.ts';
import { parseFieldDump } from './input.ts';
import { renderReport } from './render.ts';
import { deriveSignatures } from './signatures.ts';

export interface DayInput {
  /** The admin endpoint's JSON, as parsed from the network. */
  json: unknown;
  failures: FailuresIndex;
  /** Names of the folders in `.kiro/specs`, so a spec folder is never overwritten. */
  existingDirs: readonly string[];
  params?: Params;
}

export type DayResult =
  | {
      ok: true;
      day: string;
      /** `docs/field/YYYY-MM-DD.md` */
      reportPath: string;
      markdown: string;
      /** Files of new Bugfix Specs, path from the repo root to text. */
      specFiles: Record<string, string>;
      failures: FailuresIndex;
      /** For the log line: devices, gate result, new specs. */
      summary: { devices: number; milestone: string; newSpecs: string[]; seenAgain: string[]; signatures: number };
    }
  | { ok: false; reason: string };

export function buildDay(input: DayInput): DayResult {
  const parsed = parseFieldDump(input.json);
  if (!parsed.ok) return { ok: false, reason: `input is not a field dump: ${parsed.reason}` };
  const dump = parsed.value;
  const hits = deriveSignatures(dump);
  const filed = fileFailures(hits, dump.day, input.failures, input.existingDirs);
  if (!filed.ok) return { ok: false, reason: filed.reason };
  const params = input.params ?? DEFAULT_PARAMS;
  const markdown = renderReport({ dump, params, filings: filed.filings.map((f) => f.view) });
  const specFiles: Record<string, string> = {};
  for (const f of filed.filings) Object.assign(specFiles, f.files);
  const milestone = /^Gate status \(milestone 1\): ([a-z ]+?) \(/m.exec(markdown)?.[1] ?? 'unknown';
  return {
    ok: true,
    day: dump.day,
    reportPath: `docs/field/${dump.day}.md`,
    markdown,
    specFiles,
    failures: filed.failures,
    summary: {
      devices: dump.devices.length,
      milestone,
      newSpecs: filed.filings.filter((f) => f.view.isNew).map((f) => f.view.spec),
      seenAgain: filed.filings.filter((f) => !f.view.isNew).map((f) => f.view.signature),
      signatures: hits.length,
    },
  };
}

/** The note written when the data could not be fetched (R7.4, design section 8). No Bugfix Spec follows from it. */
export function fetchFailedNote(reason: string): string {
  const safe =
    reason
      .replace(/[^A-Za-z0-9 .:,()-]/g, '')
      .slice(0, 80)
      .trim() || 'unknown';
  return `Data not fetched: ${safe}\n`;
}

export function corruptFailuresNote(day: string): string {
  return `Data not processed for ${day}: docs/field/failures.json could not be read. No report and no Bugfix Spec were written.\n`;
}
