/**
 * A minimal PNG reader.
 *
 * The project has no image dependency and this pipeline runs offline, so the decoder
 * lives here. It handles the subset the character atlases actually use — 8-bit colour
 * types 2 and 6, non-interlaced — and deliberately does not verify chunk CRCs, because
 * the source atlases carry a malformed `iCCP` checksum that every art tool ignores and
 * that has nothing to do with the pixels.
 */

import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Reverses the per-scanline filter PNG applies before compression. */
function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const target = out.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? target[i - channels] : 0;
      const up = previous ? previous[i] : 0;
      const upLeft = previous && i >= channels ? previous[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter} on row ${y}`);
      target[i] = value & 0xff;
    }
  }
  return out;
}

/** @returns {{ width: number, height: number, data: Buffer }} RGBA, 4 bytes per pixel. */
export function decodePng(path) {
  const file = readFileSync(path);
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${path} is not a PNG`);

  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  let offset = 8;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9];
      if (depth !== 8) throw new Error(`${path}: only 8-bit PNGs are supported, got ${depth}`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`${path}: unsupported colour type ${colorType}`);
      if (body[12] !== 0) throw new Error(`${path}: interlaced PNGs are not supported`);
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
  }

  const channels = colorType === 6 ? 4 : 3;
  const pixels = unfilter(inflateSync(Buffer.concat(idat)), width, height, channels);
  if (channels === 4) return { width, height, data: pixels };

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba[j] = pixels[i];
    rgba[j + 1] = pixels[i + 1];
    rgba[j + 2] = pixels[i + 2];
    rgba[j + 3] = 0xff;
  }
  return { width, height, data: rgba };
}
