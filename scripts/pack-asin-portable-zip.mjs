#!/usr/bin/env node
/**
 * Tauri --no-bundle çıktısından AsinERP USB portable zip üretir.
 *
 * Beklenen: DeskApp/target/release/AsinERP.exe (+ kaynak klasörleri)
 * Çıktı: dist/AsinERP-Portable-{version}.zip
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { portableFolderName, portableZipFilename } from './portable-zip-filename.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
const releaseDir = path.join(root, 'DeskApp', 'target', 'release');
const distDir = path.join(root, 'dist');
const folderName = portableFolderName(version);
const zipName = portableZipFilename(version);
const stageRoot = path.join(distDir, folderName);

const MAIN_EXE_CANDIDATES = ['AsinERP.exe', 'asin.exe', 'retailex.exe'];

/** Tauri kaynak / yardımcı klasör ve dosya adları (yan yana kopyala) */
const COPY_NAMES = [
  'database',
  'resources',
  'config',
  'migrations',
  'init',
  'sys',
  'sumatra',
];

const README_TR = `AsinERP — Taşınabilir (USB/HDD) sürüm ${version}
========================================

Bu zip BAĞLANMAMIŞtır. Kopyala-yapıştır ile çalışmaz.
Medyaya yalnızca yazıcı araç ile basın (CD-ROM mantığı).

1) Hedef USB/HDD'yi bilgisayara takın (ör. E:).

2) Zip'i geçici bir klasöre açın, sonra yazıcıyı çalıştırın:
   tools\\Burn-To-Drive.cmd E:
   veya:
   powershell -ExecutionPolicy Bypass -File tools\\AsinERP-Portable-Writer.ps1 -List
   powershell -ExecutionPolicy Bypass -File tools\\AsinERP-Portable-Writer.ps1 -SourceDir . -TargetDrive E:

   Repo kökünden (geliştirici):
   npm run portable:writer -- --zip dist\\AsinERP-Portable-${version}.zip --target E:

3) Yazıcı, E:\\AsinERP altına kopyalar ve volume.bind dosyasını
   o diskin volume serial'ı ile yazar. Yalnızca o diskte açılır.

4) AsinERP.exe çalıştırın. WebView2 Runtime gerekir.
   Ayarlar: data\\config.db (exe yanında).

Önemli:
- volume.bind / portable.dat silmeyin.
- Başka diske kopyalanan klasör başlamaz (anlaşılır hata).
- Geliştirici: ASIN_PORTABLE_SKIP_BIND=1 ile bağlama atlanır.

Sürüm: ${version} (kök package.json)
`;

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    ensureDir(dest);
    for (const name of fs.readdirSync(src)) {
      if (name === '.' || name === '..') continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function findMainExe() {
  for (const name of MAIN_EXE_CANDIDATES) {
    const p = path.join(releaseDir, name);
    if (fs.existsSync(p)) return { path: p, name };
  }
  return null;
}

function main() {
  if (!fs.existsSync(releaseDir)) {
    console.error('[pack-portable] Release klasörü yok:', releaseDir);
    process.exit(1);
  }

  const exe = findMainExe();
  if (!exe) {
    console.error(
      '[pack-portable] Ana exe bulunamadı. Beklenen:',
      MAIN_EXE_CANDIDATES.join(', '),
      '→',
      releaseDir,
    );
    process.exit(1);
  }

  if (fs.existsSync(stageRoot)) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
  ensureDir(stageRoot);
  ensureDir(path.join(stageRoot, 'data'));
  ensureDir(path.join(stageRoot, 'data', 'logs'));
  ensureDir(path.join(stageRoot, 'data', 'backups'));

  fs.copyFileSync(exe.path, path.join(stageRoot, exe.name));
  fs.writeFileSync(path.join(stageRoot, 'portable.dat'), 'AsinERP portable=1\n', 'utf8');
  fs.writeFileSync(path.join(stageRoot, 'README-USB.txt'), README_TR, 'utf8');
  fs.writeFileSync(
    path.join(stageRoot, 'data', '.keep'),
    'Bu klasör flash üzerinde config/log/yedek tutar.\n',
    'utf8',
  );

  // Writer (CD-ROM mantığı) — CI zip'te volume.bind YOK; basım writer ile yapılır
  const toolsDir = path.join(stageRoot, 'tools');
  ensureDir(toolsDir);
  const writerPs1 = path.join(root, 'scripts', 'AsinERP-Portable-Writer.ps1');
  if (fs.existsSync(writerPs1)) {
    fs.copyFileSync(writerPs1, path.join(toolsDir, 'AsinERP-Portable-Writer.ps1'));
    console.log('[pack-portable] kopyalandı: tools/AsinERP-Portable-Writer.ps1');
  } else {
    console.warn('[pack-portable] UYARI: writer PS1 yok:', writerPs1);
  }
  const burnCmd = path.join(root, 'scripts', 'Burn-To-Drive.cmd');
  if (fs.existsSync(burnCmd)) {
    fs.copyFileSync(burnCmd, path.join(toolsDir, 'Burn-To-Drive.cmd'));
    console.log('[pack-portable] kopyalandı: tools/Burn-To-Drive.cmd');
  }
  fs.writeFileSync(
    path.join(stageRoot, 'UNBOUND.txt'),
    'Bu paket bağlanmamıştır. Çalıştırmadan önce tools\\AsinERP-Portable-Writer.ps1 ile hedef diske basın.\n',
    'utf8',
  );

  // Tauri kaynakları release kökünde veya alt klasörlerde olabilir
  for (const name of COPY_NAMES) {
    const src = path.join(releaseDir, name);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(stageRoot, name));
      console.log('[pack-portable] kopyalandı:', name);
    }
  }

  // Bazı Tauri sürümleri kaynakları _up_ / resources altında tutar
  for (const extra of ['_up_', 'WebView2Loader.dll']) {
    const src = path.join(releaseDir, extra);
    if (fs.existsSync(src)) {
      const dest = path.join(stageRoot, extra);
      copyRecursive(src, dest);
      console.log('[pack-portable] kopyalandı:', extra);
    }
  }

  ensureDir(distDir);
  const zipPath = path.join(distDir, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  if (process.platform === 'win32') {
    // Compress-Archive: klasör içeriğini zip kökünde tutmak için stage içeriğini zip'le
    const ps = `
$ErrorActionPreference = 'Stop'
$src = '${stageRoot.replace(/'/g, "''")}'
$dest = '${zipPath.replace(/'/g, "''")}'
if (Test-Path $dest) { Remove-Item -Force $dest }
Compress-Archive -Path (Join-Path $src '*') -DestinationPath $dest -CompressionLevel Optimal
`;
    execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { stdio: 'inherit' },
    );
  } else {
    execFileSync('zip', ['-r', '-q', zipPath, folderName], {
      cwd: distDir,
      stdio: 'inherit',
    });
  }

  const size = fs.statSync(zipPath).size;
  console.log(`[pack-portable] Hazır: ${zipPath} (${Math.round(size / 1024 / 1024)} MB)`);
  console.log(`[pack-portable] Ana exe: ${exe.name}`);
}

main();
