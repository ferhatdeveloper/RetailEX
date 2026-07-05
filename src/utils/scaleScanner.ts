/**
 * Terazi ağ tarayıcı — Tauri/electron stub veya manuel IP.
 * ScaleBridge kaldırıldı; web tarayıcıda otomatik LAN taraması desteklenmez.
 */

import type { ScaleDevice } from './scaleProtocol';

export interface ScanProgress {
  current: number;
  total: number;
  currentIP?: string;
}

export interface ScannedDevice {
  ipAddress: string;
  port: number;
  brand?: ScaleDevice['brand'];
  model?: string;
  isResponding: boolean;
  protocolVerified?: boolean;
  discoveryMethod?: 'protocol' | 'tcp' | 'inbound';
  openPorts?: number[];
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

/**
 * IP aralığını tarar ve terazileri bulur.
 */
export async function scanNetwork(
  startIP?: string,
  endIP?: string,
  onProgress?: (progress: ScanProgress) => void,
  options?: { allSubnets?: boolean; signal?: AbortSignal }
): Promise<ScannedDevice[]> {
  void options;
  try {
    if (typeof window !== 'undefined' && (window as { electronAPI?: { scale?: { scanNetwork?: Function } } }).electronAPI?.scale?.scanNetwork) {
      const result = await (window as { electronAPI: { scale: { scanNetwork: (opts: object) => Promise<{ devices?: ScannedDevice[] }> } } }).electronAPI.scale.scanNetwork({
        startIP,
        endIP,
        onProgress,
      });
      return result.devices || [];
    }

    if (isTauriRuntime()) {
      throw new Error(
        'Otomatik ağ taraması bu sürümde kullanılamıyor. Teraziyi manuel ekleyin (IP + port) veya yerel terazi uygulamanızı kullanın.'
      );
    }

    throw new Error(
      'Web modunda otomatik ağ taraması yapılamaz. Teraziyi manuel ekleyin; bağlantı testi pg_bridge veya masaüstü uygulaması üzerinden TCP ile çalışır.'
    );
  } catch (error) {
    console.error('Network scan error:', error);
    throw error;
  }
}

/**
 * Tek IP için hızlı kontrol (şu an desteklenmiyor — manuel ekleme önerilir).
 */
export async function quickScanIP(ipAddress: string): Promise<ScannedDevice | null> {
  void ipAddress;
  return null;
}

/**
 * Varsayılan tarama aralığı (UI ipucu).
 */
export async function getDefaultIPRange(): Promise<{ startIP: string; endIP: string; hint?: string }> {
  return {
    startIP: '192.168.1.1',
    endIP: '192.168.1.254',
    hint: 'Otomatik tarama kapalı — IP aralığını elle girin veya teraziyi manuel ekleyin.',
  };
}

export async function getDefaultScanRange(): Promise<{ startIP: string; endIP: string; hint?: string }> {
  return getDefaultIPRange();
}

export function validateIPAddress(ip: string): boolean {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  return parts.every((part) => part >= 0 && part <= 255);
}

export function validateIPRange(startIP: string, endIP: string): boolean {
  if (!validateIPAddress(startIP) || !validateIPAddress(endIP)) return false;
  const startParts = startIP.split('.').map(Number);
  const endParts = endIP.split('.').map(Number);
  if (startParts[0] !== endParts[0] || startParts[1] !== endParts[1] || startParts[2] !== endParts[2]) {
    return false;
  }
  return startParts[3] <= endParts[3];
}

export async function scanSerialPorts(): Promise<{ port: string; description?: string }[]> {
  try {
    if (typeof window !== 'undefined' && (window as { electronAPI?: { scale?: { scanSerialPorts?: Function } } }).electronAPI?.scale?.scanSerialPorts) {
      const result = await (window as { electronAPI: { scale: { scanSerialPorts: () => Promise<{ ports?: { port: string; description?: string }[] }> } } }).electronAPI.scale.scanSerialPorts();
      return result.ports || [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function scanUSBDevices(): Promise<{ deviceId: string; name?: string }[]> {
  try {
    if (typeof window !== 'undefined' && (window as { electronAPI?: { scale?: { scanUSBDevices?: Function } } }).electronAPI?.scale?.scanUSBDevices) {
      const result = await (window as { electronAPI: { scale: { scanUSBDevices: () => Promise<{ devices?: { deviceId: string; name?: string }[] }> } } }).electronAPI.scale.scanUSBDevices();
      return result.devices || [];
    }
    return [];
  } catch {
    return [];
  }
}
