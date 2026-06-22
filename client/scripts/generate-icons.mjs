import sharp from 'sharp';

const SIZE = 512;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c1220"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="${Math.round(SIZE * 0.15)}" fill="url(#bg)"/>
  <text x="${SIZE / 2}" y="${SIZE * 0.52}" text-anchor="middle" fill="#818cf8" font-family="Sora,sans-serif" font-size="${Math.round(SIZE * 0.38)}" font-weight="800" letter-spacing="-4">K</text>
  <text x="${SIZE / 2}" y="${SIZE * 0.76}" text-anchor="middle" fill="#64748b" font-family="DM Sans,sans-serif" font-size="${Math.round(SIZE * 0.08)}" font-weight="600" letter-spacing="14">KHUSELA</text>
</svg>`;

async function generate() {
  await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/khusela-512.png');
  await sharp(Buffer.from(svg)).resize(192, 192).png().toFile('public/khusela-192.png');
  console.log('Icons generated: khusela-192.png, khusela-512.png');
}

generate().catch(err => { console.error(err); process.exit(1); });