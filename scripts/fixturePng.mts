/**
 * Real PNG bytes for fixtures and previews.
 *
 * Written by hand rather than with an image library so that nothing in `package.json` exists only
 * for tests. The output is a valid PNG that browsers and macOS both decode — which is checked, not
 * assumed: `sips -g pixelWidth` reads the files the test package writes.
 */

import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * A flat-colour PNG with a lighter band across the upper third, so a placeholder frame is
 * obviously a frame: the band shows which way up an image is when a crop or a flip moves it.
 */
export function makePng(width: number, height: number, colour: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const band = y > height * 0.25 && y < height * 0.45 ? 40 : 0;
      const at = row + 1 + x * 3;
      raw[at] = Math.min(255, colour[0] + band);
      raw[at + 1] = Math.min(255, colour[1] + band);
      raw[at + 2] = Math.min(255, colour[2] + band);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A colour that is obviously different per index, so frames are tellable apart in a preview. */
export function placeholderColour(index: number): [number, number, number] {
  const hue = (index * 47) % 360;
  const sector = hue / 60;
  const x = 1 - Math.abs((sector % 2) - 1);
  const base: [number, number, number] =
    sector < 1 ? [1, x, 0]
      : sector < 2 ? [x, 1, 0]
        : sector < 3 ? [0, 1, x]
          : sector < 4 ? [0, x, 1]
            : sector < 5 ? [x, 0, 1]
              : [1, 0, x];
  // Muted, so the page reads as a document rather than a test pattern.
  return base.map((channel) => Math.round(60 + channel * 90)) as [number, number, number];
}

/** A data URL, which is what the PDF renderer takes for an image source. */
export function pngDataUrl(width: number, height: number, colour: [number, number, number]): string {
  return `data:image/png;base64,${makePng(width, height, colour).toString("base64")}`;
}
