// Renders public/icons/*.png from inline SVG using the preinstalled Playwright.
// Run: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)('playwright');

// `pad` is extra safe-zone padding so the maskable icon survives circular crops.
const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0e0f12"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <circle cx="256" cy="256" r="170" fill="none" stroke="#2a2d35" stroke-width="28"/>
    <path d="M256 86 A170 170 0 1 1 112 346" fill="none" stroke="#b3162b" stroke-width="28" stroke-linecap="round"/>
    <path d="M256 256 L330 170" stroke="#f2f3f5" stroke-width="22" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="22" fill="#f2f3f5"/>
  </g>
</svg>`;

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
