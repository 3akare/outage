// Pairing code hash (home-watch R7.2, ADR 0009): HMAC-SHA-256 of the code under the Worker secret, as hex. A leaked offer table
// cannot be brute-forced offline, because the code has only 49 bits and the key is not in the table.
// Web Crypto HMAC in Workers: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
const encoder = new TextEncoder();

export async function hashPairingCode(secret: string, code: string): Promise<string> {
  if (!secret) throw new Error('INSTALL_TOKEN_SECRET is not set');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`pair-code-v1|${code}`)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}
