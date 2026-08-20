// app/api/auth/register/route.ts
//
// POST multipart/form-data { email, password, name?, avatar? (image file) }
//
// Creates the account: the deterministic `user` document, its scrypt
// password digest, an optional display name, and an optional avatar
// uploaded as a Sanity image asset. Signs the new user straight in.
//
// An email that already has a password is refused — recovering an
// existing account is a sign-in, not a re-registration, and silently
// overwriting the digest here would be an account takeover.

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
  userIdForEmail,
} from '@/lib/auth';
import { uploadAvatarAsset } from '@/lib/avatar';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'Expected a multipart form.' }, { status: 400 });
    }

    const email    = normalizeEmail(String(form.get('email') ?? ''));
    const password = String(form.get('password') ?? '');
    const name     = String(form.get('name') ?? '').trim();
    const avatar   = form.get('avatar');

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const problem = passwordProblem(password);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const existing = await getUserRecordByEmail(email);
    if (existing?.passwordHash) {
      return NextResponse.json(
        { error: 'An account already exists for that email. Sign in instead.' },
        { status: 409 },
      );
    }

    const userId = userIdForEmail(email);
    const now    = new Date().toISOString();

    // createIfNotExists, not create — a legacy passwordless document for
    // this email already owns chats and decks, and registering must adopt
    // it rather than fail or orphan that data.
    await writeClient.createIfNotExists({
      _type:     'user',
      _id:       userId,
      email,
      createdAt: now,
    });

    let avatarRef: string | null = null;
    if (avatar instanceof File && avatar.size > 0) {
      const upload = await uploadAvatarAsset(avatar);
      if ('error' in upload) {
        return NextResponse.json({ error: upload.error }, { status: 400 });
      }
      avatarRef = upload.assetId;
    }

    let patch = writeClient.patch(userId).set({
      passwordHash:      await hashPassword(password),
      passwordUpdatedAt: now,
      lastLoginAt:       now,
    });
    if (name)      patch = patch.set({ name });
    if (avatarRef) patch = patch.set({
      avatar: { _type: 'image', asset: { _type: 'reference', _ref: avatarRef } },
    });
    await patch.commit();

    const record = await getUserRecordByEmail(email);
    if (!record) {
      return NextResponse.json({ error: 'Account creation failed. Please try again.' }, { status: 500 });
    }

    const res = NextResponse.json({ user: toAuthUser(record) });
    res.cookies.set(SESSION_COOKIE, signSessionToken(email), sessionCookieOptions());
    return res;
  } catch (e) {
    console.error('[api/auth/register] error:', e);
    return NextResponse.json({ error: 'Account creation failed. Please try again.' }, { status: 500 });
  }
}
