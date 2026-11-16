// UX3 / MD1: every colour in tokens.json equals the generated CSS variable, the web TS string and the Kotlin constant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { camel, paths, render } from '../../../tools/tokens/build.mjs';

const tokens = JSON.parse(readFileSync(paths.json, 'utf8'));
const SETS = [
  ['Colors', tokens.colors, '--c-'],
  ['Map', tokens.map, '--map-'],
];

test('MD1 generated files are current', () => {
  const out = render(tokens);
  for (const k of ['css', 'ts', 'kt']) assert.equal(readFileSync(paths[k], 'utf8'), out[k], `${paths[k]} is stale`);
});

test('MD1 every colour appears in CSS and Kotlin', () => {
  const css = readFileSync(paths.css, 'utf8');
  const kt = readFileSync(paths.kt, 'utf8');
  for (const [obj, set, prefix] of SETS) {
    const ktBlock = kt.slice(kt.indexOf(`object ${obj} {`));
    for (const [name, hex] of Object.entries(set)) {
      assert.ok(css.includes(`${prefix}${name}:${hex};`), `css ${name}`);
      assert.ok(ktBlock.includes(`val ${camel(name)} = Color(0xFF${hex.slice(1).toUpperCase()})`), `kt ${name}`);
    }
  }
});

test('MD1 every colour of the light theme and the four power states exist', () => {
  const roles = ['paper', 'paper-2', 'paper-3', 'ink', 'ink-2', 'muted', 'rule', 'rule-2', 'accent', 'accent-2', 'accent-ink', 'focus'];
  const containers = [];
  const status = ['normal', 'possible', 'confirmed', 'restored'].flatMap((s) => [s, `on-${s}`, `${s}-container`, `on-${s}-container`]);
  for (const r of [...roles, ...containers, ...status]) assert.match(tokens.colors[r] ?? '', /^#[0-9a-f]{6}$/, r);
  for (const s of ['normal', 'possible', 'confirmed', 'restored', 'nodata']) assert.match(tokens.map[s], /^#[0-9a-f]{6}$/);
});
