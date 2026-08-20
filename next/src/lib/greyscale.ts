// lib/greyscale.ts — browser-side image desaturation.
//
// The Dossier spec is categorical: photographs are Saturation 0%, "no
// colour tint, ever". pptxgenjs cannot desaturate, and adding a server
// image library for one operation is a heavy answer to a small problem —
// so the conversion happens where the pixels already are, in the canvas,
// before the file is ever uploaded. What reaches the server is correct by
// construction rather than by a later processing step that could be
// skipped.

/** Longest edge of the stored image — the cover is full-bleed at 13.333in. */
const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.9;

export interface GreyscaleResult {
  file:    File;
  preview: string;   // object URL — revoke when finished with it
}

/**
 * Convert an image file to greyscale, downscaled to a sane maximum.
 * Rejects with a human-readable reason rather than throwing a DOM error.
 */
export async function toGreyscaleJpeg(input: File): Promise<GreyscaleResult> {
  if (!input.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  const bitmap = await createImageBitmap(input).catch(() => {
    throw new Error('That image could not be read.');
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width  * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');

  // Draw desaturated. The filter is applied by the canvas itself, so the
  // pixels are grey before they are ever read back.
  ctx.filter = 'grayscale(100%)';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('That image could not be converted.');

  const name = input.name.replace(/\.[^.]+$/, '') || 'deck-photo';
  const file = new File([blob], `${name}-greyscale.jpg`, { type: 'image/jpeg' });
  return { file, preview: URL.createObjectURL(blob) };
}
