// app/api/auth/password/route.ts
//
// POST application/json { currentPassword?, newPassword }
//
// Changes the signed-in user's password. The current password must be
// supplied and must verify — a valid session alone is not enough, so a
// borrowed browser can't be used to lock the owner out of their account.
// The only exception is an account that has no password yet (a legacy
// passwordless document), where there is nothing to prove.

import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import {
  getCurrentUser,
  getUserRecordByEmail,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const body            = await request.json().catch(() => ({}));
    const currentPassword = String(body?.currentPassword ?? '');
    const newPassword     = String(body?.newPassword ?? '');

    const problem = passwordProblem(newPassword);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    // Re-read from Sanity: getCurrentUser() deliberately drops the digest,
    // and the check has to run against the stored value.
    const record = await getUserRecordByEmail(user.email);
    if (!record) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    if (record.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 });
      }
      const ok = await verifyPassword(currentPassword, record.passwordHash);
      if (!ok) {
        return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 403 });
      }
      if (await verifyPassword(newPassword, record.passwordHash)) {
        return NextResponse.json(
          { error: 'That is already your password — choose a different one.' },
          { status: 400 },
        );
      }
    }

    await writeClient
      .patch(record._id)
      .set({
        passwordHash:      await hashPassword(newPassword),
        passwordUpdatedAt: new Date().toISOString(),
      })
      .commit();

    // The session cookie carries only the email, so it stays valid — the
    // user is not signed out by changing their own password.
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/auth/password] error:', e);
    return NextResponse.json({ error: 'Could not change your password. Please try again.' }, { status: 500 });
  }
}
