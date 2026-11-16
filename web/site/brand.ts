// The Outage mark on the website (ADR 0048). The geometry is generated with the Android icon by tools/icon/build.mjs.
import { FAVICON_SVG, LOGO_SVG } from './logo.gen.ts';
import type { Rendered } from './headers.ts';

export const FAVICON_PATH = '/favicon.svg';
export const FAVICON_LINK = `<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">`;
export { LOGO_SVG };

export const renderFavicon = (): Rendered => ({ status: 200, contentType: 'image/svg+xml', body: FAVICON_SVG, ttlSeconds: 86_400 });

/** The brand lock-up: the mark and the word "Outage", linking home. */
export const brandLink = (href = '/'): string => `<a class="brand" href="${href}" aria-label="Outage home">${LOGO_SVG}<span>Outage</span></a>`;

// Mona Sans, the Midnight theme's one family (OFL 1.1), served from this origin. Binary, so it skips the page cache.
import { MONA_SANS_WOFF2 } from './font.gen.ts';

export const FONT_PATH = '/fonts/mona-sans.woff2';
let fontBytes: Uint8Array | undefined;

export function fontResponse(): Response {
  fontBytes ??= Uint8Array.from(atob(MONA_SANS_WOFF2), (c) => c.charCodeAt(0));
  return new Response(fontBytes, {
    headers: {
      'Content-Type': 'font/woff2',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
