/**
 * Windows NSIS paketi icin resmi Node.js x64 zip + bridge node_modules.
 * better-sqlite3 native oldugu icin npm install yalnizca Windows'ta calisir (CI).
 *
 * NODE_RUNTIME_VERSION (varsayilan 20.19.4)
 * NODE_RUNTIME_SKIP=1 atla
 * NODE_RUNTIME_FORCE=1 yeniden indir / npm install
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
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

if (process.env.NODE_RUNTIME_SKIP === '1') {
  console.log('[node-runtime] NODE_RUNTIME_SKIP=1 — atlanıyor.');
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

console.log('[node-runtime] Indiriliyor:', url);
await download(url, zipPath);
extractZip(zipPath, extract);
const inner = join(extract, `node-v${version}-win-x64`);
if (!existsSync(join(inner, 'node.exe'))) {
  throw new Error(`node.exe arsivde yok: ${inner}`);
}
rmSync(outDir, { recursive: true, force: true });
mkdirSync(dirname(outDir), { recursive: true });
cpSync(inner, outDir, { recursive: true });
console.log('[node-runtime] Tamam:', outDir);

if (process.platform !== 'win32') {
  console.warn(
    '[node-runtime] npm install (better-sqlite3) yalnizca Windows derlemesinde calisir. CI: windows-latest.',
  );
  process.exit(0);
}

const npmCli = join(outDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
if (!existsSync(npmCli)) {
  throw new Error(`npm-cli.js yok: ${npmCli}`);
}
console.log('[node-runtime] npm install --omit=dev (DeskApp/resources)...');
execFileSync(nodeExe, [npmCli, 'install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: resources,
  stdio: 'inherit',
  env: { ...process.env, npm_config_update_notifier: 'false' },
});
if (!existsSync(pgMod)) {
  throw new Error('npm install sonrasi node_modules/pg yok');
}
console.log('[node-runtime] bridge node_modules hazir.');
