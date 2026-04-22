/**
 * Windows: tauri build oncesi DeskApp/tauri.windows.conf.json uretir (Tauri birlestirme).
 * Kaynaklar (oncelik sirasi):
 *  1) WINDOWS_CODESIGN_THUMBPRINT veya WINDOWS_CERTIFICATE_THUMBPRINT
 *  2) SM_CERT_FINGERPRINT + smctl windows certsync (DigiCert ONE / KeyLocker)
 *  3) WINDOWS_CODESIGN_PFX + WINDOWS_CODESIGN_PFX_PASSWORD (.pfx yerel dosya)
 *  4) Varsayilan (Windows): Cert magazasi -CodeSigningCert taramasi (tek eslesme veya SUBJECT_CONTAINS).
 *     WINDOWS_CODESIGN_AUTO=0|false|off|no → magaza taramasini kapat (yalnizca thumbprint/pfx/sm).
 *
 * Kok dizinde .env.signing yuklenir (satir bazli KEY=VAL, # yorum).
 * WINDOWS_CODESIGN_DISABLE=1 → tauri.windows.conf.json silinir (imzasiz build).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const deskApp = path.join(root, "DeskApp");
const outFile = path.join(deskApp, "tauri.windows.conf.json");

function loadEnvSigning() {
  const p = path.join(root, ".env.signing");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function writeConf(thumbprint) {
  const clean = String(thumbprint).replace(/\s/g, "").toUpperCase();
  if (!/^[0-9A-F]{40}$/i.test(clean)) {
    console.warn(
      "[tauri-windows-signing] Thumbprint beklenen formatta degil (40 hex karakter); yine de yaziliyor."
    );
  }
  const json = {
    bundle: {
      windows: {
        certificateThumbprint: clean,
      },
    },
  };
  fs.mkdirSync(deskApp, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log("[tauri-windows-signing] Imza: tauri.windows.conf.json guncellendi.");
}

function trySmctlSync() {
  try {
    execSync("smctl windows certsync", {
      cwd: root,
      stdio: "pipe",
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

function thumbFromStoreByFingerprint(fingerprint) {
  const fp = fingerprint.replace(/[:\s-]/g, "").toUpperCase();
  const ps = `$c = Get-ChildItem -Path Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint.ToUpper() -eq '${fp}' } | Select-Object -First 1
if (-not $c) { exit 2 }
Write-Output $c.Thumbprint`;
  try {
    return execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { encoding: "utf8" }
    ).trim();
  } catch {
    return "";
  }
}

function thumbFromPfx(pfxPath, password) {
  const pfxEsc = pfxPath.replace(/'/g, "''");
  const pwdEsc = String(password).replace(/'/g, "''");
  const ps = `$ErrorActionPreference = 'Stop'
$pwd = ConvertTo-SecureString -String '${pwdEsc}' -Force -AsPlainText
$c = Import-PfxCertificate -FilePath '${pfxEsc}' -CertStoreLocation Cert:\\CurrentUser\\My -Password $pwd
Write-Output $c.Thumbprint`;
  try {
    return execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { encoding: "utf8" }
    ).trim();
  } catch (e) {
    console.error("[tauri-windows-signing] PFX import/thumbprint alinamadi:", e.message);
    return "";
  }
}

/** Windows kod imza sertifikasi: CurrentUser\\My (varsayilan acik; AUTO=0 ile kapat) */
function thumbFromWindowsCertStore() {
  const autoRaw = (process.env.WINDOWS_CODESIGN_AUTO || "").trim().toLowerCase();
  if (
    autoRaw === "0" ||
    autoRaw === "false" ||
    autoRaw === "off" ||
    autoRaw === "no"
  ) {
    return "";
  }

  let store = (process.env.WINDOWS_CODESIGN_STORE || "CurrentUser").trim();
  if (store !== "CurrentUser" && store !== "LocalMachine") {
    console.warn(
      "[tauri-windows-signing] WINDOWS_CODESIGN_STORE: CurrentUser veya LocalMachine olmali; CurrentUser kullanildi."
    );
    store = "CurrentUser";
  }

  const subFilter = (process.env.WINDOWS_CODESIGN_SUBJECT_CONTAINS || "").trim();
  const subEsc = subFilter.replace(/'/g, "''");
  const ps = `$ErrorActionPreference = 'SilentlyContinue'
$sub = '${subEsc}'
$certs = @(Get-ChildItem -Path Cert:\\${store}\\My -CodeSigningCert -ErrorAction SilentlyContinue)
if ($sub) { $certs = @($certs | Where-Object { $_.Subject -like ('*' + $sub + '*') }) }
if (-not $certs -or $certs.Count -eq 0) { Write-Output '[]' }
else { $certs | Select-Object Thumbprint, Subject | ConvertTo-Json -Compress }`;

  try {
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
      encoding: "utf8",
    }).trim();
    if (!raw || raw === "[]") {
      console.warn(
        "[tauri-windows-signing] Kod-imza sertifikasi bulunamadi (Cert:\\" +
          store +
          "\\My). .pfx / thumbprint veya WINDOWS_CODESIGN_SUBJECT_CONTAINS deneyin."
      );
      return "";
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[tauri-windows-signing] Cert store JSON parse hatasi.");
      return "";
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (arr.length > 1) {
      console.warn(
        "[tauri-windows-signing] Birden fazla kod-imza sertifikasi; WINDOWS_CODESIGN_SUBJECT_CONTAINS veya WINDOWS_CODESIGN_THUMBPRINT kullanin."
      );
      return "";
    }
    const t = String(arr[0].Thumbprint || "").replace(/\s/g, "").toUpperCase();
    const subj = String(arr[0].Subject || "").slice(0, 100);
    console.log("[tauri-windows-signing] Kod imza (magaza):", subj || t);
    return t;
  } catch (e) {
    console.warn("[tauri-windows-signing] Cert store okunamadi:", e.message);
    return "";
  }
}

function main() {
  loadEnvSigning();

  if (process.platform !== "win32") {
    console.log("[tauri-windows-signing] Windows disi; atlandi.");
    return;
  }

  if (
    process.env.WINDOWS_CODESIGN_DISABLE === "1" ||
    process.env.WINDOWS_CODESIGN_DISABLE === "true"
  ) {
    if (fs.existsSync(outFile)) {
      fs.unlinkSync(outFile);
      console.log("[tauri-windows-signing] WINDOWS_CODESIGN_DISABLE: tauri.windows.conf.json silindi.");
    }
    return;
  }

  let thumb =
    process.env.WINDOWS_CODESIGN_THUMBPRINT ||
    process.env.WINDOWS_CERTIFICATE_THUMBPRINT ||
    "";

  if (!thumb && process.env.SM_CERT_FINGERPRINT) {
    let hasSmctl = false;
    try {
      execFileSync("where.exe", ["smctl"], { stdio: "pipe" });
      hasSmctl = true;
    } catch {
      console.warn(
        "[tauri-windows-signing] SM_CERT_FINGERPRINT var ama smctl bulunamadi; cert store dogrudan deneniyor."
      );
    }
    if (hasSmctl) {
      trySmctlSync();
    }
    thumb = thumbFromStoreByFingerprint(process.env.SM_CERT_FINGERPRINT);
    if (!thumb) {
      console.warn(
        "[tauri-windows-signing] SM_CERT_FINGERPRINT ile cert storeda eslesme yok; setup-digicert.ps1 veya smctl windows certsync deneyin."
      );
    }
  }

  const pfxPath =
    process.env.WINDOWS_CODESIGN_PFX || process.env.WINDOWS_CERTIFICATE_PATH || "";
  const pfxPassword =
    process.env.WINDOWS_CODESIGN_PFX_PASSWORD ??
    process.env.WINDOWS_CERTIFICATE_PASSWORD;

  if (!thumb && pfxPath && fs.existsSync(pfxPath) && pfxPassword !== undefined) {
    thumb = thumbFromPfx(pfxPath, pfxPassword);
  }

  if (!thumb) {
    thumb = thumbFromWindowsCertStore();
  }

  if (thumb) {
    writeConf(thumb);
    return;
  }

  if (fs.existsSync(outFile)) {
    console.log(
      "[tauri-windows-signing] Ortamda imza bilgisi yok; mevcut tauri.windows.conf.json korunuyor (elle konmus olabilir)."
    );
  } else {
    console.log(
      "[tauri-windows-signing] Imza yok: thumbprint/pfx/sm yok ve magazada tek kod-imza sertifikasi bulunamadi (veya WINDOWS_CODESIGN_AUTO=0). Imzasiz Windows build."
    );
  }
}

main();
