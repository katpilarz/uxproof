// lib/auth.ts — server-only session helpers.
//
// uxproof is a local-first internal tool, so authentication is deliberately
// lightweight: signing in is claiming an email identity (no password). The
// session cookie is HMAC-signed so it can't be forged by editing the cookie
// value, and every API route resolves the user from it server-side. Users
// live in Sanity as `user` documents with a deterministic _id derived from
// the email, so repeat logins always map to the same document.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { writeClient } from '@/lib/sanity';

export const SESSION_COOKIE = 'uxproof_session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

// Local dev fallback keeps the login flow working out of the box; set
// AUTH_SECRET in .env.local for anything beyond a single-machine setup.
const AUTH_SECRET = process.env.AUTH_SECRET || 'uxproof-local-dev-secret';

export interface AuthUser {
  id:         string;
  email:      string;
  name?:      string;
  avatarUrl?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Deterministic Sanity _id for an email — stable across logins. */
export function userIdForEmail(email: string): string {
  const digest = createHash('sha256').update(normalizeEmail(email)).digest('hex');
  return `user_${digest.slice(0, 24)}`;
}

function hmac(payload: string): string {
  return createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
}

/** email → signed cookie value `<base64url(email)>.<hmac>` */
export function signSessionToken(email: string): string {
  const payload = Buffer.from(normalizeEmail(email), 'utf8').toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

/** signed cookie value → email, or null if missing/tampered. */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const email = Buffer.from(payload, 'base64url').toString('utf8');
    return isValidEmail(email) ? email : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the signed-in user from the request cookie, hydrated from Sanity.
 * Returns null when there is no valid session or the user doc is gone.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const email = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!email) return null;

  try {
    const doc = await writeClient.fetch(
      `*[_type == "user" && _id == $id][0]{
        _id, email, name,
        "avatarUrl": avatar.asset->url
      }`,
      { id: userIdForEmail(email) },
    );
    if (!doc?._id) return null;
    return {
      id:        doc._id,
      email:     doc.email,
      name:      doc.name || undefined,
      avatarUrl: doc.avatarUrl || undefined,
    };
  } catch (e) {
    console.warn('[auth] getCurrentUser Sanity fetch failed:', e);
    return null;
  }
}
