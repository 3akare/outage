// Types for new-bugfix.mjs, so tools/field (TypeScript) can import planBugfix instead of writing it again.
export interface FailureEntry {
  firstSeen: string;
  lastSeen: string;
  count: number;
  spec: string;
}
export interface FailuresIndex {
  version: number;
  failures: Record<string, FailureEntry>;
}
export type BugfixPlan =
  | { error: string }
  | {
      action: 'created' | 'updated';
      signature: string;
      spec: string;
      failures: FailuresIndex;
      /** File name inside `spec` to its text. Empty for an `updated` plan. */
      files: Record<string, string>;
    };
export function planBugfix(input: {
  signature: string;
  date: string;
  evidence?: string;
  failures?: FailuresIndex;
  existingDirs?: string[];
}): BugfixPlan;
export function parseSignature(
  sig: string,
): { error: string } | { check: string; maker: string; android: string; mode: string };
export const CHECKS: Record<string, { title: string }>;
