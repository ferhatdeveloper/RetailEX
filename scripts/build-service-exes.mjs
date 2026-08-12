/**
 * RetailEX-Sync-Service (+ isteğe bağlı Logo Connector) Windows exe derlemesi.
 *
 * Windows (önerilen):
 *   npm run build:services:win
 *
 * Logo Connector (legacy — yeni kurulumlarda gerekmez):
 *   BUILD_LOGO_CONNECTOR=1 npm run build:services:win
 *
 * Linux/macOS cross-compile (mingw gerekir):
 *   npm run build:services:win -- --target x86_64-pc-windows-gnu
 *
 * Çıktı: services/windows-x64/*.exe
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "services", "windows-x64");

const buildLogoConnector =
  process.env.BUILD_LOGO_CONNECTOR === "1" ||
  process.argv.includes("--logo-connector");

const isWin = process.platform === "win32";
const args = process.argv.slice(2);
const targetFlag = args.find((a) => a.startsWith("--target"));
const target = targetFlag ? targetFlag.split("=")[1] || args[args.indexOf(targetFlag) + 1] : null;
const winTarget = target || (isWin ? null : process.env.SERVICES_WIN_TARGET || "x86_64-pc-windows-gnu");

const cargoBase = ["build", "--release"];
if (winTarget) cargoBase.push("--target", winTarget);

function targetDir() {
  if (!winTarget) return "release";
  return path.join(winTarget, "release");
}

function binPath(crateDir, binName) {
  return path.join(crateDir, "target", targetDir(), `${binName}.exe`);
}

function runCargo(cwd, binName) {
  const cmd = [...cargoBase];
  if (binName) cmd.push("--bin", binName);
  console.log(`\n[cargo] ${cwd} → ${cmd.join(" ")}`);
  const r = spawnSync("cargo", cmd, { cwd, stdio: "inherit", shell: isWin });
  if ((r.status ?? 1) !== 0) {
    console.error(`cargo başarısız: ${cwd}`);
    process.exit(r.status ?? 1);
  }
}

function copyExe(src, destName) {
  if (!fs.existsSync(src)) {
    console.error(`Exe bulunamadı: ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, destName);
  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  console.log(`✓ ${destName} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

function writeManifest(entries) {
  const manifest = {
    builtAt: new Date().toISOString(),
    platform: "windows-x64",
    target: winTarget || "native",
    binaries: entries,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest.json yazıldı`);
}

if (!isWin && winTarget) {
  const check = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" });
  if (!String(check.stdout || "").includes(winTarget)) {
    console.log(`Rust hedefi ekleniyor: ${winTarget}`);
    spawnSync("rustup", ["target", "add", winTarget], { stdio: "inherit" });
  }
}

const logoCrate = path.join(root, "services", "logo-connector");
const syncCrate = path.join(root, "src", "sync-service");

const manifestEntries = [];

if (buildLogoConnector) {
  if (!fs.existsSync(path.join(logoCrate, "Cargo.toml"))) {
    console.error("services/logo-connector eksik");
    process.exit(1);
  }
  runCargo(logoCrate, "RetailEX-Logo-Connector");
  copyExe(binPath(logoCrate, "RetailEX-Logo-Connector"), "RetailEX-Logo-Connector.exe");
  manifestEntries.push({
    name: "RetailEX-Logo-Connector.exe",
    version: "1.0.0",
    role: "Logo MSSQL ↔ PostgreSQL (legacy)",
  });
} else {
  console.log("\n[atlandı] RetailEX-Logo-Connector (BUILD_LOGO_CONNECTOR=1 ile derlenir)");
}

const syncEnv = { ...process.env, SQLX_OFFLINE: "true" };
console.log(`\n[cargo] ${syncCrate} → build --release (SQLX_OFFLINE=true) ...`);
{
  const cmd = [...cargoBase, "--bin", "RetailEX-Sync-Service"];
  const r = spawnSync("cargo", cmd, { cwd: syncCrate, stdio: "inherit", shell: isWin, env: syncEnv });
  if ((r.status ?? 1) !== 0) {
    console.error(`cargo başarısız: ${syncCrate}`);
    process.exit(r.status ?? 1);
  }
}

copyExe(binPath(syncCrate, "RetailEX-Sync-Service"), "RetailEX-Sync-Service.exe");
manifestEntries.push({
  name: "RetailEX-Sync-Service.exe",
  version: "2.0.0",
  role: "Mağaza WebSocket senkron",
});

writeManifest(manifestEntries);

console.log("\nTamam → services/windows-x64/");
