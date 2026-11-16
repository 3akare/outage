// The Outage mark on the website (ADR 0053: the wordmark). The geometry is generated with the Android icon by tools/icon/build.mjs.
import { FAVICON_SVG, LOGO_SVG } from './logo.gen.ts';
import type { Rendered } from './headers.ts';

export const FAVICON_PATH = '/favicon.svg';
export const FAVICON_LINK = `<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">`;
export { LOGO_SVG };

export const renderFavicon = (): Rendered => ({ status: 200, contentType: 'image/svg+xml', body: FAVICON_SVG, ttlSeconds: 86_400 });

/** The brand lock-up: the wordmark, linking home. */
export const brandLink = (href = '/'): string => `<a class="brand" href="${href}" aria-label="Outage home">${LOGO_SVG}</a>`;
