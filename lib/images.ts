/**
 * Image import for the portfolio.
 *
 * A modern phone photo is 4000 px wide; placed six inches wide that is 660 DPI, which
 * no screen or printer can use and which turns a portfolio into a 60 MB file. So
 * import downscales to a sane target, and the PDF carries exactly the pixels it shows.
 */

import type { PortfolioCrop, PortfolioImageRef } from "./portfolioTypes";
import { blobToDataUrl, imageStore, type StoredImage } from "./imageStore";
import { makeId } from "./utils";

/** Print quality starts to suffer below ~150 DPI; 200 is the sweet spot. */
export const TARGET_DPI = 200;
export const MIN_DPI = 120;

export const FULL_CROP: PortfolioCrop = { x: 0, y: 0, w: 1, h: 1 };

function decode(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be decoded."));
    };
    element.src = url;
  });
}

export interface ImportedImage {
  ref: PortfolioImageRef;
  /** A data URL for immediate preview, so the UI never has to await the store. */
  preview: string;
  notes: string[];
}

/**
 * Reads a file, downscales it, and stores the bytes in IndexedDB.
 *
 * Returns the reference the portfolio document keeps — the document never holds pixels,
 * only ids, so the JSON stays small enough for localStorage.
 */
export async function importImageFile(
  file: File,
  options: { placedWidthIn?: number } = {},
): Promise<ImportedImage> {
  const notes: string[] = [];
  const element = await decode(file);
  const naturalWidth = element.naturalWidth;
  const naturalHeight = element.naturalHeight;

  // The width it will actually be placed at decides the pixels we need. Without a hint,
  // assume a full page width, which is the common case.
  const placedIn = options.placedWidthIn ?? 7;
  const wantedWidth = Math.round(Math.min(naturalWidth, placedIn * TARGET_DPI));
  const scale = wantedWidth / naturalWidth;
  const wantedHeight = Math.max(1, Math.round(naturalHeight * scale));

  let blob: Blob = file;
  if (scale < 0.98) {
    const canvas = document.createElement("canvas");
    canvas.width = wantedWidth;
    canvas.height = wantedHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(element, 0, 0, wantedWidth, wantedHeight);
      blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((result) => resolve(result ?? file), "image/jpeg", 0.86),
      );
      notes.push(
        `Downscaled from ${naturalWidth}×${naturalHeight} to ${wantedWidth}×${wantedHeight} — about ${TARGET_DPI} DPI at ${placedIn}in wide.`,
      );
    }
  } else if (wantedWidth < placedIn * MIN_DPI) {
    notes.push(
      `${naturalWidth}px wide is under ${MIN_DPI} DPI at ${placedIn}in. It will look soft; a bigger export would help.`,
    );
  }
  URL.revokeObjectURL(element.src);

  const id = makeId("img");
  const stored: StoredImage = {
    id,
    name: file.name,
    type: blob.type || file.type || "image/jpeg",
    width: wantedWidth,
    height: wantedHeight,
    bytes: blob.size,
    blob,
    createdAt: new Date().toISOString(),
  };
  await imageStore.put(stored);

  return {
    ref: {
      id,
      name: file.name,
      width: wantedWidth,
      height: wantedHeight,
      crop: { ...FULL_CROP },
    },
    preview: await blobToDataUrl(blob),
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/* Crop and resolution maths                                                  */
/* -------------------------------------------------------------------------- */

/** Clamps a crop so it stays inside the image and never collapses to nothing. */
export function clampCrop(crop: PortfolioCrop): PortfolioCrop {
  const w = Math.min(1, Math.max(0.02, crop.w));
  const h = Math.min(1, Math.max(0.02, crop.h));
  return {
    w,
    h,
    x: Math.min(1 - w, Math.max(0, crop.x)),
    y: Math.min(1 - h, Math.max(0, crop.y)),
  };
}

/** The slice of source pixels a frame shows, in image coordinates. */
export function sourceRect(image: PortfolioImageRef): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} {
  const crop = clampCrop(image.crop);
  return {
    sx: Math.round(crop.x * image.width),
    sy: Math.round(crop.y * image.height),
    sw: Math.max(1, Math.round(crop.w * image.width)),
    sh: Math.max(1, Math.round(crop.h * image.height)),
  };
}

/** Aspect ratio of the visible part of an image. */
export function croppedAspect(image: PortfolioImageRef): number {
  const rect = sourceRect(image);
  return rect.sw / rect.sh;
}

/** The DPI an image prints at once placed `placedWidthIn` inches wide. */
export function placedDpi(image: PortfolioImageRef, placedWidthIn: number): number {
  if (placedWidthIn <= 0) return 0;
  return Math.round(sourceRect(image).sw / placedWidthIn);
}

export interface DpiVerdict {
  dpi: number;
  level: "good" | "acceptable" | "poor";
  message: string;
}

/**
 * Whether a placed image is sharp enough, in terms a person cares about.
 *
 * Cropping is what usually breaks this: a 4000px photo cropped to a tenth of its width
 * carries 400px, which is soft the moment it prints six inches wide.
 */
export function dpiVerdict(image: PortfolioImageRef, placedWidthIn: number): DpiVerdict {
  const dpi = placedDpi(image, placedWidthIn);
  if (dpi >= TARGET_DPI) {
    return { dpi, level: "good", message: `${dpi} DPI — sharp at this size.` };
  }
  if (dpi >= MIN_DPI) {
    return {
      dpi,
      level: "acceptable",
      message: `${dpi} DPI — fine on screen, slightly soft printed.`,
    };
  }
  return {
    dpi,
    level: "poor",
    message: `${dpi} DPI — too tight a crop for ${placedWidthIn}in. Widen the crop or place it smaller.`,
  };
}

/**
 * Renders the cropped slice to a JPEG data URL, at the resolution it will print at.
 *
 * Done before layout rather than with a clip path in the PDF, because the file should
 * carry exactly the pixels it shows: a clip keeps the whole image and lets viewers
 * disagree about rounding at the edges.
 */
export async function renderCroppedDataUrl(
  image: PortfolioImageRef,
  options: { placedWidthIn?: number; quality?: number } = {},
): Promise<string | null> {
  const stored = await imageStore.get(image.id);
  if (!stored) return null;
  const element = await decode(stored.blob);
  const rect = sourceRect(image);

  // Aim at the target DPI for the placed size, never upscaling past the source.
  const wantedWidth = Math.round((options.placedWidthIn ?? 7) * TARGET_DPI);
  const scale = Math.min(1, wantedWidth / rect.sw);
  const width = Math.max(1, Math.round(rect.sw * scale));
  const height = Math.max(1, Math.round(rect.sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(element, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
  URL.revokeObjectURL(element.src);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", options.quality ?? 0.88),
  );
  return blob ? blobToDataUrl(blob) : null;
}
