#!/usr/bin/env node
/**
 * RetailEX DeskApp portable zip — NSIS yok.
 * Kaynak: DeskApp/target/release (+ resources).
 * Çıktı: dist/RetailEX-Portable-{version}.zip
 *
 *   node scripts/pack-retailex-portable-zip.mjs
 *   node scripts/pack-retailex-portable-zip.mjs --out /path/to.zip
 */
import { execSync } from 'node:child_process';
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
  let out = path.join(root, 'dist', `RetailEX-Portable-${version}.zip`);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      out = path.resolve(args[++i]);
    }
  }
  return { out };
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

Kurulum (hızlı)
1. Bu zip'i örn. C:\\RetailEx\\App\\ altına açın.
2. PostgreSQL sunucusu elle kurulu olmalı (bu paket PG kurmaz).
3. RetailEX_Config.exe ile C:\\RetailEx\\config.db ayarlarını doldurun.
4. RetailEX_Tools.exe setup-db  (veya menü 9: DB oluştur + migration)
   — SQL güncellemek için: RetailEX_Tools.exe sync-migrate (menü C)
5. retailex.exe çalıştırın.

Güncelleme
- Uygulama: RetailEX_Tools.exe update (menü 7)
- Yalnız şema: RetailEX_Tools.exe sync-migrate (GitHub SQL + migrate)
- Ortam: RETAILEX_SQL_REF=main (varsayılan)

Araçlar
- RetailEX_Tools.exe (kök) ve RetailEXTools\\RetailEX_Tools.exe
- setup-db | fetch-sql | sync-migrate | migrate | update | config

Notlar
- config.db, PG verisi ve yedekler zip içinde DEĞİLDİR (C:\\RetailEx\\ altında kalır).
- WebView2 Runtime gerekir (Windows 10/11 genelde yüklü).
- Windows "Mark of the Web" uyarısı: dosyaya sağ tık → Özellikler → Engellemeyi kaldır.
- NSIS kurulum (setup.exe) bu pakette yoktur.

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

  // Tools: RetailEXTools\\RetailEX_Tools.exe (NSIS ile aynı düzen)
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
  ];
  for (const f of flatResources) {
    copyIfExists(path.join(res, f), path.join(stageRoot, f));
  }

  copyIfExists(path.join(res, 'postgrest', 'postgrest.exe'), path.join(stageRoot, 'postgrest.exe'));
  copyIfExists(path.join(res, 'sumatra'), path.join(stageRoot, '_up_', 'sumatra'));

  // Node runtime + bridge node_modules
  copyIfExists(path.join(res, 'nodejs-runtime', 'node.exe'), path.join(stageRoot, 'runtime', 'node', 'node.exe'));
  copyIfExists(path.join(res, 'node_modules'), path.join(stageRoot, 'node_modules'));

  // Migrations for startup / Tools
  copyIfExists(path.join(root, 'database', 'migrations'), path.join(stageRoot, '_up_', 'database', 'migrations'));
  copyIfExists(path.join(root, 'database', 'init'), path.join(stageRoot, '_up_', 'database', 'init'));
  copyIfExists(path.join(root, 'database', 'sys'), path.join(stageRoot, '_up_', 'database', 'sys'));
  copyIfExists(path.join(root, 'config', 'postgrest.conf'), path.join(stageRoot, '_up_', 'config', 'postgrest.conf'));

  // Migration runner (Tools → node)
  copyIfExists(
    path.join(root, 'database', 'scripts'),
    path.join(stageRoot, '_up_', 'database', 'scripts'),
  );

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
    // macOS/Linux CI veya yerel: zip CLI
    execSync(`cd "${stageRoot}" && zip -r -q "${outZip}" .`, { stdio: 'inherit', shell: true });
  }
}

function main() {
  const { out } = parseArgs();
  const stageRoot = path.join(root, 'dist', 'portable-stage');
  console.log(`[portable-pack] Sürüm ${version}`);
  console.log(`[portable-pack] Stage: ${stageRoot}`);
  stagePortable(stageRoot);
  zipStage(stageRoot, out);
  const size = fs.statSync(out).size;
  console.log(`[portable-pack] OK: ${out} (${Math.round(size / 1024 / 1024)} MB)`);
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `PORTABLE_ZIP=${path.basename(out)}\n`);
    fs.appendFileSync(process.env.GITHUB_ENV, `PORTABLE_ZIP_PATH=${out}\n`);
  }
}

main();
