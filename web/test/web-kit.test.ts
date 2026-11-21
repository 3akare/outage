import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeXml, safeHref } from '../site/escape.ts';
import { contentSecurityPolicy, finalize, html, json, makeNonce, methodNotAllowed, NONCE_PLACEHOLDER } from '../site/headers.ts';
import { layout } from '../site/layout.ts';
import { APP_CSS_HREF } from '../ui/app/design.ts';
import { PUBLIC_STATE_KEYS, STATE_KEYS, stateText } from '../site/strings.ts';
import { SITE } from './web-helpers.ts';

const runs = Number(process.env.FC_NUM_RUNS ?? 100);

describe('W8 headers and escaping', () => {
  it('W8_escape_html_leaves_no_markup_characters', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const out = escapeHtml(s);
        expect(out).not.toMatch(/[<>"'`]/);
        // every ampersand starts one of our entities
        expect(out.replace(/&(amp|lt|gt|quot|#39|#96);/g, '')).not.toContain('&');
      }),
      { numRuns: runs },
    );
  });

  it('W8_escape_html_known_attack_strings', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('" onload="x')).toBe('&quot; onload=&quot;x');
    expect(escapeHtml("' onmouseover='x")).toBe('&#39; onmouseover=&#39;x');
    expect(escapeXml('a&b<c>')).toBe('a&amp;b&lt;c&gt;');
  });

  it('W8_layout_escapes_title_description_and_canonical', () => {
    const out = layout({ site: { origin: 'https://x.test', apkUrl: null }, title: '<b>t</b>', description: '"d"', path: '/a?"<', body: '<main></main>' });
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;b&gt;t&lt;/b&gt;');
    expect(out).toContain('content="&quot;d&quot;"');
    expect(out).toContain('href="https://x.test/a?&quot;&lt;"');
  });

  it('W8_safe_href_blocks_script_schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('//evil.test/x')).toBeNull();
    expect(safeHref('http://plain.test/x')).toBeNull();
    expect(safeHref('/install')).toBe('/install');
    expect(safeHref('https://github.com/a/b.apk')).toBe('https://github.com/a/b.apk');
  });

  it('W8_every_response_has_the_security_headers_and_no_cookie', async () => {
    const samples = [
      finalize(html(`<p nonce="${NONCE_PLACEHOLDER}">x</p>`, 30)),
      finalize(json({ a: 1 }, 30)),
      finalize({ status: 404, contentType: 'text/html; charset=utf-8', body: 'x', ttlSeconds: 0 }),
      methodNotAllowed(),
    ];
    for (const res of samples) {
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      expect(csp).toContain("default-src 'none'");
      expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
      expect(csp).toMatch(/style-src 'nonce-[A-Za-z0-9+/=]+'/);
      expect(csp).toContain("img-src 'self' data:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Set-Cookie')).toBeNull();
    }
  });

  it('W8_only_get_and_head_answered_405_names_allowed_methods', () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, HEAD');
  });

  it('W8_nonce_in_header_matches_body_and_differs_per_response', async () => {
    const rendered = html(`<style nonce="${NONCE_PLACEHOLDER}"></style><script nonce="${NONCE_PLACEHOLDER}"></script>`, 30);
    const a = finalize(rendered);
    const b = finalize(rendered);
    const nonceOf = (r: Response) => /nonce-([^']+)'/.exec(r.headers.get('Content-Security-Policy') ?? '')?.[1] ?? '';
    const bodyA = await a.text();
    expect(nonceOf(a)).not.toBe('');
    expect(bodyA).not.toContain(NONCE_PLACEHOLDER);
    expect(bodyA.split(`nonce="${nonceOf(a)}"`).length - 1).toBe(2);
    expect(nonceOf(a)).not.toBe(nonceOf(b));
    expect(makeNonce()).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
    expect(contentSecurityPolicy('abc')).toContain("script-src 'nonce-abc'");
  });

  it('W8_head_has_headers_without_body', async () => {
    const res = finalize(html('<p>x</p>', 30), 'HEAD');
    expect(await res.text()).toBe('');
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('W8_layout_loads_nothing_from_another_origin', () => {
    const out = layout({ site: SITE, title: 't', description: 'd', path: '/', body: '<main></main>', script: 'void 0' });
    expect(out).not.toMatch(/(src|href)="https?:\/\/(?!outage\.test)/);
    // The one stylesheet is the shared same-origin /app.css (ADR 0048); the one font is Inter from this origin (ADR 0054).
    expect([...out.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m) => m[0])).toEqual([`<link rel="stylesheet" href="${APP_CSS_HREF}">`]);
    expect([...out.matchAll(/<link[^>]+rel="preload"[^>]*>/g)].map((m) => m[0])).toEqual([
      '<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>',
    ]);
    expect(out).not.toMatch(/style="/); // inline style attributes would break the style nonce policy
    expect(out.match(/<script/g)?.length).toBe(1);
  });

  it('W8_five_states_each_have_label_sentence_and_the_real_four_exclude_spot_only', () => {
    expect(STATE_KEYS).toHaveLength(5);
    expect(PUBLIC_STATE_KEYS).not.toContain('SPOT_ONLY');
    for (const k of STATE_KEYS) {
      const t = stateText(k);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.sentence.length).toBeGreaterThan(0);
      expect(t.label).not.toMatch(/\p{Extended_Pictographic}/u); // icon-free
    }
    expect(stateText('RESTORED', 'pcm').label).toBe('Light don come!');
    expect(stateText('CONFIRMED', 'pcm')).toEqual(stateText('CONFIRMED', 'en'));
  });
});
