// lib/avatar.ts — server-only avatar upload, shared by /api/auth/register
// and /api/auth/profile so both enforce exactly the same limits.

import { writeClient } from '@/lib/sanity';

export const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB

/**
 * Upload an image File to Sanity and return its asset _id. Validation
 * failures come back as `{ error }` rather than a throw, because they are
 * the caller's 400 response, not a server fault.
 */
export async function uploadAvatarAsset(
  avatar: File,
): Promise<{ assetId: string } | { error: string }> {
  if (avatar.size > MAX_AVATAR_BYTES) {
    return { error: 'Avatar image must be 4MB or smaller.' };
  }
  if (!avatar.type.startsWith('image/')) {
    return { error: 'Avatar must be an image file.' };
  }
  const buffer = Buffer.from(await avatar.arrayBuffer());
  const asset  = await writeClient.assets.upload('image', buffer, {
    filename:    avatar.name || 'avatar',
    contentType: avatar.type,
  });
  return { assetId: asset._id };
}
