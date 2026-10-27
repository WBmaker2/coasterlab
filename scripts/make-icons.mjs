import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function png(width, height, render) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = render(x, y);
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3] ?? 255;
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function icon(size) {
  const s = size / 512;
  const orange = [255, 79, 0, 255];
  const ink = [20, 21, 24, 255];
  const white = [255, 255, 255, 255];
  return png(size, size, (x, y) => {
    const px = x / s;
    const py = y / s;
    const cx = 256;
    const cy = 282;
    const rx = 138;
    const ry = 172;
    const nx = (px - cx) / rx;
    const ny = (py - cy) / ry;
    const r = Math.hypot(nx, ny);
    if (r > 0.78 && r < 1.0) return ink;
    // ground rail
    if (py > 436 && py < 462 && px > 50 && px < 462) return ink;
    // cart
    if (px > 314 && px < 394 && py > 390 && py < 430) return white;
    if (px > 320 && px < 350 && py > 430 && py < 448) return ink;
    if (px > 362 && px < 392 && py > 430 && py < 448) return ink;
    return orange;
  });
}

writeFileSync(join(outDir, 'icon-512.png'), icon(512));
writeFileSync(join(outDir, 'icon-192.png'), icon(192));
writeFileSync(
  join(outDir, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ff4f00"/>
  <ellipse cx="256" cy="282" rx="138" ry="172" fill="none" stroke="#141518" stroke-width="38"/>
  <rect x="50" y="436" width="412" height="26" fill="#141518"/>
  <rect x="314" y="390" width="80" height="40" fill="#ffffff"/>
  <rect x="320" y="430" width="30" height="18" fill="#141518"/>
  <rect x="362" y="430" width="30" height="18" fill="#141518"/>
</svg>
`
);
console.log('Wrote PWA icons to public/icons');
