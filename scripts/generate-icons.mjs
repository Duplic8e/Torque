// Renders public/icons/*.png from inline SVG using the preinstalled Playwright.
// Run: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)('playwright');

// `pad` is extra safe-zone padding so the maskable icon survives circular crops.
const svg = (pad) => {
  // A small version of the dashboard cluster: chrome dial with ticks, Soul Red needle near the top of the scale.
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = ((-120 + i * 24) * Math.PI) / 180;
    const p = (r) => [256 + r * Math.sin(a), 280 - r * Math.cos(a)].map((v) => v.toFixed(1));
    const [x1, y1] = p(150);
    const [x2, y2] = p(i % 5 === 0 ? 118 : 132);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c5ced6" stroke-opacity="${i % 5 === 0 ? 0.9 : 0.5}" stroke-width="${i % 5 === 0 ? 12 : 8}" stroke-linecap="round"/>`;
  }).join('');
  const n = (60 * Math.PI) / 180;
  const np = (r) => [256 + r * Math.sin(n), 280 - r * Math.cos(n)].map((v) => v.toFixed(1));
  const [nx1, ny1] = np(96);
  const [nx2, ny2] = np(186);
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="20%" r="85%"><stop offset="0" stop-color="#1a2530"/><stop offset="0.7" stop-color="#0e1317"/></radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <path d="M${(256 + 170 * Math.sin((-120 * Math.PI) / 180)).toFixed(1)},${(280 - 170 * Math.cos((-120 * Math.PI) / 180)).toFixed(1)} A170,170 0 1 1 ${(256 + 170 * Math.sin((120 * Math.PI) / 180)).toFixed(1)},${(280 - 170 * Math.cos((120 * Math.PI) / 180)).toFixed(1)}" fill="none" stroke="#26313a" stroke-width="22" stroke-linecap="round"/>
    ${ticks}
    <line x1="${nx1}" y1="${ny1}" x2="${nx2}" y2="${ny2}" stroke="#d21f3c" stroke-width="26" stroke-linecap="round" filter="url(#glow)" opacity="0.9"/>
    <line x1="${nx1}" y1="${ny1}" x2="${nx2}" y2="${ny2}" stroke="#d21f3c" stroke-width="18" stroke-linecap="round"/>
  </g>
</svg>`;
};

const jobs = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  ['icon-maskable-512.png', 512, 0.2],
];

await mkdir('public/icons', { recursive: true });
const browser = await chromium.launch();
for (const [file, size, pad] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
  await page.screenshot({ path: `public/icons/${file}` });
  await page.close();
}
await browser.close();
