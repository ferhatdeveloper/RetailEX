/**
 * Native mobil (Android / iOS WebView) tespiti — Tauri masaüstü değil.
 *
 * NOT: Capacitor npm paketi projeden kaldırıldı (mobil React Native'e taşındı).
 * Bu yardımcılar yalnızca global `window.Capacitor` (bir WebView enjekte ederse)
 * kontrol eder; web ve Tauri'de her zaman `false` döner. Böylece mevcut çağrı
 * noktaları güvenle çalışmaya devam eder.
 */
import { IS_TAURI } from './env';

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capGlobal(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isCapacitorNative(): boolean {
  if (IS_TAURI || typeof window === 'undefined') return false;
  const c = capGlobal();
  if (!c?.isNativePlatform?.()) return false;
  const p = c.getPlatform?.();
  return p === 'android' || p === 'ios';
}

export function isCapacitorAndroid(): boolean {
  return isCapacitorNative() && capGlobal()?.getPlatform?.() === 'android';
}
