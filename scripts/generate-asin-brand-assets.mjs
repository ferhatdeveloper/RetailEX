#!/usr/bin/env node
/**
 * Asin brand assets — SVG + Pillow raster.
 * Kullanım: node scripts/generate-asin-brand-assets.mjs
 * (veya npm run brand:icons)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const INK = '#0E2433';
const ACCENT = '#1FA8A0';
const SURFACE = '#F3F5F7';

function markSvg({ size = 512, label = 'Asin' } = {}) {
  const rx = Math.round(size * 0.21875);
  const s = size / 512;
  const g = (n) => (n * s).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="asinG${size}" x1="8%" y1="0%" x2="92%" y2="100%">
      <stop offset="0%" stop-color="${SURFACE}"/>
      <stop offset="100%" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="${INK}"/>
  <rect x="${g(28)}" y="${g(28)}" width="${g(456)}" height="${g(456)}" rx="${Math.round(rx * 0.86)}" fill="none" stroke="${ACCENT}" stroke-opacity="0.22" stroke-width="${Math.max(2, g(4))}"/>
  <path d="M${g(256)} ${g(72)} L${g(420)} ${g(168)} L${g(420)} ${g(344)} L${g(256)} ${g(440)} L${g(92)} ${g(344)} L${g(92)} ${g(168)} Z" fill="none" stroke="${ACCENT}" stroke-width="${Math.max(3, g(14))}" stroke-linejoin="round" opacity="0.9"/>
  <path d="M${g(256)} ${g(140)} L${g(360)} ${g(372)} H${g(318)} L${g(292)} ${g(312)} H${g(220)} L${g(194)} ${g(372)} H${g(152)} L${g(256)} ${g(140)} Z M${g(232)} ${g(268)} H${g(280)} L${g(256)} ${g(212)} Z" fill="url(#asinG${size})"/>
  <rect x="${g(372)}" y="${g(196)}" width="${g(28)}" height="${g(120)}" rx="${g(10)}" fill="${ACCENT}"/>
</svg>
`;
}

function faviconSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512" role="img" aria-label="Asin">
  <defs>
    <linearGradient id="asin-mark" x1="8%" y1="0%" x2="92%" y2="100%">
      <stop offset="0%" stop-color="${SURFACE}"/>
      <stop offset="100%" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>
  <path d="M256 36 L456 152 L456 360 L256 476 L56 360 L56 152 Z" fill="${INK}"/>
  <path d="M256 72 L420 168 L420 344 L256 440 L92 344 L92 168 Z" fill="none" stroke="${ACCENT}" stroke-width="14" stroke-linejoin="round" opacity="0.85"/>
  <path d="M256 140 L360 372 H318 L292 312 H220 L194 372 H152 L256 140 Z M232 268 H280 L256 212 Z" fill="url(#asin-mark)"/>
  <rect x="372" y="196" width="28" height="120" rx="10" fill="${ACCENT}"/>
</svg>
`;
}

function safariPinnedSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" role="img" aria-label="Asin">
  <path fill="#000" d="M256 36 L456 152 L456 360 L256 476 L56 360 L56 152 Z"/>
  <path fill="#000" fill-rule="evenodd" d="M256 140 L360 372 H318 L292 312 H220 L194 372 H152 L256 140 Z M232 268 H280 L256 212 Z"/>
  <rect x="372" y="196" width="28" height="120" rx="10" fill="#000"/>
</svg>
`;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  console.log('write', path.relative(root, file));
}

function main() {
  const publicDir = path.join(root, 'src/public');
  const iconsDir = path.join(publicDir, 'icons');

  write(path.join(__dirname, 'asin-brand-mark.svg'), markSvg({ size: 512 }));
  write(path.join(publicDir, 'favicon.svg'), faviconSvg());
  write(path.join(publicDir, 'logo.svg'), markSvg({ size: 512 }));
  write(path.join(root, 'DeskApp/logo.svg'), markSvg({ size: 512 }));
  write(path.join(iconsDir, 'icon.svg'), markSvg({ size: 512 }));
  write(path.join(iconsDir, 'safari-pinned-tab.svg'), safariPinnedSvg());

  for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
    write(path.join(iconsDir, `icon-${size}x${size}.svg`), markSvg({ size }));
  }

  write(path.join(root, 'src/components/wms/favicon.svg'), faviconSvg());
  write(path.join(root, 'public/favicon.svg'), faviconSvg());

  if (fs.existsSync(path.join(__dirname, 'asin-logo-wordmark.svg'))) {
    write(path.join(publicDir, 'logo-wordmark.svg'), fs.readFileSync(path.join(__dirname, 'asin-logo-wordmark.svg'), 'utf8'));
  }

  console.log('\nRaster (Pillow)…');
  execFileSync('python3', [path.join(__dirname, 'generate-asin-brand-rasters.py')], {
    stdio: 'inherit',
    cwd: root,
  });

  console.log('\nAsin brand assets güncellendi.');
}

main();
