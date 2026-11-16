// The Outage mark on the website (ADR 0048). The geometry is generated with the Android icon by tools/icon/build.mjs.
import { FAVICON_SVG, LOGO_SVG } from './logo.gen.ts';
import type { Rendered } from './headers.ts';

export const FAVICON_PATH = '/favicon.svg';
export const FAVICON_LINK = `<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">`;
export { LOGO_SVG };

export const renderFavicon = (): Rendered => ({ status: 200, contentType: 'image/svg+xml', body: FAVICON_SVG, ttlSeconds: 86_400 });

/** The brand lock-up: the mark and the word "Outage", linking home. */
export const brandLink = (href = '/'): string => `<a class="brand" href="${href}">${LOGO_SVG}<span>Outage</span></a>`;
