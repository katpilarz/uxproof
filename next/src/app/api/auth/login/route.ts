// app/api/auth/login/route.ts
//
// POST application/json { email, password }
//
// Signing in proves an email identity with a password. The account must
// already exist — creating one goes through /api/auth/register, so a typo
// in the email is refused instead of silently opening an empty workspace.
//
// ONE migration path: accounts created before passwords existed have no
// `passwordHash`. Rather than locking those users out of their own chats
// and decks, the first sign-in ADOPTS the password they type as the
// account's password. The response says so via `adoptedPassword` so the
// UI can tell them what just happened.

import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import {
  SESSION_COOKIE,
  getUserRecordByEmail,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
  sessionCookieOptions,
  signSessionToken,
  toAuthUser,
  verifyPassword,
} from '@/lib/auth';

// One message for "no such account" and "wrong password" alike: telling
// them apart would turn this route into an account-enumeration oracle.
const BAD_CREDENTIALS = 'Incorrect email or password.';

export async function POST(request: NextRequest) {
  try {
    const body     = await request.json().catch(() => ({}));
    const email    = normalizeEmail(String(body?.email ?? ''));
    const password = String(body?.password ?? '');

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Please enter your password.' }, { status: 400 });
    }

    const record = await getUserRecordByEmail(email);
    if (!record) {
      return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
    }

    const now = new Date().toISOString();
    let adoptedPassword = false;

    if (record.passwordHash) {
      const ok = await verifyPassword(password, record.passwordHash);
      if (!ok) {
        return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
      }
      await writeClient.patch(record._id).set({ lastLoginAt: now }).commit();
    } else {
      // Legacy passwordless account — adopt this password. It must still
      // meet the strength rule, otherwise the migration would let an
      // account settle on a weaker password than a new signup could.
      const problem = passwordProblem(password);
      if (problem) {
        return NextResponse.json(
          {
            error:
              `This account doesn't have a password yet, so the one you type now becomes it — ${
                problem.charAt(0).toLowerCase() + problem.slice(1)
              }`,
          },
          { status: 400 },
        );
      }
      await writeClient
        .patch(record._id)
        .set({
          passwordHash:      await hashPassword(password),
          passwordUpdatedAt: now,
          lastLoginAt:       now,
        })
        .commit();
      adoptedPassword = true;
    }

    // hasPassword is true either way by this point: the account either had
    // a digest, or just adopted one above.
    const res = NextResponse.json({
      user: { ...toAuthUser(record), hasPassword: true },
      adoptedPassword,
    });
    res.cookies.set(SESSION_COOKIE, signSessionToken(email), sessionCookieOptions());
    return res;
  } catch (e) {
    console.error('[api/auth/login] error:', e);
    return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
