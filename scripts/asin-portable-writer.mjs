#!/usr/bin/env node
/**
 * AsinERP portable writer (Node sarmalayıcı) — PowerShell aracını çağırır.
 *
 *   npm run portable:writer -- --list
 *   npm run portable:writer -- --zip dist/AsinERP-Portable-0.1.233.zip --target E:
 *   npm run portable:writer -- --dir dist/AsinERP-Portable-0.1.233 --target E:\AsinERP
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const ps1 = path.join(__dirname, 'AsinERP-Portable-Writer.ps1');

/** Rust / PowerShell ile aynı imza (doğrulama / birim test). */
export function portableBindSig(serial) {
  const norm = normalizeVolumeSerial(serial);
  return createHash('sha256')
    .update(`AsinERP-Portable-Bind-v1|${norm}`, 'utf8')
    .digest('hex');
}

export function normalizeVolumeSerial(raw) {
  let s = String(raw || '').trim().replace(/^0x/i, '');
  const n = Number.parseInt(s, 16);
  if (Number.isFinite(n) && n >= 0) {
    return (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }
  return s.toUpperCase();
}

export function formatVolumeBind(serial, writtenIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')) {
  const serialU = normalizeVolumeSerial(serial);
  const sig = portableBindSig(serialU);
  return (
    '# AsinERP portable volume binding — writer ile basılır; elle kopyalamayın\n' +
    'v=1\n' +
    `serial=${serialU}\n` +
    `written=${writtenIso}\n` +
    `sig=${sig}\n`
  );
}

function parseArgs(argv) {
  const out = { list: false, zip: null, dir: null, target: null, destName: 'AsinERP' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list' || a === '-l') out.list = true;
    else if (a === '--zip' || a === '-z') out.zip = argv[++i];
    else if (a === '--dir' || a === '-d') out.dir = argv[++i];
    else if (a === '--target' || a === '-t') out.target = argv[++i];
    else if (a === '--name') out.destName = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`AsinERP Portable Writer

  node scripts/asin-portable-writer.mjs --list
  node scripts/asin-portable-writer.mjs --zip <AsinERP-Portable-*.zip> --target E:
  node scripts/asin-portable-writer.mjs --dir <klasör> --target E:\\AsinERP

CI zip bağlanmamıştır; volume.bind yalnızca bu writer ile yazılır.
Geliştirme: ASIN_PORTABLE_SKIP_BIND=1`);
    process.exit(0);
  }

  if (!fs.existsSync(ps1)) {
    console.error('[portable-writer] PS1 yok:', ps1);
    process.exit(1);
  }

  if (process.platform !== 'win32') {
    console.error('[portable-writer] Yalnızca Windows.');
    process.exit(1);
  }

  const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1];
  if (args.list) {
    psArgs.push('-List');
  } else {
    if (!args.target) {
      console.error('--target gerekli (örn. E:)');
      process.exit(1);
    }
    if (!args.zip && !args.dir) {
      console.error('--zip veya --dir gerekli');
      process.exit(1);
    }
    psArgs.push('-TargetDrive', args.target);
    psArgs.push('-DestFolderName', args.destName);
    if (args.zip) {
      const zip = path.isAbsolute(args.zip) ? args.zip : path.join(root, args.zip);
      psArgs.push('-SourceZip', zip);
    }
    if (args.dir) {
      const dir = path.isAbsolute(args.dir) ? args.dir : path.join(root, args.dir);
      psArgs.push('-SourceDir', dir);
    }
  }

  execFileSync('powershell', psArgs, { stdio: 'inherit', cwd: root });
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main();
}
