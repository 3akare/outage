// Types for check-report.mjs, so tools/field (TypeScript) can run the checker on every generated report.
export const SECTIONS: string[];
/** Returns the problems found; an empty list means the report is clean. */
export function checkReport(text: string): string[];
