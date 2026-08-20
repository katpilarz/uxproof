// app/api/deck-image/route.ts
//
// The photograph used on the deck cover and section dividers.
//
// GET    — is one set, and where does it live?
// POST   — replace it (multipart { image })
// DELETE — revert to the bundled photograph
//
// The Dossier spec is explicit that photographs carry no colour tint, and
// pptxgenjs cannot desaturate an image. The browser does it instead: the
// settings panel draws the picked file to a canvas, strips the saturation
// and uploads the greyscale result, so what lands here is already correct
// and the server never needs an image-processing dependency.

import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { getCurrentUser } from '@/lib/auth';
import { uploadAvatarAsset, MAX_DECK_IMAGE_BYTES } from '@/lib/avatar';

/** The signed-in user's deck photograph URL, or null when unset. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ url: null, error: 'Not signed in' }, { status: 401 });
  }
  try {
    const url = await writeClient.fetch(
      `*[_type == "user" && _id == $id][0].deckImage.asset->url`,
      { id: user.id },
    );
    return NextResponse.json({ url: url ?? null });
  } catch (e) {
    console.error('[api/deck-image] GET error:', e);
    return NextResponse.json({ url: null, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  try {
    const form  = await request.formData().catch(() => null);
    const image = form?.get('image');
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    }

    const upload = await uploadAvatarAsset(image, {
      maxBytes: MAX_DECK_IMAGE_BYTES,
      label:    'Deck photograph',
    });
    if ('error' in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }

    await writeClient
      .patch(user.id)
      .set({ deckImage: { _type: 'image', asset: { _type: 'reference', _ref: upload.assetId } } })
      .commit();

    const url = await writeClient.fetch(
      `*[_type == "user" && _id == $id][0].deckImage.asset->url`,
      { id: user.id },
    );
    return NextResponse.json({ ok: true, url: url ?? null });
  } catch (e) {
    console.error('[api/deck-image] POST error:', e);
    return NextResponse.json({ error: 'Could not save that image. Please try again.' }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  try {
    await writeClient.patch(user.id).unset(['deckImage']).commit();
    return NextResponse.json({ ok: true, url: null });
  } catch (e) {
    console.error('[api/deck-image] DELETE error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
