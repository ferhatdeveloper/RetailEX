/**
 * Masaüstü NSIS kurulum dosya adı — tek kalıp (GitHub release + yerel indirme).
 * Sürüm kaynağı: kök package.json (app-version-single-source).
 */

/** @param {string} version semver, örn. 0.1.151 */
export function desktopInstallerFilename(version) {
  const v = String(version || '').trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) {
    throw new Error(`[desktop-installer-filename] Geçersiz semver: ${version}`);
  }
  return `RetailEX-Desktop-Setup-${v}.exe`;
}

/** Eski release'ler (geriye dönük) */
export const LEGACY_DESKTOP_INSTALLER_FILENAME = 'RetailEX-Desktop-Setup.exe';
