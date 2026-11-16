// UX3: every colour in tokens.json equals the generated CSS variable, the web TS string and the Kotlin constant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { paths, render } from '../../../tools/tokens/build.mjs';

const tokens = JSON.parse(readFileSync(paths.json, 'utf8'));
const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^nodata$/, 'noData');

test('UX3 generated files are current', () => {
  const out = render(tokens);
  for (const k of ['css', 'ts', 'kt']) assert.equal(readFileSync(paths[k], 'utf8'), out[k], `${paths[k]} is stale`);
});

test('UX3 every colour appears in CSS and Kotlin', () => {
  const css = readFileSync(paths.css, 'utf8');
  const kt = readFileSync(paths.kt, 'utf8');
  for (const [mode, set] of Object.entries(tokens).filter(([, v]) => !Array.isArray(v) && v.bg)) {
    const ktBlock = kt.slice(kt.indexOf(`object ${mode === 'dark' ? 'Dark' : 'Light'}`));
    for (const [name, hex] of Object.entries(set)) {
      assert.ok(css.includes(`--${name}:${hex};`), `css ${mode} ${name}`);
      assert.ok(ktBlock.includes(`val ${camel(name)} = Color(0xFF${hex.slice(1).toUpperCase()})`), `kt ${mode} ${name}`);
    }
  }
});
