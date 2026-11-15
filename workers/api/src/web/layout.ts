// Page layout: one inline style and at most one inline script, both carrying the nonce placeholder (R1.5, R1.6).
// No external font, script, image or tracker. Pages are readable with scripts off (R1.4).
import { escapeHtml } from './escape.ts';
import { NONCE_PLACEHOLDER } from './headers.ts';
import { STATE_COLOURS, STATE_KEYS } from './strings.ts';

export type Site = {
  /** Origin used for canonical links and the sitemap, for example https://outage.example. No trailing slash. */
  origin: string;
  /** Direct APK link, from configuration (R7.4). Null until a release exists. */
  apkUrl: string | null;
};

const stateCss = STATE_KEYS.map((k) => {
  const c = STATE_COLOURS[k];
  return `[data-state="${k}"]{background:${c.bg};color:${c.fg};border-color:${c.edge}}`;
}).join('');

const CSS =
  'body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;background:#fff}' +
  'main,header,footer{max-width:42rem;margin:0 auto;padding:1rem}' +
  'h1{font-size:1.5rem;line-height:1.25;margin:.5rem 0}h2{font-size:1.15rem;margin:1.5rem 0 .5rem}' +
  'a{color:#0b4f9c}.btn{display:inline-block;min-height:44px;box-sizing:border-box;padding:.65rem 1rem;margin:.25rem .5rem .25rem 0;border-radius:8px;background:#0b4f9c;color:#fff;text-decoration:none;font-weight:600}' +
  '.btn.alt{background:#fff;color:#0b4f9c;border:2px solid #0b4f9c}' +
  '.state{border:3px solid;border-radius:12px;padding:1rem;margin:1rem 0}.state .label{font-size:1.4rem;font-weight:700;margin:0}.state p{margin:.25rem 0}' +
  '.note{color:#444;font-size:.95rem}.banner{background:#1a1a1a;color:#fff;padding:.5rem 1rem;text-align:center;font-weight:700}' +
  'ul.list{padding-left:1.1rem}ul.plain{list-style:none;padding:0}ul.plain li{margin:.5rem 0}' +
  '.chip{display:inline-block;border:2px solid;border-radius:6px;padding:0 .4rem;font-weight:600;font-size:.9rem}' +
  'svg.map{width:100%;height:auto;max-height:70vh;background:#f4f6f8;border-radius:8px}svg.map a{cursor:pointer}svg.map text{font:600 14px system-ui,sans-serif;fill:#111;paint-order:stroke;stroke:#fff;stroke-width:3px}' +
  'svg.map path{stroke:#fff;stroke-width:1}' +
  '.state.none{background:#f1f3f5;color:#222;border-color:#777}' +
  stateCss +
  STATE_KEYS.map((k) => `svg.map path[data-state="${k}"]{fill:${STATE_COLOURS[k].edge};fill-opacity:.6}`).join('') +
  'svg.map path.none{fill:#cfd6dd}' +
  '[hidden]{display:none!important}button.btn{border:0;font:inherit;font-weight:600;cursor:pointer}button.btn.alt{border:2px solid #0b4f9c}' +
  '[aria-pressed="true"]{outline:3px solid #1a1a1a}#steps .step{border-left:4px solid #ccc;padding:.25rem .75rem;margin:.5rem 0}#steps .step[aria-current]{border-left-color:#1a1a1a;background:#f4f6f8}' +
  '#current .step{border:3px solid #1a1a1a;border-radius:12px;padding:.75rem;list-style:none}';

export type LayoutInput = {
  site: Site;
  title: string;
  description: string;
  /** Canonical path, for example /area/yaba. */
  path: string;
  noindex?: boolean;
  body: string; // already escaped HTML
  /** Static script source, never built from request data. */
  script?: string;
};

export function layout(input: LayoutInput): string {
  const canonical = `${input.site.origin}${input.path}`;
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(input.title)}</title>` +
    `<meta name="description" content="${escapeHtml(input.description)}">` +
    `<link rel="canonical" href="${escapeHtml(canonical)}">` +
    (input.noindex ? '<meta name="robots" content="noindex">' : '') +
    `<style nonce="${NONCE_PLACEHOLDER}">${CSS}</style></head><body>` +
    `<header><a href="/">Outage</a></header>${input.body}` +
    '<footer class="note"><a href="/judge">Judge mode</a> · <a href="/install">Install</a> · <a href="/privacy">Privacy</a></footer>' +
    (input.script ? `<script nonce="${NONCE_PLACEHOLDER}">${input.script}</script>` : '') +
    '</body></html>'
  );
}
