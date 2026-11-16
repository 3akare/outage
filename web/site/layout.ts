// Page layout for the public area pages: the shared Material 3 stylesheet (/app.css, same origin) and at most one inline
// script carrying the nonce placeholder (R1.5, R1.6). No external font, script, image or tracker. Readable with scripts off (R1.4).
import { escapeHtml } from './escape.ts';
import { NONCE_PLACEHOLDER } from './headers.ts';
import { brandLink, FAVICON_LINK } from './brand.ts';

export type Site = {
  /** Origin used for canonical links and the sitemap, for example https://outage.example. No trailing slash. */
  origin: string;
  /** Direct APK link, from configuration (R7.4). Null until a release exists. */
  apkUrl: string | null;
  /** Google Play listing, from configuration. The landing page shows the button only when it is set. */
  playUrl?: string | null;
  /** Aptoide listing, from configuration. The landing page shows the button only when it is set. */
  aptoideUrl?: string | null;
};

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
    `${FAVICON_LINK}<link rel="stylesheet" href="/app.css"></head><body>` +
    `<header class="site-top">${brandLink('/')}<nav aria-label="Site"><a href="/areas">Areas</a><a href="/app/simulate">Try it</a></nav></header>` +
    `<div class="site">${input.body}</div>` +
    '<footer class="site-foot note"><a href="/">Home</a><a href="/app/simulate">Try the app</a><a href="/install">Install</a><a href="/privacy">Privacy</a></footer>' +
    (input.script ? `<script nonce="${NONCE_PLACEHOLDER}">${input.script}</script>` : '') +
    '</body></html>'
  );
}
