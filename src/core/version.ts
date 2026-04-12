/**
 * Sürüm: kök package.json "version" alanından gelir (tek kaynak).
 * DeskApp (Tauri/Cargo) sürümü npm run build öncesi scripts/sync-app-version.mjs ile eşitlenir.
 */
import pkg from '../../package.json';

function parseSemver(s: string): { major: number; minor: number; patch: number } {
  const parts = s.split('.').map((x) => parseInt(x, 10));
  const [a, b, c] = parts;
  return {
    major: Number.isFinite(a) ? a : 0,
    minor: Number.isFinite(b) ? b : 0,
    patch: Number.isFinite(c) ? c : 0,
  };
}

const semver = parseSemver(pkg.version);

/** npm semver string (örn. "0.1.62") */
export const APP_SEMVER = pkg.version;

export const APP_VERSION = {
  major: semver.major,
  minor: semver.minor,
  /** Üçüncü semver segmenti; geçmişte "build" adı kullanılıyor */
  build: semver.patch,

  get display(): string {
    return `Version ${this.build}`;
  },

  get full(): string {
    return `${this.major}.${this.minor}.${this.build}`;
  },

  increment(): void {
    this.build++;
    console.log(`🔄 Version updated to ${this.display}`);
  },
};

console.log(`🚀 ExRetailOS ${APP_VERSION.display} (${APP_SEMVER})`);
