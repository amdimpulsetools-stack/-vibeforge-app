import imageCompression from "browser-image-compression";

/**
 * Client-side image compression for dermatology before/after photos.
 *
 * Produces TWO WebP renditions from a single source file, entirely in the
 * browser (in a Web Worker, so the main thread never janks):
 *
 *   - display: ~1600px long side, ~1.2 MB target — what you see when a
 *     photo is expanded in the lightbox.
 *   - thumb:   ~400px long side, ~40 KB target — what the gallery wall
 *     renders. A 100-photo grid is then ~4 MB total instead of ~120 MB.
 *
 * This is the single most important performance + cost decision for the
 * feature: an untouched iPhone photo is 8-12 MB, which would make uploads
 * slow on clinic wifi (so staff stop using it) and balloon storage. Doing
 * it on the way IN is irreversible-friendly — we never store the raw blob.
 *
 * Re-encoding through canvas also strips EXIF (GPS/location), which matters
 * legally for face photos under Ley 29733.
 */
export interface CompressedPhoto {
  display: File;
  thumb: File;
  /** Display image size in bytes (what we record as file_size_bytes). */
  displaySize: number;
}

export async function compressPhotoForUpload(source: File): Promise<CompressedPhoto> {
  const [display, thumb] = await Promise.all([
    imageCompression(source, {
      maxWidthOrHeight: 1600,
      maxSizeMB: 1.2,
      fileType: "image/webp",
      initialQuality: 0.82,
      useWebWorker: true,
    }),
    imageCompression(source, {
      maxWidthOrHeight: 400,
      maxSizeMB: 0.1,
      fileType: "image/webp",
      initialQuality: 0.7,
      useWebWorker: true,
    }),
  ]);

  // browser-image-compression returns a Blob typed as File in most paths,
  // but normalize to a real File with a stable name + type so FormData and
  // the server see a proper filename/extension.
  const toFile = (blob: Blob, name: string) =>
    new File([blob], name, { type: "image/webp" });

  return {
    display: toFile(display, "photo.webp"),
    thumb: toFile(thumb, "thumb.webp"),
    displaySize: display.size,
  };
}
