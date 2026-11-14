#!/usr/bin/env node
// Validate the OEM battery guide (oem-guide.json) against the onboarding spec (R7) and properties O4 and O5.
// Default file: ../references/oem-guide.json next to this script (the grid-sensing Power), else packages/shared/src/oem-guide.json (the repository).
// No dependencies. Usage:
//   node validate-guide.mjs [path] [--require-verified] [--json]
// Exit 0 when valid, 1 on any error. --require-verified also fails if a maker (except "other") has no device check.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REQUIRED = ['tecno', 'infinix', 'itel', 'samsung', 'xiaomi', 'pixel', 'other'];
const ID = /^[a-z][a-z0-9_]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https:\/\/[^\s]+$/;

export function validateGuide(guide, { requireVerified = false } = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!guide || typeof guide !== 'object') return { errors: ['guide is not an object'], status: {} };
  if (!Number.isInteger(guide.version) || guide.version < 1) err('version must be an integer >= 1');
  if (!DATE.test(guide.updated || '')) err('updated must be YYYY-MM-DD');
  const makers = Array.isArray(guide.makers) ? guide.makers : [];
  if (!makers.length) err('makers must be a non-empty array');

  const ids = makers.map((m) => m?.id);
  for (const r of REQUIRED) if (!ids.includes(r)) err(`missing maker: ${r}`);
  for (const i of ids) if (!REQUIRED.includes(i)) err(`unknown maker id: ${i}`);
  if (new Set(ids).size !== ids.length) err('duplicate maker id');

  const tokenOwner = new Map(); // token -> maker id
  const status = {};
  for (const m of makers) {
    const where = `maker ${m?.id}`;
    if (!m || typeof m !== 'object') { err('maker entry is not an object'); continue; }
    if (!m.name || typeof m.name !== 'string') err(`${where}: name required`);

    // matching (O4): lower-case tokens, no token shared or contained across makers
    const mm = m.match || {};
    for (const kind of ['manufacturer', 'brand']) {
      const arr = mm[kind];
      if (!Array.isArray(arr)) { err(`${where}: match.${kind} must be an array`); continue; }
      if (m.id === 'other' && arr.length) err(`${where}: "other" is the default and must have no match tokens`);
      for (const t of arr) {
        if (typeof t !== 'string' || !t || t !== t.toLowerCase()) { err(`${where}: match token "${t}" must be lower-case text`); continue; }
        for (const [tok, owner] of tokenOwner) {
          if (owner !== m.id && (tok.includes(t) || t.includes(tok))) err(`${where}: match token "${t}" overlaps "${tok}" of ${owner}`);
        }
        tokenOwner.set(t, m.id);
      }
    }

    // steps
    if (!Array.isArray(m.steps) || !m.steps.length) err(`${where}: steps must be a non-empty array`);
    let mentionsApp = false;
    (m.steps || []).forEach((g, gi) => {
      if (!g.title || typeof g.title !== 'string' || g.title.length > 60) err(`${where}: step group ${gi + 1} needs a title of at most 60 characters`);
      if (!Array.isArray(g.steps) || !g.steps.length) err(`${where}: step group ${gi + 1} needs steps`);
      (g.steps || []).forEach((s, si) => {
        if (typeof s !== 'string' || !s.trim()) err(`${where}: group ${gi + 1} step ${si + 1} is empty`);
        else {
          if (s.length > 160) err(`${where}: group ${gi + 1} step ${si + 1} is longer than 160 characters`);
          if (/^\s*\d+[.)]\s/.test(s)) err(`${where}: group ${gi + 1} step ${si + 1} must not start with a number (the app numbers steps)`);
          if (/\bOutage\b/.test(s)) mentionsApp = true;
        }
      });
      if (g.settingsAction !== undefined && !/^android\.settings\.[A-Z_]+$/.test(g.settingsAction)) err(`${where}: settingsAction must look like android.settings.NAME`);
    });
    if (m.id !== 'other' && !mentionsApp) err(`${where}: steps must name the app "Outage"`);
    if (m.id === 'other' && !mentionsApp) err(`${where}: steps must name the app "Outage"`);

    // checklist
    const cl = Array.isArray(m.checklist) ? m.checklist : [];
    if (!cl.length) err(`${where}: checklist must be non-empty`);
    const cids = cl.map((c) => c?.id);
    if (new Set(cids).size !== cids.length) err(`${where}: duplicate checklist id`);
    for (const c of cl) {
      if (!ID.test(c?.id || '')) err(`${where}: checklist id "${c?.id}" must be snake_case`);
      if (!c?.text || typeof c.text !== 'string' || c.text.length > 100) err(`${where}: checklist text required, at most 100 characters (${c?.id})`);
    }
    if (!cids.includes('battery_exemption')) err(`${where}: checklist must include battery_exemption (the only item the app can verify)`);

    // sources and verification (O5)
    if (!URL_RE.test(m.source || '')) err(`${where}: source must be an https URL`);
    for (const u of m.alsoSee || []) if (!URL_RE.test(u)) err(`${where}: alsoSee entry "${u}" must be an https URL`);
    const ver = Array.isArray(m.verified) ? m.verified : null;
    if (!ver) err(`${where}: verified must be an array (empty means unverified)`);
    (ver || []).forEach((v, i) => {
      if (!v.device || typeof v.device !== 'string') err(`${where}: verified[${i}].device required`);
      if (!/^\d{1,2}(\.\d+)?$/.test(String(v.android ?? ''))) err(`${where}: verified[${i}].android must be a version such as 14`);
      if (!DATE.test(v.date || '')) err(`${where}: verified[${i}].date must be YYYY-MM-DD`);
      if (!['pass', 'partial', 'fail'].includes(v.result)) err(`${where}: verified[${i}].result must be pass, partial or fail`);
    });
    const passes = (ver || []).filter((v) => v.result === 'pass').length;
    status[m.id] = passes ? 'verified' : (ver || []).length ? 'tried' : 'unverified';
    if (requireVerified && m.id !== 'other' && !passes) err(`${where}: no passing device check (--require-verified)`);
  }
  return { errors, status };
}

function main() {
  const args = process.argv.slice(2);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const inPower = path.resolve(here, '../references/oem-guide.json');
  const file = args.find((a) => !a.startsWith('--')) || (existsSync(inPower) ? inPower : path.resolve(here, '../../../../packages/shared/src/oem-guide.json'));
  let guide;
  try { guide = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(1); }
  const { errors, status } = validateGuide(guide, { requireVerified: args.includes('--require-verified') });
  if (args.includes('--json')) console.log(JSON.stringify({ errors, status }, null, 2));
  else {
    console.log('maker       status');
    for (const [id, s] of Object.entries(status)) console.log(`${id.padEnd(11)} ${s}`);
    if (errors.length) console.error('\nERRORS:\n' + errors.map((e) => '  - ' + e).join('\n'));
    else console.log('\nguide is valid');
  }
  process.exit(errors.length ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
