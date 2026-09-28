#!/usr/bin/env node
/**
 * RetailEX DeskApp portable — yönetici NSIS EXE (ZIP değil).
 * Kaynak: DeskApp/target/release (+ resources).
 * Çıktı: dist/RetailEX-Portable-{version}.exe
 *
 *   node scripts/pack-retailex-portable-zip.mjs
 *   node scripts/pack-retailex-portable-zip.mjs --out /path/to.exe
 *   node scripts/pack-retailex-portable-zip.mjs --zip   # isteğe bağlı zip de üret
 *
 * Windows'ta makensis gerekir (CI: choco install nsis).
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const deskApp = path.join(root, 'DeskApp');
const releaseDir = path.join(deskApp, 'target', 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '0.0.0');

function parseArgs() {
  const args = process.argv.slice(2);
  let out = path.join(root, 'dist', `RetailEX-Portable-${version}.exe`);
  let alsoZip = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      out = path.resolve(args[++i]);
    } else if (args[i] === '--zip') {
      alsoZip = true;
    }
  }
  return { out, alsoZip };
}

function mustExist(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`[portable-pack] Eksik ${label}: ${p}`);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      n += copyDirRecursive(s, d);
    } else if (ent.isFile()) {
      copyFile(s, d);
      n += 1;
    }
  }
  return n;
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[portable-pack] Atlandı (yok): ${src}`);
    return false;
  }
  if (fs.statSync(src).isDirectory()) {
    copyDirRecursive(src, dest);
  } else {
    copyFile(src, dest);
  }
  return true;
}

const README = `RetailEX Portable ${version}
========================

Kurulum (EXE — Yönetici)
1. RetailEX-Portable-${version}.exe dosyasını çalıştırın (UAC: Evet).
2. Varsayılan dizin: C:\\RetailEx\\App
3. Kurulum Windows hizmetlerini otomatik kurar:
   RetailEX_Service, RetailEX_SQL_Bridge, RetailEX_Printer, PostgREST
4. RetailEX_Config.exe ile C:\\RetailEx\\config.db ayarlayın.
5. RetailEX_Tools.exe setup-db (veya menü 9) — DB oluştur + migration
6. retailex.exe çalıştırın.

Hizmetler eksikse (Yönetici):
  C:\\RetailEx\\App\\install-services-manual.cmd
  veya: unblock-and-install-services.cmd

Akilli Uygulama Denetimi (SAC) engellerse:
  Windows Guvenlik > Uygulama ve tarayici denetimi > Akilli Uygulama Denetimi = Kapali
  Sonra unblock-and-install-services.cmd (Yonetici)

Güncelleme
- RetailEX_Tools.exe update (menü 7) — GitHub'dan yeni EXE indirir
- Yalnız şema: RetailEX_Tools.exe sync-migrate

Notlar
- config.db, PG verisi ve yedekler paket içinde DEĞİLDİR (C:\\RetailEx\\ altında kalır).
- WebView2 Runtime gerekir.
- Mark of the Web: sağ tık → Özellikler → Engellemeyi kaldır.

Sürüm: ${version}
Repo: https://github.com/ferhatdeveloper/RetailEX
`;

function stagePortable(stageRoot) {
  if (fs.existsSync(stageRoot)) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(stageRoot, { recursive: true });

  mustExist(releaseDir, 'release dir (önce tauri build --no-bundle)');

  const bins = [
    'retailex.exe',
    'RetailEX_Service.exe',
    'RetailEX_Config.exe',
    'RetailEX_SQL_Bridge.exe',
    'RetailEX_Printer.exe',
    'RetailEX_Tools.exe',
  ];
  for (const b of bins) {
    mustExist(path.join(releaseDir, b), b);
    copyFile(path.join(releaseDir, b), path.join(stageRoot, b));
  }

  copyIfExists(path.join(deskApp, 'wintun.dll'), path.join(stageRoot, 'wintun.dll'));

  fs.mkdirSync(path.join(stageRoot, 'RetailEXTools'), { recursive: true });
  copyFile(
    path.join(releaseDir, 'RetailEX_Tools.exe'),
    path.join(stageRoot, 'RetailEXTools', 'RetailEX_Tools.exe'),
  );

  const res = path.join(deskApp, 'resources');
  const flatResources = [
    'bridge.cjs',
    'kitchen-print-service.mjs',
    'package.json',
    'install-bridge.ps1',
    'install-bridge.cmd',
    'install-bridge-npm.ps1',
    'install-bridge-npm.cmd',
    'install-services-manual.ps1',
    'install-services-manual.cmd',
    'install-services-setup.ps1',
    'install-services-common.ps1',
    'retailex-admin.ps1',
    'retailex-admin.cmd',
    'README_PRINTER_SERVICE.md',
    'install-postgrest.ps1',
    'pg-windows-expose-remote.ps1',
    'pg-windows-expose-remote.cmd',
    'postgrest-windows-expose-lan.ps1',
    'postgrest-windows-expose-lan.cmd',
    'start-postgrest-lan.ps1',
    'start-postgrest-lan.cmd',
    'install-postgrest-service.ps1',
    'install-postgrest-service.cmd',
    'unblock-and-install-services.ps1',
    'unblock-and-install-services.cmd',
  ];
  for (const f of flatResources) {
    copyIfExists(path.join(res, f), path.join(stageRoot, f));
  }

  copyIfExists(path.join(res, 'postgrest', 'postgrest.exe'), path.join(stageRoot, 'postgrest.exe'));
  copyIfExists(path.join(res, 'sumatra'), path.join(stageRoot, '_up_', 'sumatra'));

  copyIfExists(path.join(res, 'nodejs-runtime', 'node.exe'), path.join(stageRoot, 'runtime', 'node', 'node.exe'));
  copyIfExists(path.join(res, 'node_modules'), path.join(stageRoot, 'node_modules'));

  copyIfExists(path.join(root, 'database', 'migrations'), path.join(stageRoot, '_up_', 'database', 'migrations'));
  copyIfExists(path.join(root, 'database', 'init'), path.join(stageRoot, '_up_', 'database', 'init'));
  copyIfExists(path.join(root, 'database', 'sys'), path.join(stageRoot, '_up_', 'database', 'sys'));
  copyIfExists(path.join(root, 'config', 'postgrest.conf'), path.join(stageRoot, '_up_', 'config', 'postgrest.conf'));
  copyIfExists(path.join(root, 'database', 'scripts'), path.join(stageRoot, '_up_', 'database', 'scripts'));

  const pgRemote = path.join(root, 'tools', 'postgresql-remote-enable', 'RetailEX_PostgreSQLRemote.exe');
  const pgRemoteAlt = path.join(deskApp, 'target', 'release', 'RetailEX_PostgreSQLRemote.exe');
  if (fs.existsSync(pgRemote)) {
    copyFile(pgRemote, path.join(stageRoot, 'RetailEX_PostgreSQLRemote.exe'));
  } else if (fs.existsSync(pgRemoteAlt)) {
    copyFile(pgRemoteAlt, path.join(stageRoot, 'RetailEX_PostgreSQLRemote.exe'));
  } else {
    console.warn('[portable-pack] RetailEX_PostgreSQLRemote.exe yok — atlandı.');
  }

  fs.writeFileSync(path.join(stageRoot, 'VERSION.txt'), `${version}\n`, 'utf8');
  fs.writeFileSync(path.join(stageRoot, 'README-Portable.txt'), README, 'utf8');
}

function zipStage(stageRoot, outZip) {
  fs.mkdirSync(path.dirname(outZip), { recursive: true });
  if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

  if (process.platform === 'win32') {
    const stageEsc = stageRoot.replace(/'/g, "''");
    const outEsc = outZip.replace(/'/g, "''");
    const ps = `Compress-Archive -Path '${stageEsc}\\*' -DestinationPath '${outEsc}' -Force`;
    execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      stdio: 'inherit',
    });
  } else {
    execSync(`cd "${stageRoot}" && zip -r -q "${outZip}" .`, { stdio: 'inherit', shell: true });
  }
}

function resolveMakensis() {
  const candidates = [
    process.env.MAKENSIS,
    'makensis',
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['/VERSION'], { encoding: 'utf8' });
      if (r.status === 0 || (r.stdout || r.stderr || '').length > 0) {
        return c;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

function nsisPath(p) {
  // NSIS File / OutFile: forward slash daha güvenli
  return path.resolve(p).replace(/\\/g, '/');
}

function buildExe(stageRoot, outExe) {
  if (process.platform !== 'win32') {
    throw new Error(
      '[portable-pack] EXE paketi yalnızca Windows + makensis ile üretilir (GitHub Actions windows-latest).',
    );
  }
  const makensis = resolveMakensis();
  if (!makensis) {
    throw new Error(
      '[portable-pack] makensis bulunamadı. CI: choco install nsis -y — veya MAKENSIS=... ayarlayın.',
    );
  }

  const template = path.join(deskApp, 'portable-installer.nsi');
  mustExist(template, 'portable-installer.nsi');
  const icon = path.join(deskApp, 'icons', 'icon.ico');
  mustExist(icon, 'icons/icon.ico');

  fs.mkdirSync(path.dirname(outExe), { recursive: true });
  if (fs.existsSync(outExe)) fs.unlinkSync(outExe);

  let nsi = fs.readFileSync(template, 'utf8');
  nsi = nsi
    .replaceAll('__VERSION__', version)
    .replaceAll('__OUTFILE__', nsisPath(outExe))
    .replaceAll('__STAGE_DIR__', nsisPath(stageRoot))
    .replaceAll('__ICON__', nsisPath(icon));

  const nsiOut = path.join(root, 'dist', `portable-installer-${version}.nsi`);
  fs.mkdirSync(path.dirname(nsiOut), { recursive: true });
  fs.writeFileSync(nsiOut, nsi, 'utf8');

  console.log(`[portable-pack] makensis: ${makensis}`);
  console.log(`[portable-pack] NSI: ${nsiOut}`);
  const r = spawnSync(makensis, ['/V2', nsiOut], { stdio: 'inherit', shell: false });
  if (r.status !== 0) {
    throw new Error(`[portable-pack] makensis başarısız (exit ${r.status})`);
  }
  mustExist(outExe, 'portable exe çıktısı');
}

function main() {
  const { out, alsoZip } = parseArgs();
  const stageRoot = path.join(root, 'dist', 'portable-stage');
  console.log(`[portable-pack] Sürüm ${version}`);
  console.log(`[portable-pack] Stage: ${stageRoot}`);
  stagePortable(stageRoot);

  const exeOut = out.toLowerCase().endsWith('.exe')
    ? out
    : path.join(path.dirname(out), `RetailEX-Portable-${version}.exe`);
  buildExe(stageRoot, exeOut);
  const size = fs.statSync(exeOut).size;
  console.log(`[portable-pack] OK EXE: ${exeOut} (${Math.round(size / 1024 / 1024)} MB)`);

  if (alsoZip) {
    const zipOut = path.join(path.dirname(exeOut), `RetailEX-Portable-${version}.zip`);
    zipStage(stageRoot, zipOut);
    console.log(`[portable-pack] OK ZIP (opsiyonel): ${zipOut}`);
  }

  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `PORTABLE_EXE=${path.basename(exeOut)}\n`);
    fs.appendFileSync(process.env.GITHUB_ENV, `PORTABLE_EXE_PATH=${exeOut}\n`);
  }
}

main();
