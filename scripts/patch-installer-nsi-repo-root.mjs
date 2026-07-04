/**
 * tauri build oncesi DeskApp/installer.nsi icindeki __REPO_ROOT__ isaretini
 * gercek depo kok yoluna cevirir (CI ve yerel D:\RetailEX disi makineler).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "__REPO_ROOT__";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nsiPath = path.join(root, "DeskApp", "installer.nsi");
const winRoot = root.replace(/\//g, "\\");

if (!fs.existsSync(nsiPath)) {
  console.warn("[patch-installer-nsi] installer.nsi bulunamadi, atlaniyor.");
  process.exit(0);
}

let content = fs.readFileSync(nsiPath, "utf8");

/** Yerel makinede patch sonrasi commit edilmemis mutlak yol kalirsa CI'de NSIS kirilir. */
const KNOWN_DEV_ROOTS = [
  "D:\\Developer\\App\\RetailEX-main",
  "D:\\RetailEX",
  "C:\\RetailEX",
];

if (!content.includes(MARKER)) {
  for (const devRoot of KNOWN_DEV_ROOTS) {
    if (content.includes(devRoot)) {
      content = content.replaceAll(devRoot, MARKER);
    }
  }
}

if (!content.includes(MARKER)) {
  const escaped = winRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  content = content.replace(new RegExp(escaped, "g"), MARKER);
}

if (!content.includes(MARKER)) {
  console.warn(
    "[patch-installer-nsi] __REPO_ROOT__ isareti yok; NSIS yollari zaten guncel olabilir."
  );
  process.exit(0);
}

content = content.replaceAll(MARKER, winRoot);
fs.writeFileSync(nsiPath, content, "utf8");
console.log(`[patch-installer-nsi] REPO_ROOT -> ${winRoot}`);
