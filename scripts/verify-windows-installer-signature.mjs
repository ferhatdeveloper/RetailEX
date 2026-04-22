/**
 * Windows: NSIS setup.exe icinde Authenticode imzasi var mi kontrol eder.
 * npm run tauri:build sonunda cagrılır — imzasız cikti müşteri SAC/SmartScreen'de takilir.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

if (process.platform !== "win32") {
  console.log("[verify-installer-signature] Windows disi; atlandi.");
  process.exit(0);
}

const nsisDir = path.join(root, "DeskApp", "target", "release", "bundle", "nsis");
if (!fs.existsSync(nsisDir)) {
  console.warn("[verify-installer-signature] NSIS klasoru yok (bundle uretilmedi?):", nsisDir);
  process.exit(0);
}

// Tauri NSIS: retailex_*_x64-setup.exe; eski kalip *_setup.exe
const files = fs
  .readdirSync(nsisDir)
  .filter((n) => {
    const l = n.toLowerCase();
    return l.endsWith(".exe") && (l.endsWith("-setup.exe") || l.endsWith("_setup.exe"));
  });
if (files.length === 0) {
  console.error("[verify-installer-signature] *-setup.exe / *_setup.exe bulunamadi:", nsisDir);
  process.exit(1);
}

let best = null;
for (const name of files) {
  const p = path.join(nsisDir, name);
  const st = fs.statSync(p);
  if (!best || st.mtimeMs > best.mtimeMs) best = { p, mtimeMs: st.mtimeMs, name };
}

const setupPath = path.resolve(best.p);
const ps = `$ErrorActionPreference = 'Stop'
$s = Get-AuthenticodeSignature -LiteralPath $env:RETAILEX_VERIFY_SETUP
Write-Output $s.Status
if ($null -ne $s.SignerCertificate) { Write-Output $s.SignerCertificate.Subject }`;

let lines;
try {
  lines = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    encoding: "utf8",
    env: { ...process.env, RETAILEX_VERIFY_SETUP: setupPath },
  })
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
} catch (e) {
  console.error("[verify-installer-signature] PowerShell hatasi:", e.message);
  process.exit(1);
}

const status = lines[0] || "Unknown";
const subject = lines.slice(1).join(" | ");

if (status === "NotSigned") {
  console.error(
    "[verify-installer-signature] HATA: Kurulum dosyasi IMZASIZ. Müşteri PC'de Akilli Uygulama Denetimi engeller.\n  Dosya:",
    setupPath,
    "\n  Çözüm: derleme makinesinde kod imzalama sertifikasi + tauri-windows-signing-prep cikisi (tauri.windows.conf.json)."
  );
  process.exit(1);
}

if (status === "HashMismatch") {
  console.error("[verify-installer-signature] HATA: Imza hash uyusmuyor:", setupPath);
  process.exit(1);
}

if (status === "Valid") {
  console.log("[verify-installer-signature] OK — Authenticode:", status);
  if (subject) console.log("  Imzalayan:", subject.slice(0, 120));
  console.log("  Dosya:", setupPath);
  process.exit(0);
}

console.warn(
  "[verify-installer-signature] UYARI: Imza durumu '" +
    status +
    "' (Valid degil). Dosya yine de imzali olabilir; müşteri ortaminda SAC yine engelleyebilir.\n  Dosya:",
  setupPath
);
if (subject) console.warn("  Konu:", subject.slice(0, 120));
process.exit(0);
