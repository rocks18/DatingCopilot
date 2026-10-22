import type { PhotoObservation } from "./types";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateImageInput(input: { type: string; size: number; name: string }) {
  if (!ALLOWED_IMAGE_TYPES.includes(input.type)) {
    throw new Error(`${input.name}: use a JPEG, PNG, or WebP image.`);
  }
  if (input.size <= 0 || input.size > MAX_IMAGE_BYTES) {
    throw new Error(`${input.name}: image must be between 1 byte and 10 MB.`);
  }
}

export async function analyzePhotoFile(file: File): Promise<PhotoObservation> {
  validateImageInput(file);
  const bitmap = await createImageBitmap(file);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(1, 160 / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error(`${file.name}: this browser could not inspect the image.`);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height).data;
  const luminance: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    luminance.push((0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255);
  }
  const brightness = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  const variance = luminance.reduce((sum, value) => sum + (value - brightness) ** 2, 0) / luminance.length;
  const contrast = Math.min(1, Math.sqrt(variance) * 3);
  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const current = luminance[y * width + x];
      edgeTotal += Math.abs(current - luminance[y * width + x + 1]);
      edgeTotal += Math.abs(current - luminance[(y + 1) * width + x]);
      edgeCount += 2;
    }
  }
  const sharpness = Math.min(1, (edgeTotal / Math.max(edgeCount, 1)) * 6);
  const observations: string[] = [];
  if (originalWidth < 720 || originalHeight < 720) observations.push("Resolution is modest; a larger original may look clearer.");
  if (brightness < 0.25) observations.push("Lighting appears dark.");
  if (brightness > 0.82) observations.push("Highlights may be overexposed.");
  if (sharpness < 0.32) observations.push("The image may appear soft or low-detail.");
  if (contrast < 0.18) observations.push("Low contrast may make the photo feel flat.");
  if (!observations.length) observations.push("Clarity, lighting, and contrast are within a useful range.");

  return {
    name: file.name,
    width: originalWidth,
    height: originalHeight,
    sizeBytes: file.size,
    brightness: Number(brightness.toFixed(3)),
    contrast: Number(contrast.toFixed(3)),
    sharpness: Number(sharpness.toFixed(3)),
    observations,
  };
}
