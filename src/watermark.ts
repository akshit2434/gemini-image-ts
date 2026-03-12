import sharp from 'sharp';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// When running from dist/, resources is at ../resources
// When running from src/ (during development with tsx), resources is at ../resources
const DEFAULT_MASK_DIR = path.resolve(__dirname, "../resources/masks");

const ALPHA_THRESHOLD = 0.002;

/**
 * Options for watermark removal.
 */
export interface WatermarkOptions {
  /** Directory containing mask-48.png and mask-96.png (default: package internal masks) */
  maskDir?: string;
  /** Whether to throw if mask is missing (default: false) */
  strict?: boolean;
}

/**
 * Selects the correct mask based on image resolution.
 * ≥1024px on longest side → 96x96, else → 48x48
 */
function resolveMaskPath(
  imgWidth: number,
  imgHeight: number,
  maskDir?: string
): { maskPath: string; size: 48 | 96 } {
  const size = Math.max(imgWidth, imgHeight) >= 1024 ? 96 : 48;
  const dir = maskDir || DEFAULT_MASK_DIR;
  return { maskPath: path.join(dir, `mask-${size}.png`), size };
}

/**
 * Losslessly removes the Gemini visible watermark via reverse alpha blending.
 * Formula: original = (watermarked - α * 255) / (1 - α)
 * 
 * @param buffer - Input image buffer
 * @param options - Watermark removal options
 * @returns Cleaned image buffer
 */
export async function removeGeminiWatermark(
  buffer: Buffer,
  options: WatermarkOptions
): Promise<Buffer> {
  const imgSharp = sharp(buffer);
  const imgMeta = await imgSharp.metadata();
  const W = imgMeta.width;
  const H = imgMeta.height;

  if (!W || !H) throw new Error("Could not determine image dimensions.");

  const { maskPath, size } = resolveMaskPath(W, H, options.maskDir);
  
  if (!existsSync(maskPath)) {
    if (options.strict) {
      throw new Error(`Mask file not found at ${maskPath}. Run mask extraction first.`);
    }
    // Silently return original buffer if mask is missing and not strict
    return buffer;
  }

  const { data: imgData, info: imgInfo } = await imgSharp
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: maskData } = await sharp(maskPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mW = size;
  const mH = size;
  const ch = imgInfo.channels;

  const startX = W - mW;
  const startY = H - mH;

  for (let y = 0; y < mH; y++) {
    for (let x = 0; x < mW; x++) {
      const mIdx = (y * mW + x) * 4;
      
      // Alpha derived from max(R,G,B) of the mask
      const alpha = Math.max(maskData[mIdx], maskData[mIdx + 1], maskData[mIdx + 2]) / 255;

      if (alpha <= ALPHA_THRESHOLD) continue;

      const imgIdx = ((startY + y) * W + (startX + x)) * ch;
      const aClamped = Math.min(alpha, 0.99);

      for (let c = 0; c < 3; c++) {
        const watermarked = imgData[imgIdx + c];
        const original = (watermarked - aClamped * 255) / (1 - aClamped);
        imgData[imgIdx + c] = Math.round(Math.max(0, Math.min(255, original)));
      }
    }
  }

  return await sharp(imgData, {
    raw: { width: W, height: H, channels: ch as 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Extracts a watermark mask from a pure black Gemini-generated image.
 * 
 * @param blackImageBuffer - Buffer of a pure-black Gemini image
 * @param maskSize - Size of the mask to extract (48 or 96)
 * @returns Buffer of the extracted mask PNG
 */
export async function extractMask(
  blackImageBuffer: Buffer,
  maskSize: 48 | 96
): Promise<Buffer> {
  const { data, info } = await sharp(blackImageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const maskW = maskSize;
  const maskH = maskSize;
  const startX = width - maskW;
  const startY = height - maskH;

  const maskBuf = Buffer.alloc(maskW * maskH * 4);
  for (let y = 0; y < maskH; y++) {
    for (let x = 0; x < maskW; x++) {
      const srcIdx = ((startY + y) * width + (startX + x)) * channels;
      const dstIdx = (y * maskW + x) * 4;
      maskBuf[dstIdx]     = data[srcIdx];
      maskBuf[dstIdx + 1] = data[srcIdx + 1];
      maskBuf[dstIdx + 2] = data[srcIdx + 2];
      maskBuf[dstIdx + 3] = Math.max(data[srcIdx], data[srcIdx + 1], data[srcIdx + 2]);
    }
  }

  return await sharp(maskBuf, { raw: { width: maskW, height: maskH, channels: 4 } })
    .png()
    .toBuffer();
}
