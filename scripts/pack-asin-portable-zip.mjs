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

const README_TR = `AsinERP — Taşınabilir (USB) sürüm ${version}
========================================

Kurulum gerekmez. Flash belleğe kopyalayıp çalıştırın.

1) Bu klasörün tamamını USB flash belleğe kopyalayın
   (ör. E:\\AsinERP\\). Zip'i açtıktan sonra tek klasör olarak tutun.

2) AsinERP.exe dosyasını çift tıklayın (pencere başlığı: AsinERP).
   Windows WebView2 Runtime gerekir.

3) Girişte önce kiracı kodu istenir (api.retailex.app/{kod}).
   Yerel PostgreSQL kullanılmaz — bulut PostgREST.

4) Ayarlar EXE yanındaki data\\ klasöründe tutulur:
   - data\\config.db
   - data\\logs\\
   - data\\backups\\

Önemli: Flash harfi (D:, E:, …) değişse bile veri aynı klasörde kalır.
         portable.dat dosyasını silmeyin — taşınabilir mod işaretidir.

İsteğe bağlı: ASIN_PORTABLE=1 ortam değişkeni de portable modu açar.

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
