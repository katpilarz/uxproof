// lib/avatar.ts — server-only image upload, shared by /api/auth/register,
// /api/auth/profile and /api/deck-image so they all enforce the same limits.

import { writeClient } from '@/lib/sanity';

export const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB
/** Deck photographs are full-bleed, so they get a larger ceiling. */
export const MAX_DECK_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

/**
 * Upload an image File to Sanity and return its asset _id. Validation
 * failures come back as `{ error }` rather than a throw, because they are
 * the caller's 400 response, not a server fault.
 */
export async function uploadAvatarAsset(
  avatar: File,
  opts: { maxBytes?: number; label?: string } = {},
): Promise<{ assetId: string } | { error: string }> {
  const maxBytes = opts.maxBytes ?? MAX_AVATAR_BYTES;
  const label    = opts.label ?? 'Avatar';
  if (avatar.size > maxBytes) {
    return { error: `${label} must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller.` };
  }
  if (!avatar.type.startsWith('image/')) {
    return { error: `${label} must be an image file.` };
  }
  const buffer = Buffer.from(await avatar.arrayBuffer());
  const asset  = await writeClient.assets.upload('image', buffer, {
    filename:    avatar.name || 'avatar',
    contentType: avatar.type,
  });
  return { assetId: asset._id };
}
