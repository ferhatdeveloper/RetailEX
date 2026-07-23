/**
 * RetailOS PWA Icon Generator
 * SVG ikonları PNG'ye dönüştürmek için kullanılabilir
 * 
 * Kullanım:
 * 1. npm install sharp (veya canvas kütüphanesi)
 * 2. node scripts/generate-pwa-icons.js
 * 
 * Not: Şu an SVG kullanıyoruz, PNG'ye ihtiyaç olursa bu script kullanılabilir
 */

const fs = require('fs');
const path = require('path');

// İkon boyutları
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Renk paleti
const colors = {
  gradient: {
    start: '#2563eb',
    end: '#1e40af'
  },
  text: '#ffffff'
};

console.log('ğŸ¨ RetailOS PWA Icon Generator');
console.log('================================\n');

// SVG template
function generateSVG(size) {
  const borderRadius = Math.floor(size * 0.22); // %22 yuvarlaklık
  const fontSize = Math.floor(size * 0.66); // %66 font boyutu
  const textY = Math.floor(size * 0.74); // %74 Y pozisyonu

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.gradient.start};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.gradient.end};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${borderRadius}" fill="url(#bg${size})"/>
  <text x="${size / 2}" y="${textY}" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${colors.text}" text-anchor="middle">R</text>
</svg>`;
}

// İkon dizini oluştur
const iconDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
  console.log('✅ Icons dizini oluşturuldu');
}

// SVG dosyalarını oluştur
console.log('\n📝 SVG ikonları oluşturuluyor...\n');

sizes.forEach(size => {
  const svg = generateSVG(size);
  const filename = `icon-${size}x${size}.svg`;
  const filepath = path.join(iconDir, filename);

  fs.writeFileSync(filepath, svg);
  console.log(`✅ ${filename} oluşturuldu`);
});

// Ana ikon (any size)
const mainIcon = generateSVG(512);
fs.writeFileSync(path.join(iconDir, 'icon.svg'), mainIcon);
console.log('✅ icon.svg oluşturuldu');

// Favicon
const favicon = generateSVG(32);
fs.writeFileSync(path.join(__dirname, '../public/favicon.svg'), favicon);
console.log('✅ favicon.svg oluşturuldu');

// Safari pinned tab (monochrome)
const safariIcon = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 0h16v16H0z" fill="${colors.gradient.start}"/>
  <text x="8" y="12" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="bold" fill="${colors.text}" text-anchor="middle">R</text>
</svg>`;
fs.writeFileSync(path.join(iconDir, 'safari-pinned-tab.svg'), safariIcon);
console.log('✅ safari-pinned-tab.svg oluşturuldu');

console.log('\n================================');
console.log('✨ Tüm SVG ikonları başarıyla oluşturuldu!');
console.log('\n📌 Not: PNG\'ye dönüştürmek için sharp kullanabilirsiniz:');
console.log('   npm install sharp');
console.log('   // sharp ile SVG -> PNG dönüşümü yapabilirsiniz\n');

// PNG dönüşümü için örnek kod (sharp gerekli)
console.log('ğŸ’¡ PNG dönüşümü için örnek kod:');
console.log(`
const sharp = require('sharp');

async function convertToPNG(size) {
  await sharp(path.join(iconDir, \`icon-\${size}x\${size}.svg\`))
    .png()
    .toFile(path.join(iconDir, \`icon-\${size}x\${size}.png\`));
  console.log(\`✅ icon-\${size}x\${size}.png oluşturuldu\`);
}

// Tüm boyutları dönüştür
Promise.all(sizes.map(size => convertToPNG(size)))
  .then(() => console.log('✨ PNG dönüşümü tamamlandı!'));
`);

// Manifest.json güncelleme önerisi
console.log('\n📑 manifest.json güncelleme önerisi:');
console.log(`
{
  "icons": [
    ${sizes.map(size => `{
      "src": "/icons/icon-${size}x${size}.svg",
      "sizes": "${size}x${size}",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }`).join(',\n    ')},
    {
      "src": "/icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
`);

console.log('\nğŸ‰ İşlem tamamlandı!\n');

