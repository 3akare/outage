// Install token (ADR 0003): token = base64url(HMAC-SHA-256(secret, installId)). Nothing is stored server-side.
// WebCrypto in Workers (HMAC sign/verify): https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
// `subtle.verify` compares the MAC in constant time, so there is no hand-written comparison of secrets here.

const encoder = new TextEncoder();
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

const B64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

/** Strict decode of a 32-byte base64url value; null for anything else. */
export function base64urlDecode32(text: string): Uint8Array | null {
  if (!B64URL_32_BYTES.test(text)) return null;
  const bin = atob(text.replaceAll('-', '+').replaceAll('_', '/') + '=');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  // 43 chars carry 258 bits for 256: a non-canonical last char would decode to the same bytes, so require the canonical form.
  return base64urlEncode(out) === text ? out : null;
}

/** 128 random bits as 26 lowercase base32 characters. `random` is injected so tests are deterministic. */
export function mintInstallId(random: Uint8Array): string {
  if (random.length !== 16) throw new Error('install id needs 16 random bytes');
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of random) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(acc << (5 - bits)) & 31];
  return out;
}

let cached: { secret: string; key: Promise<CryptoKey> } | undefined;

function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('INSTALL_TOKEN_SECRET is not set');
  if (cached?.secret !== secret) {
    cached = {
      secret,
      key: crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
    };
  }
  return cached.key;
}

export async function mintToken(secret: string, installId: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(installId));
  return base64urlEncode(new Uint8Array(mac));
}

export async function verifyToken(secret: string, installId: string, token: string): Promise<boolean> {
  const mac = base64urlDecode32(token);
  if (!mac) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), mac, encoder.encode(installId));
}

/** SHA-256 of an install id as hex: the only form in which a revoked id is stored (ADR 0003 addendum). */
export async function hashInstallId(installId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(installId)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
