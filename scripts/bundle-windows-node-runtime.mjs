/**
 * Windows NSIS paketi icin resmi Node.js x64 zip'ten YALNIZCA node.exe +
 * saf JS bridge paketleri (pg / hono). Tam zip acmak (npm agaci) ve
 * better-sqlite3 native derlemek GHA'da tauri:build'i dusuruyor.
 *
 * NODE_RUNTIME_VERSION (varsayilan 20.19.4)
 * NODE_RUNTIME_SKIP=1 atla
 * NODE_RUNTIME_FORCE=1 yeniden indir / npm install
 * NODE_RUNTIME_STRICT=1 hata olursa cikis kodu 1 (varsayilan: derleme devam)
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = String(process.env.NODE_RUNTIME_VERSION || '20.19.4').trim();
const resources = join(root, 'DeskApp', 'resources');
const outDir = join(resources, 'nodejs-runtime');
const nodeExe = join(outDir, 'node.exe');
const pgMod = join(resources, 'node_modules', 'pg');
const zipEntry = `node-v${version}-win-x64/node.exe`;

function ensureBridgeModulesDir() {
  const nm = join(resources, 'node_modules');
  mkdirSync(nm, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const keep = join(nm, 'placeholder.txt');
  if (!existsSync(keep) && !existsSync(pgMod)) {
    writeFileSync(keep, 'bridge modules\n');
  }
}

function npmInstall(args) {
  execFileSync('npm', args, {
    cwd: resources,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
}

async function download(src, dest) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} -> ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

/** Zip'ten sadece node.exe; tam Expand-Archive npm agaci / MAX_PATH kiriyor. */
function extractNodeExeFromZip(zip, destExe) {
  mkdirSync(dirname(destExe), { recursive: true });
  if (existsSync(destExe)) rmSync(destExe, { force: true });
  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$zipPath = ${JSON.stringify(zip)}`,
      `$outPath = ${JSON.stringify(destExe)}`,
      `$entryName = ${JSON.stringify(zipEntry)}`,
      '$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)',
      'try {',
      '  $entry = $zip.GetEntry($entryName)',
      '  if (-not $entry) { throw "node.exe zip icinde yok: $entryName" }',
      '  $dir = Split-Path $outPath',
      '  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }',
      '  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outPath, $true)',
      '} finally { $zip.Dispose() }',
    ].join('\n');
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'inherit' });
    return;
  }
  execFileSync('unzip', ['-j', '-o', zip, zipEntry, '-d', dirname(destExe)], { stdio: 'inherit' });
}

function installBridgeModules() {
  console.log('[node-runtime] npm install --omit=dev --omit=optional --ignore-scripts (pg/hono)...');
  npmInstall([
    'install',
    '--omit=dev',
    '--omit=optional',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  if (existsSync(pgMod)) return;
  console.warn('[node-runtime] package.json install pg uretmedi, dogrudan paketler deneniyor');
  npmInstall([
    'install',
    'pg@^8.18.0',
    'hono@^4.12.5',
    '@hono/node-server@^1.19.11',
    '--omit=dev',
    '--omit=optional',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--no-save',
  ]);
}

if (process.env.NODE_RUNTIME_SKIP === '1') {
  console.log('[node-runtime] NODE_RUNTIME_SKIP=1 — atlanıyor.');
  ensureBridgeModulesDir();
  process.exit(0);
}

if (
  existsSync(nodeExe) &&
  existsSync(pgMod) &&
  process.env.NODE_RUNTIME_FORCE !== '1'
) {
  console.log('[node-runtime] Zaten mevcut, atlanıyor:', outDir);
  process.exit(0);
}

let failed = false;
try {
  if (!existsSync(nodeExe) || process.env.NODE_RUNTIME_FORCE === '1') {
    const zipName = `node-v${version}-win-x64.zip`;
    const url = `https://nodejs.org/dist/v${version}/${zipName}`;
    const zipPath = join(tmpdir(), `retailex-${zipName}`);
    console.log('[node-runtime] Indiriliyor:', url);
    await download(url, zipPath);
    extractNodeExeFromZip(zipPath, nodeExe);
    if (!existsSync(nodeExe)) {
      throw new Error(`node.exe cikarilamadi: ${nodeExe}`);
    }
    console.log('[node-runtime] node.exe hazir:', nodeExe);
  }

  if (process.platform !== 'win32') {
    console.warn(
      '[node-runtime] bridge npm install yalnizca Windows derlemesinde calisir. CI: windows-latest.',
    );
  } else {
    installBridgeModules();
    if (!existsSync(pgMod)) {
      throw new Error('npm install sonrasi node_modules/pg yok');
    }
    console.log('[node-runtime] bridge node_modules (pg/hono) hazir.');
  }
} catch (err) {
  failed = true;
  console.warn('[node-runtime] hata (masaüstü derlemesi durdurulmaz):', err?.message || err);
}

ensureBridgeModulesDir();
if (failed && process.env.NODE_RUNTIME_STRICT === '1') {
  process.exit(1);
}
if (failed) {
  console.warn('[node-runtime] gomulu Node/bridge eksik olabilir; NSIS /nonfatal ile devam.');
}
process.exit(0);
