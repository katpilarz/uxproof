// app/api/auth/login/route.ts
//
// POST multipart/form-data { email, name?, avatar? (image file) }
//
// Signing in is claiming an email identity (internal tool — no password).
// The route upserts the deterministic `user` document in Sanity, uploads
// the avatar as an image asset when one is provided, and sets the signed
// httpOnly session cookie.

import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  isValidEmail,
  normalizeEmail,
  signSessionToken,
  userIdForEmail,
} from '@/lib/auth';

const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB

export async function POST(request: NextRequest) {
  try {
    const form   = await request.formData();
    const email  = normalizeEmail(String(form.get('email') ?? ''));
    const name   = String(form.get('name') ?? '').trim();
    const avatar = form.get('avatar');

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const userId = userIdForEmail(email);
    const now    = new Date().toISOString();

    await writeClient.createIfNotExists({
      _type:     'user',
      _id:       userId,
      email,
      createdAt: now,
    });

    // Optional avatar upload → Sanity image asset → user.avatar
    let avatarRef: string | null = null;
    if (avatar instanceof File && avatar.size > 0) {
      if (avatar.size > MAX_AVATAR_BYTES) {
        return NextResponse.json({ error: 'Avatar image must be 4MB or smaller.' }, { status: 400 });
      }
      if (!avatar.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Avatar must be an image file.' }, { status: 400 });
      }
      const buffer = Buffer.from(await avatar.arrayBuffer());
      const asset  = await writeClient.assets.upload('image', buffer, {
        filename:    avatar.name || 'avatar',
        contentType: avatar.type,
      });
      avatarRef = asset._id;
    }

    let patch = writeClient.patch(userId).set({ lastLoginAt: now });
    if (name)      patch = patch.set({ name });
    if (avatarRef) patch = patch.set({
      avatar: { _type: 'image', asset: { _type: 'reference', _ref: avatarRef } },
    });
    await patch.commit();

    const doc = await writeClient.fetch(
      `*[_type == "user" && _id == $id][0]{
        _id, email, name, "avatarUrl": avatar.asset->url
      }`,
      { id: userId },
    );

    const res = NextResponse.json({
      user: {
        id:        doc._id,
        email:     doc.email,
        name:      doc.name || undefined,
        avatarUrl: doc.avatarUrl || undefined,
      },
    });
    res.cookies.set(SESSION_COOKIE, signSessionToken(email), {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   SESSION_MAX_AGE_S,
    });
    return res;
  } catch (e) {
    console.error('[api/auth/login] error:', e);
    return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
