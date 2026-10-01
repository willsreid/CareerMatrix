/**
 * Reading PNGs, and comparing two of them.
 *
 * The visual suite needs to say "this screen changed" without an image library: a browser writes the PNGs and
 * this reads them back — inflate, undo the per-row filters, then compare pixel by pixel. Hand-written for the
 * same reason `fixturePng.mts` is: nothing in `package.json` should exist only for the checks.
 *
 * The formats it accepts are exactly the ones a browser screenshot uses — 8-bit truecolour, with or without
 * alpha, not interlaced. Anything else is reported rather than guessed at, because a decoder that half-worked on
 * an unexpected image would produce a diff nobody could trust.
 */

import { deflateSync, inflateSync } from "node:zlib";

import { crc32, pngChunk } from "./fixturePng.mts";

/** Pixels, as either RGB or RGBA, row by row. */
export interface Raster {
  width: number;
  height: number;
  channels: 3 | 4;
  data: Uint8Array;
}

/** How two images differ, in the terms a person can act on. */
export interface Diff {
  total: number;
  /** Pixels off by more than the tolerance. */
  different: number;
  /** Different / total, and 1 when the sizes differ because then nothing lines up. */
  share: number;
  /** The largest single-channel difference seen anywhere. */
  worst: number;
  /** True when the two images are not even the same shape. */
  resized: boolean;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const readUint32 = (bytes: Uint8Array, at: number) =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

/** PNG's predictor, which the encoder chose per row and this has to undo. */
function paeth(left: number, above: number, aboveLeft: number): number {
  const estimate = left + above - aboveLeft;
  const toLeft = Math.abs(estimate - left);
  const toAbove = Math.abs(estimate - above);
  const toCorner = Math.abs(estimate - aboveLeft);
  if (toLeft <= toAbove && toLeft <= toCorner) return left;
  return toAbove <= toCorner ? above : aboveLeft;
}

export function decodePng(input: Uint8Array): Raster {
  const bytes = Buffer.from(input);
  for (let index = 0; index < SIGNATURE.length; index += 1) {
    if (bytes[index] !== SIGNATURE[index]) throw new Error("not a PNG");
  }

  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  const parts: Buffer[] = [];

  let at = SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = readUint32(bytes, at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = readUint32(body, 0);
      height = readUint32(body, 4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === "IDAT") {
      parts.push(Buffer.from(body));
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }

  if (!width || !height) throw new Error("PNG has no header");
  if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
  }

  const channels: 3 | 4 = colour === 6 ? 4 : 3;
  const raw = new Uint8Array(inflateSync(Buffer.concat(parts)));
  const stride = width * channels;
  const out = new Uint8Array(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[to + x - channels] : 0;
      const above = y > 0 ? out[to - stride + x] : 0;
      const aboveLeft = y > 0 && x >= channels ? out[to - stride + x - channels] : 0;
      const value = raw[from + x];
      const restored =
        filter === 0
          ? value
          : filter === 1
            ? value + left
            : filter === 2
              ? value + above
              : filter === 3
                ? value + ((left + above) >> 1)
                : filter === 4
                  ? value + paeth(left, above, aboveLeft)
                  : Number.NaN;
      if (Number.isNaN(restored)) throw new Error(`unknown PNG filter ${filter}`);
      out[to + x] = restored & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/** The same shape back out, for writing a diff image a person can look at. */
export function encodePng(raster: Raster): Buffer {
  const { width, height, channels, data } = raster;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = channels === 4 ? 6 : 2; // truecolour, with or without alpha
  return Buffer.concat([
    Buffer.from(SIGNATURE),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Two images, pixel by pixel.
 *
 * `tolerance` is there for anti-aliasing, not for hiding changes: a channel has to move by more than it before
 * the pixel counts as different, and a differing pixel is counted once however far it moved.
 */
export function diffRasters(before: Raster, after: Raster, tolerance = 8): Diff {
  const shapeChanged = before.width !== after.width || before.height !== after.height;
  const total = before.width * before.height;
  if (shapeChanged) {
    return { total, different: 0, share: 1, worst: 255, resized: true };
  }
  let different = 0;
  let worst = 0;
  for (let index = 0; index < total; index += 1) {
    const a = index * before.channels;
    const b = index * after.channels;
    const moved = Math.max(
      Math.abs(before.data[a] - after.data[b]),
      Math.abs(before.data[a + 1] - after.data[b + 1]),
      Math.abs(before.data[a + 2] - after.data[b + 2]),
    );
    if (moved > worst) worst = moved;
    if (moved > tolerance) different += 1;
  }
  return { total, different, share: total ? different / total : 0, worst, resized: false };
}

/** What changed, painted red over a dimmed copy of the new image, so a diff can be looked at rather than read. */
export function markDifferences(before: Raster, after: Raster, tolerance = 8): Raster {
  if (before.width !== after.width || before.height !== after.height) return after;
  const out: Raster = {
    width: after.width,
    height: after.height,
    channels: 3,
    data: new Uint8Array(after.width * after.height * 3),
  };
  for (let index = 0; index < after.width * after.height; index += 1) {
    const a = index * before.channels;
    const b = index * after.channels;
    const moved = Math.max(
      Math.abs(before.data[a] - after.data[b]),
      Math.abs(before.data[a + 1] - after.data[b + 1]),
      Math.abs(before.data[a + 2] - after.data[b + 2]),
    );
    const to = index * 3;
    if (moved > tolerance) {
      out.data[to] = 255;
      out.data[to + 1] = 0;
      out.data[to + 2] = 0;
    } else {
      out.data[to] = after.data[b] >> 1;
      out.data[to + 1] = after.data[b + 1] >> 1;
      out.data[to + 2] = after.data[b + 2] >> 1;
    }
  }
  return out;
}

/** A raster of one colour: what a stand-in browser writes, and what a test needs to hand. */
export function solidRaster(width: number, height: number, colour: [number, number, number]): Raster {
  const data = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 3] = colour[0];
    data[index * 3 + 1] = colour[1];
    data[index * 3 + 2] = colour[2];
  }
  return { width, height, channels: 3, data };
}

export { crc32 };

