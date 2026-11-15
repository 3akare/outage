// Security headers, CSP nonce and response building for the public pages (R1.5, R1.6, R11.3).
// Content-Security-Policy: https://developers.cloudflare.com/workers/examples/security-headers/ and
// https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Content-Security-Policy
// Response with a nonce per response: the cached body holds a placeholder that is replaced on every serve (task 5 decision, ADR-less: see notes).

/** Placeholder written into cached HTML; replaced by a fresh nonce for every response. */
export const NONCE_PLACEHOLDER = '__OUTAGE_NONCE__';

export type Rendered = {
  status: number;
  contentType: string;
  body: string; // HTML bodies carry NONCE_PLACEHOLDER where a nonce belongs
  ttlSeconds: number; // 0 = not cacheable
  noindex?: boolean;
  headers?: Record<string, string>;
};

/** 16 random bytes as base64. Uses Web Crypto, available in Workers and Node 22. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'", // the Judge page's service worker (R6.7)
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Headers every response carries. No cookie is ever set. */
export function securityHeaders(nonce: string): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(nonce),
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

export function cacheControl(ttlSeconds: number): string {
  return ttlSeconds > 0 ? `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}` : 'no-store';
}

/** Builds the final Response. HEAD gets the headers without a body. */
export function finalize(rendered: Rendered, method = 'GET', nonce = makeNonce()): Response {
  const body = rendered.body.split(NONCE_PLACEHOLDER).join(nonce);
  const headers = new Headers({
    ...securityHeaders(nonce),
    'Content-Type': rendered.contentType,
    'Cache-Control': cacheControl(rendered.ttlSeconds),
    ...(rendered.headers ?? {}),
  });
  if (rendered.noindex) headers.set('X-Robots-Tag', 'noindex');
  return new Response(method === 'HEAD' ? null : body, { status: rendered.status, headers });
}

export const html = (body: string, ttlSeconds: number, extra: Partial<Rendered> = {}): Rendered => ({
  status: 200,
  contentType: 'text/html; charset=utf-8',
  body,
  ttlSeconds,
  ...extra,
});

export const json = (value: unknown, ttlSeconds: number, extra: Partial<Rendered> = {}): Rendered => ({
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(value),
  ttlSeconds,
  ...extra,
});

/** 405 for anything but GET and HEAD (R11.3). */
export function methodNotAllowed(): Response {
  return finalize({
    status: 405,
    contentType: 'text/plain; charset=utf-8',
    body: 'Method not allowed',
    ttlSeconds: 0,
    headers: { Allow: 'GET, HEAD' },
  });
}
