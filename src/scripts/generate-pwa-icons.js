/**
 * Asin PWA Icon Generator
 *
 * Tercih: `node scripts/generate-asin-brand-assets.mjs` (kanonik marka + PNG/ICO).
 * Bu dosya geriye dönük uyumluluk için ASIN mark SVG şablonunu yazar.
 *
 * Kullanım: node src/scripts/generate-pwa-icons.js
 */

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const INK = '#0E2433';
const ACCENT = '#1FA8A0';
const SURFACE = '#F3F5F7';

console.log('Asin PWA Icon Generator');
console.log('================================\n');

function generateSVG(size) {
  const rx = Math.floor(size * 0.21875);
  const s = size / 512;
  const g = (n) => (n * s).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Asin">
  <defs>
    <linearGradient id="asinG${size}" x1="8%" y1="0%" x2="92%" y2="100%">
      <stop offset="0%" stop-color="${SURFACE}"/>
      <stop offset="100%" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="${INK}"/>
  <path d="M${g(256)} ${g(72)} L${g(420)} ${g(168)} L${g(420)} ${g(344)} L${g(256)} ${g(440)} L${g(92)} ${g(344)} L${g(92)} ${g(168)} Z" fill="none" stroke="${ACCENT}" stroke-width="${Math.max(3, g(14))}" stroke-linejoin="round" opacity="0.9"/>
  <path d="M${g(256)} ${g(140)} L${g(360)} ${g(372)} H${g(318)} L${g(292)} ${g(312)} H${g(220)} L${g(194)} ${g(372)} H${g(152)} L${g(256)} ${g(140)} Z M${g(232)} ${g(268)} H${g(280)} L${g(256)} ${g(212)} Z" fill="url(#asinG${size})"/>
  <rect x="${g(372)}" y="${g(196)}" width="${g(28)}" height="${g(120)}" rx="${g(10)}" fill="${ACCENT}"/>
</svg>`;
}

const iconDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

sizes.forEach((size) => {
  const filepath = path.join(iconDir, `icon-${size}x${size}.svg`);
  fs.writeFileSync(filepath, generateSVG(size));
  console.log(`✅ ${path.basename(filepath)}`);
});

fs.writeFileSync(path.join(iconDir, 'icon.svg'), generateSVG(512));
fs.writeFileSync(path.join(__dirname, '../public/favicon.svg'), generateSVG(32));

const safari = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" role="img" aria-label="Asin">
  <path fill="#000" d="M256 36 L456 152 L456 360 L256 476 L56 360 L56 152 Z"/>
  <path fill="#000" d="M256 140 L360 372 H318 L292 312 H220 L194 372 H152 L256 140 Z M232 268 H280 L256 212 Z"/>
  <rect x="372" y="196" width="28" height="120" rx="10" fill="#000"/>
</svg>`;
fs.writeFileSync(path.join(iconDir, 'safari-pinned-tab.svg'), safari);

console.log('\n✨ Tamam. Tam raster set için: node scripts/generate-asin-brand-assets.mjs\n');
