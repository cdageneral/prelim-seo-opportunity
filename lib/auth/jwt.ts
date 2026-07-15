/**
 * lib/auth/jwt.ts — sign/verify the session token (v7.373).
 *
 * HS256 JWT built on the standard Web Crypto API (globalThis.crypto.subtle),
 * which is available in BOTH the edge runtime (middleware) and the node runtime
 * (route handlers) — so this module is import-safe everywhere and adds NO
 * dependency. Middleware verifies the token to gate routes without a DB hit.
 */

import { authSecret, SESSION_TTL_SECONDS, type Role } from './config';

export interface SessionClaims {
  sub:   string; // user id
  email: string;
  name:  string;
  role:  Role;
  sid:   string; // auth_sessions row id (for revocation lookups)
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Web Crypto's BufferSource wants an ArrayBuffer-backed view; copy into a fresh
// ArrayBuffer so the types (and runtimes) agree regardless of the source buffer.
function buf(u: Uint8Array): ArrayBuffer {
  const b = new ArrayBuffer(u.byteLength);
  new Uint8Array(b).set(u);
  return b;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', buf(authSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: claims.sub, email: claims.email, name: claims.name, role: claims.role, sid: claims.sid,
    iat: now, exp: now + SESSION_TTL_SECONDS,
  };
  const data = bytesToB64url(enc.encode(JSON.stringify(header))) + '.' +
               bytesToB64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), buf(enc.encode(data))));
  return data + '.' + bytesToB64url(sig);
}

/** Verify signature + expiry. Returns claims, or null if invalid/expired. */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), buf(b64urlToBytes(s)), buf(enc.encode(h + '.' + p)));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlToBytes(p))) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && Math.floor(Date.now() / 1000) > payload.exp) return null;
    if (!payload.sub || typeof payload.role !== 'string') return null;
    return {
      sub:   String(payload.sub),
      email: String(payload.email ?? ''),
      name:  String(payload.name ?? ''),
      role:  payload.role as Role,
      sid:   String(payload.sid ?? ''),
    };
  } catch {
    return null;
  }
}
