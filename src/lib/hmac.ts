/**
 * HMAC-SHA256 signing/verification for inbound webhooks (SECURITY.md), using the
 * Web Crypto API built into Workers — no dependencies. Comparison is
 * constant-time to avoid leaking the signature via timing.
 */

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Hex HMAC-SHA256 of `message` under `secret`. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a hex signature over `message`. Tolerates an optional `sha256=` prefix. */
export async function verifySignature(
  secret: string,
  message: string,
  providedSignature: string | null | undefined,
): Promise<boolean> {
  if (!providedSignature) return false;
  const provided = providedSignature
    .replace(/^sha256=/i, '')
    .trim()
    .toLowerCase();
  const expected = await hmacSha256Hex(secret, message);
  return timingSafeEqual(expected, provided);
}
