/**
 * Capacitor native (Android / iOS) — Tauri masaüstü değil.
 */
import { Capacitor } from '@capacitor/core';
import { IS_TAURI } from './env';

export function isCapacitorNative(): boolean {
  if (IS_TAURI || typeof window === 'undefined') return false;
  if (!Capacitor.isNativePlatform()) return false;
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios';
}

export function isCapacitorAndroid(): boolean {
  return isCapacitorNative() && Capacitor.getPlatform() === 'android';
}
