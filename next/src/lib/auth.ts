// lib/auth.ts — server-only session helpers.
//
// uxproof is a local-first internal tool, but an account is now protected
// by a password: signing in is proving an email identity, not merely
// claiming one. Passwords are hashed with scrypt (node:crypto — no new
// dependency, no external service) and the resulting digest never leaves
// the server. The session cookie is HMAC-signed so it can't be forged by
// editing the cookie value, and every API route resolves the user from it
// server-side. Users live in Sanity as `user` documents with a
// deterministic _id derived from the email, so repeat logins always map
// to the same document.

import {
  createHmac,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
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
  /**
   * Whether this account has a password set. Accounts created before
   * passwords existed don't, and adopt one on their next sign-in — the
   * profile dialog uses this to decide whether to ask for the current
   * password before setting a new one.
   */
  hasPassword: boolean;
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

// ── Password hashing (scrypt) ────────────────────────────────────────────────
//
// Stored format: `scrypt$<N>$<r>$<p>$<salt b64>$<derived key b64>`. The
// parameters travel with the digest so raising the cost later doesn't
// invalidate existing hashes.

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt:     string | Buffer,
  keylen:   number,
  options:  { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT_N      = 16384; // ~16MB of memory per hash — well under the 32MB default cap
const SCRYPT_R      = 8;
const SCRYPT_P      = 1;
const SCRYPT_KEYLEN = 64;

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH        = 200;

/**
 * Why a password is unacceptable, or null when it's fine. Returning the
 * reason (rather than a bare boolean) keeps the message identical on the
 * client and the server — the API is the authority, the form is a
 * courtesy.
 */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Please enter a password.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key  = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  return [
    'scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P,
    salt.toString('base64'), key.toString('base64'),
  ].join('$');
}

/** Constant-time check of a password against a stored digest. */
export async function verifyPassword(
  password: string,
  stored:   string | null | undefined,
): Promise<boolean> {
  if (!stored || typeof password !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  try {
    const salt     = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    if (!salt.length || !expected.length) return false;
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch (e) {
    console.warn('[auth] verifyPassword failed:', e);
    return false;
  }
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

/** Cookie options shared by every route that writes the session cookie. */
export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_S) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge,
  };
}

// ── User record lookups ──────────────────────────────────────────────────────

/** The stored user document, password digest included. SERVER ONLY. */
export interface UserRecord {
  _id:           string;
  email:         string;
  name?:         string;
  avatarUrl?:    string;
  passwordHash?: string;
}

const USER_PROJECTION = `{
  _id, email, name, passwordHash,
  "avatarUrl": avatar.asset->url
}`;

/**
 * Fetch the raw user document by email — including the password digest,
 * which is why this is never handed to a client. Routes convert it with
 * toAuthUser() before responding.
 */
export async function getUserRecordByEmail(email: string): Promise<UserRecord | null> {
  try {
    const doc = await writeClient.fetch(
      `*[_type == "user" && _id == $id][0]${USER_PROJECTION}`,
      { id: userIdForEmail(email) },
    );
    return doc?._id ? (doc as UserRecord) : null;
  } catch (e) {
    console.warn('[auth] getUserRecordByEmail failed:', e);
    return null;
  }
}

/** Strip the password digest — the only shape that may reach the client. */
export function toAuthUser(doc: UserRecord): AuthUser {
  return {
    id:          doc._id,
    email:       doc.email,
    name:        doc.name || undefined,
    avatarUrl:   doc.avatarUrl || undefined,
    hasPassword: !!doc.passwordHash,
  };
}

/**
 * Resolve the signed-in user from the request cookie, hydrated from Sanity.
 * Returns null when there is no valid session or the user doc is gone.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const email = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!email) return null;

  const doc = await getUserRecordByEmail(email);
  return doc ? toAuthUser(doc) : null;
}
