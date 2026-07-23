/**
 * AsinERP taşınabilir (USB) zip dosya adı — sürüm: kök package.json.
 * @param {string} version semver, örn. 0.1.228
 */
export function portableZipFilename(version) {
  const v = String(version || '').trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) {
    throw new Error(`[portable-zip-filename] Geçersiz semver: ${version}`);
  }
  return `AsinERP-Portable-${v}.zip`;
}

export function portableFolderName(version) {
  const v = String(version || '').trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) {
    throw new Error(`[portable-zip-filename] Geçersiz semver: ${version}`);
  }
  return `AsinERP-Portable-${v}`;
}
