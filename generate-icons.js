// Generates simple PNG app icons with no dependencies.
// A dark rounded background with an accent circle + a "Q" wedge.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUT = new URL("./public/icons/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [15, 17, 21];      // #0f1115
const ACCENT = [79, 156, 249]; // #4f9cf9

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.34, rInner = size * 0.20;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      // ring (the "Q" body) with a small gap bottom-right for the tail
      const inRing = d <= rOuter && d >= rInner;
      const angle = Math.atan2(y - cy, x - cx);
      const gap = angle > 0.5 && angle < 1.1; // bottom-right notch
      let col = BG;
      if (inRing && !gap) col = ACCENT;
      // tail of the Q
      if (Math.abs(angle - 0.8) < 0.35 && d > rInner * 0.9 && d < rOuter * 1.25) col = ACCENT;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
    }
  }
  // add filter byte (0) at start of each scanline
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, OUT), png(size));
  console.log(`wrote icon-${size}.png`);
}
