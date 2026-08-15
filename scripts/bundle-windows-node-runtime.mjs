/**
 * Windows NSIS paketi icin resmi Node.js x64 zip'ten yalnizca node.exe +
 * bridge node_modules (pg/hono). Tam Node dagitimi (npm agaci) NSIS'i
 * binlerce dosya / MAX_PATH ile kiriyor.
 *
 * NODE_RUNTIME_VERSION (varsayilan 20.19.4)
 * NODE_RUNTIME_SKIP=1 atla
 * NODE_RUNTIME_FORCE=1 yeniden indir / npm install
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
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

function ensureBridgeModulesDir() {
  const nm = join(resources, 'node_modules');
  mkdirSync(nm, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const keep = join(nm, 'placeholder.txt');
  if (!existsSync(keep) && !existsSync(pgMod)) {
    writeFileSync(keep, 'bridge modules\n');
  }
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

const zipName = `node-v${version}-win-x64.zip`;
const url = `https://nodejs.org/dist/v${version}/${zipName}`;
const zipPath = join(tmpdir(), `retailex-${zipName}`);
const extract = join(tmpdir(), `retailex-node-extract-${Date.now()}`);

async function download(src, dest) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} -> ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

function extractZip(zip, dest) {
  mkdirSync(dest, { recursive: true });
  if (process.platform === 'win32') {
    const z = zip.replace(/'/g, "''");
    const d = dest.replace(/'/g, "''");
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${z}' -DestinationPath '${d}' -Force`],
      { stdio: 'inherit' },
    );
    return;
  }
  execFileSync('unzip', ['-q', '-o', zip, '-d', dest], { stdio: 'inherit' });
}

function npmInstall(args) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCmd, args, {
    cwd: resources,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
}

if (!existsSync(nodeExe) || process.env.NODE_RUNTIME_FORCE === '1') {
  console.log('[node-runtime] Indiriliyor:', url);
  await download(url, zipPath);
  extractZip(zipPath, extract);
  const inner = join(extract, `node-v${version}-win-x64`);
  const srcExe = join(inner, 'node.exe');
  if (!existsSync(srcExe)) {
    throw new Error(`node.exe arsivde yok: ${inner}`);
  }
  mkdirSync(outDir, { recursive: true });
  copyFileSync(srcExe, nodeExe);
  rmSync(extract, { recursive: true, force: true });
  console.log('[node-runtime] node.exe kopyalandi:', nodeExe);
}

if (process.platform !== 'win32') {
  console.warn(
    '[node-runtime] bridge npm install yalnizca Windows derlemesinde calisir. CI: windows-latest.',
  );
  process.exit(0);
}

console.log('[node-runtime] npm install --omit=dev (DeskApp/resources, runner npm)...');
try {
  npmInstall(['install', '--omit=dev', '--no-audit', '--no-fund']);
} catch (err) {
  console.warn('[node-runtime] tam install basarisiz, native olmadan pg/hono deneniyor:', err?.message || err);
  npmInstall([
    'install',
    'pg@^8.18.0',
    'hono@^4.12.5',
    '@hono/node-server@^1.19.11',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
  ]);
}
if (!existsSync(pgMod)) {
  throw new Error('npm install sonrasi node_modules/pg yok');
}
if (!existsSync(nodeExe)) {
  throw new Error(`node.exe yok: ${nodeExe}`);
}
ensureBridgeModulesDir();
console.log('[node-runtime] bridge node_modules + node.exe hazir.');
