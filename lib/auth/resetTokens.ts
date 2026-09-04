/**
 * lib/auth/resetTokens.ts — one-time password-reset tokens (v7.485).
 *
 * Wayne, 2026-09-04: "we should add a password recovery system into this. Right
 * now I dont know my password and if it wasnt saved I wouldnt know how to get it."
 * Passwords are scrypt hashes (lib/auth/passwords.ts) and are NOT recoverable —
 * there is no plaintext to reveal, so recovery means ISSUING A NEW SECRET, never
 * reading an old one. This module mints that secret.
 *
 * The app has no mail sender (no SMTP/Resend/SES dependency, no env var), so the
 * delivery channel Wayne chose is admin-issued: an owner/admin creates the link
 * and hands it over out-of-band. Adding email later only changes WHO calls
 * mintResetToken() — the token contract below is unchanged.
 *
 * Security shape, mirroring how passwords themselves are stored:
 *   - the token is 32 bytes of crypto randomness, base64url (256 bits);
 *   - only its SHA-256 is written to the database, so a DB leak yields no usable
 *     link — the same one-way property as the password column itself;
 *   - lookup is by hash (indexed), and the compare is constant-time;
 *   - single use (used_at) and short-lived (TTL below);
 *   - issuing a new token invalidates the user's prior unused ones, so a link
 *     that was mis-sent stops working the moment a replacement is made.
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/** How long an issued link stays valid. Short by design — it is a hand-off, not a credential. */
export const RESET_TTL_MINUTES = 30;

/** A fresh token: the secret to hand out, and the hash to store. */
export function mintResetToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
  };
}

/** SHA-256 of a token, hex. The only form ever persisted. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time compare of two token hashes. Both are hex of a fixed length, so
 * a length mismatch is a plain false rather than a throw from timingSafeEqual.
 */
export function resetHashesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Absolute URL a recipient can open. Origin comes from the request, never hardcoded. */
export function resetUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}
