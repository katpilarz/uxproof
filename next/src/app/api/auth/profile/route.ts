// app/api/auth/profile/route.ts
//
// PATCH multipart/form-data { name?, avatar? (image file), removeAvatar? }
//
// Updates the signed-in user's profile details. The email is deliberately
// NOT editable: it derives the deterministic user _id, so changing it
// would strand every chat, file and deck the account owns.

import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { getCurrentUser, getUserRecordByEmail, toAuthUser } from '@/lib/auth';
import { uploadAvatarAsset } from '@/lib/avatar';

const MAX_NAME_LENGTH = 80;

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'Expected a multipart form.' }, { status: 400 });
    }

    const hasName      = form.has('name');
    const name         = String(form.get('name') ?? '').trim();
    const avatar       = form.get('avatar');
    const removeAvatar = String(form.get('removeAvatar') ?? '') === 'true';

    if (hasName && name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Display name must be ${MAX_NAME_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    let patch = writeClient.patch(user.id);
    let touched = false;

    if (hasName) {
      // An emptied field means "no display name" — unset rather than
      // storing '' so the UI's `name || email` fallbacks still fire.
      patch = name ? patch.set({ name }) : patch.unset(['name']);
      touched = true;
    }

    if (avatar instanceof File && avatar.size > 0) {
      const upload = await uploadAvatarAsset(avatar);
      if ('error' in upload) {
        return NextResponse.json({ error: upload.error }, { status: 400 });
      }
      patch = patch.set({
        avatar: { _type: 'image', asset: { _type: 'reference', _ref: upload.assetId } },
      });
      touched = true;
    } else if (removeAvatar) {
      patch = patch.unset(['avatar']);
      touched = true;
    }

    if (!touched) {
      return NextResponse.json({ user, changed: false });
    }

    await patch.commit();

    const record = await getUserRecordByEmail(user.email);
    if (!record) {
      return NextResponse.json({ error: 'Profile update failed.' }, { status: 500 });
    }
    return NextResponse.json({ user: toAuthUser(record), changed: true });
  } catch (e) {
    console.error('[api/auth/profile] error:', e);
    return NextResponse.json({ error: 'Could not save your profile. Please try again.' }, { status: 500 });
  }
}
