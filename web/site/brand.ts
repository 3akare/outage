// The Outage mark on the website (ADR 0054: a disc, half solid and half ring, power on and off in one shape). The geometry
// is generated with the Android icon by tools/icon/build.mjs.
import { FAVICON_SVG, LOGO_SVG } from './logo.gen.ts';
import type { Rendered } from './headers.ts';

export const FAVICON_PATH = '/favicon.svg';
/** The favicon and the font preload every page's head carries. */
export const FAVICON_LINK =
  `<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">` +
  '<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>';
export { LOGO_SVG };

export const renderFavicon = (): Rendered => ({ status: 200, contentType: 'image/svg+xml', body: FAVICON_SVG, ttlSeconds: 86_400 });

/** The brand lock-up: the mark and the name, linking home. */
export const brandLink = (href = '/'): string => `<a class="brand" href="${href}" aria-label="Outage home">${LOGO_SVG}<span>Outage</span></a>`;
