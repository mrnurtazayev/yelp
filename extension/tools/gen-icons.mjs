// Генератор иконок расширения (без внешних зависимостей).
// Рисует красный скруглённый квадрат с белым «облачком» сообщения и
// тремя точками (индикатор набора). Рендер в 4x с даунскейлом = сглаживание.
// Запуск:  node extension/tools/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const RED = [211, 35, 35];
const WHITE = [255, 255, 255];

function make(size) {
  const S = 4; // supersample
  const W = size * S;
  const H = size * S;
  const buf = new Uint8Array(W * H * 4); // RGBA, прозрачный фон

  const px = (x, y, [r, g, b], a = 255) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const inRoundRect = (x, y, rx, ry, rw, rh, r) => {
    if (x < rx || y < ry || x >= rx + rw || y >= ry + rh) return false;
    const cx = Math.min(Math.max(x, rx + r), rx + rw - r);
    const cy = Math.min(Math.max(y, ry + r), ry + rh - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r ||
      (x >= rx + r && x < rx + rw - r) || (y >= ry + r && y < ry + rh - r);
  };
  const circle = (cx, cy, rad, color) => {
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) px(x, y, color);
  };

  // фон — красный скруглённый квадрат
  const bgR = W * 0.22;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (inRoundRect(x, y, 0, 0, W, H, bgR)) px(x, y, RED);

  // белое облачко сообщения
  const bx = W * 0.16, by = H * 0.2, bw = W * 0.68, bh = H * 0.42, br = W * 0.13;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (inRoundRect(x, y, bx, by, bw, bh, br)) px(x, y, WHITE);

  // хвостик облачка (треугольник вниз-влево)
  const tri = [
    [W * 0.3, by + bh - 1],
    [W * 0.46, by + bh - 1],
    [W * 0.3, H * 0.82],
  ];
  const sign = (p, a, b) =>
    (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  for (let y = Math.floor(by); y < H * 0.85; y++)
    for (let x = Math.floor(bx); x < W * 0.5; x++) {
      const p = [x, y];
      const d1 = sign(p, tri[0], tri[1]);
      const d2 = sign(p, tri[1], tri[2]);
      const d3 = sign(p, tri[2], tri[0]);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) px(x, y, WHITE);
    }

  // три красные точки — индикатор набора
  const dotY = by + bh * 0.45;
  const dotR = W * 0.052;
  circle(W * 0.35, dotY, dotR, RED);
  circle(W * 0.5, dotY, dotR, RED);
  circle(W * 0.65, dotY, dotR, RED);

  // даунскейл box-фильтром → сглаживание
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < S; dy++)
        for (let dx = 0; dx < S; dx++) {
          const i = ((y * S + dy) * W + (x * S + dx)) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
      const n = S * S;
      const o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  return out;
}

// ---- PNG-кодер ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  const rgba = make(size);
  writeFileSync(join(OUT, `icon${size}.png`), encodePng(rgba, size, size));
  console.log(`icon${size}.png`);
}
