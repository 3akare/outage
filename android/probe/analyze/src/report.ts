import type { DeviceResult } from './analyze.ts';
import type { Gate } from './gate.ts';
import type { Summary } from './stats.ts';

const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const h = (ms: number) => (ms / 3_600_000).toFixed(2);
const s = (ms: number | null) => (ms === null ? 'n/a' : (ms / 1000).toFixed(1));
const sum = (x: Summary) => `n=${x.n}, p50 ${s(x.p50)} s, p95 ${s(x.p95)} s, max ${s(x.max)} s`;
const day = (ms: number | null) => (ms === null ? 'n/a' : new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
const esc = (t: string) => t.replace(/\|/g, '/').replace(/\n/g, ' ');

/** One device: docs/probe/YYYY-MM-DD-<alias>.md (design section 6). Numbers only; no interpretation is invented. */
export function deviceMarkdown(d: DeviceResult): string {
  const L: string[] = [];
  L.push(`# Probe: ${d.alias}`, '');
  L.push(`Device: ${d.maker} (${d.brand}), Android SDK ${d.androidSdk}. Rows: ${d.rows}. From ${day(d.firstWallMs)} to ${day(d.lastWallMs)}. Reboots: ${d.reboots}. App restarts: ${d.restarts}.`, '');
  L.push('## M1 armed time while charging', '', '| Condition | Charging h | Armed while charging h | Armed ratio |', '|---|---|---|---|');
  for (const c of [...d.byCond, d.notExempt, d.exempt, d.overall]) L.push(`| ${esc(c.cond)} | ${h(c.totals.chargingMs)} | ${h(c.totals.armedChargingMs)} | ${pct(c.armedRatio)} |`);
  L.push('', '## M2 plug-in to job start', '', `${sum(d.m2.delay)}. Plug-ins with no job start within 10 min: ${d.m2.missed.length}. Job starts with no plug-in before them (restarts): ${d.m2.unpaired.length}.`);
  const byCond = new Map<string, number[]>();
  for (const p of d.m2.pairs) byCond.set(p.cond, [...(byCond.get(p.cond) ?? []), p.delayMs]);
  if (byCond.size > 1) for (const [c, v] of byCond) L.push(`- ${esc(c)}: n=${v.length}, delays s ${v.map((x) => s(x)).join(', ')}`);
  L.push('', '## M5 stops and restart gaps', '', `Stop reasons: ${Object.entries(d.stopReasons).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Gap from a non-unplug stop to the next start: ${sum(d.m5Gaps)}.`);
  L.push('', '## M6 unplug to job stop', '', `${sum(d.m6.delay)}. Unplugs with no stop: ${d.m6.missed.length}. Plug state at the stop differs from the re-read 1 s later: ${d.plugLag.differ} of ${d.plugLag.checked}.`);
  L.push('', '## M7 power broadcasts', '', '| Condition | Connected | Disconnected | Plug changed within 1 s |', '|---|---|---|---|');
  for (const m of d.m7) L.push(`| ${esc(m.cond)} | ${m.connected} | ${m.disconnected} | ${m.lag1s} |`);
  L.push('', '## Other findings', '');
  L.push(`- M8 expedited job with the charging constraint: ${d.m8 ?? 'not logged'}`);
  L.push(`- M9 alarm audio from the background: ${d.m9.length ? d.m9.map((a) => `${a.phase}${a.delayMs !== null ? ` after ${s(a.delayMs)} s` : ''}${a.error ? ` (${esc(a.error)})` : ''}`).join('; ') : 'not run'}`);
  L.push(`- M11 plug types seen: ${d.m11.length ? d.m11.map((x) => `${x.plug} (${esc(x.cond)})`).join(', ') : 'none'}`);
  L.push(`- M12 full-screen intents allowed: ${d.m12 === null ? 'not logged (below Android 14 or not run)' : d.m12 ? 'yes' : 'no'}`);
  L.push(`- M13 upload round trip: ${Object.entries(d.m13).map(([k, v]) => `${k} ${sum(v)}`).join('; ') || 'no successful uploads'}`);
  L.push(`- M14 sticky intent and BatteryManager disagree: ${d.m14.mismatch} of ${d.m14.checked} stops`);
  L.push('', '## Tester notes', '');
  for (const n of d.notes) L.push(`- #${n.id}: ${esc(n.text)}`);
  if (!d.notes.length) L.push('- none');
  return L.join('\n') + '\n';
}

export function summaryMarkdown(devices: readonly DeviceResult[], g: Gate, problems: readonly string[]): string {
  const L: string[] = ['# Probe summary', ''];
  L.push(`Gate: **${g.overall}**`, '');
  L.push('| Check | Verdict | Detail |', '|---|---|---|');
  L.push(`| Armed at least 90% over 12 h of charging (in total) on one phone | ${g.armed.verdict} | ${esc(g.armed.detail)} |`);
  L.push(`| Plug-in to job start p95 at most 60 s | ${g.delay.verdict} | ${esc(g.delay.detail)} |`);
  L.push(`| Samsung, Tecno or Infinix works after the exemption | ${g.oem.verdict} | ${esc(g.oem.detail)} |`);
  L.push(`| Tecno or Infinix tested | ${devices.some((d) => /tecno|infinix/i.test(`${d.maker} ${d.brand}`)) ? 'yes' : 'no (open risk, ADR 0013)'} | |`);
  L.push(`| Kill criterion (every phone under 50%) | ${g.kill.triggered ? 'TRIGGERED' : 'not triggered'} | ${esc(g.kill.detail)} |`, '');
  L.push('## Devices', '', '| Alias | Maker | SDK | Charging h | Armed ratio | Exempt ratio | M2 p95 s | Replugs |', '|---|---|---|---|---|---|---|---|');
  for (const d of devices) L.push(`| ${d.alias} | ${esc(d.maker)} | ${d.androidSdk} | ${h(d.overall.totals.chargingMs)} | ${pct(d.overall.armedRatio)} | ${pct(d.exempt.armedRatio)} | ${s(d.m2.delay.p95)} | ${d.m2.delay.n} |`);
  L.push('', '## Data problems', '');
  L.push(...(problems.length ? problems.map((p) => `- ${esc(p)}`) : ['- none']));
  L.push('', 'Numbers come from `android/probe/analyze` (nearest-rank percentiles). Interpretation and the chosen path go in ADR 0013.');
  return L.join('\n') + '\n';
}
