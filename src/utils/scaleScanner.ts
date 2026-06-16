/**
 * Terazi Ağ Tarayıcı
 *
 * Gerçek tarama: Terazi köprüsü (scale-bridge) üzerinden yapılır.
 * Tarayıcı doğrudan LAN'a erişemez; mağaza PC'deki köprü servisi tarar.
 */

import type { ScaleDevice } from './scaleProtocol';
import {
  resolveScaleBridgeBaseUrl,
  scaleBridgeScanDefaults,
  scaleBridgeScanNetwork,
  scaleBridgeListInboundDevices,
} from '../services/scaleBridgeApi';

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
 * IP aralığını tarar ve terazileri bulur (köprü servisi üzerinden).
 */
export async function scanNetwork(
  startIP?: string,
  endIP?: string,
  onProgress?: (progress: ScanProgress) => void,
  options?: { allSubnets?: boolean }
): Promise<ScannedDevice[]> {
  try {
    if (typeof window !== 'undefined' && (window as { electronAPI?: { scale?: { scanNetwork?: Function } } }).electronAPI?.scale?.scanNetwork) {
      const result = await (window as { electronAPI: { scale: { scanNetwork: (opts: object) => Promise<{ devices?: ScannedDevice[] }> } } }).electronAPI.scale.scanNetwork({
        startIP,
        endIP,
        onProgress,
      });
      return result.devices || [];
    }

    const bridgeBase = resolveScaleBridgeBaseUrl();
    if (!bridgeBase) {
      throw new Error(
        'Ağ taraması için terazi köprüsü gerekli. Mağaza bilgisayarında köprü servisini başlatın veya Terazi Yönetimi\'nden köprü URL\'sini tanımlayın (ör. http://127.0.0.1:3012).'
      );
    }

    if (onProgress) {
      onProgress({ current: 0, total: 254, currentIP: 'Köprü üzerinden taranıyor…' });
    }

    const scanAllSubnets = options?.allSubnets !== false;
    const [inbound, result] = await Promise.all([
      scaleBridgeListInboundDevices(),
      scaleBridgeScanNetwork(
        scanAllSubnets ? undefined : startIP,
        scanAllSubnets ? undefined : endIP,
        32,
        { allSubnets: scanAllSubnets }
      ),
    ]);

    const seen = new Set<string>();
    const devices = [...(result.devices || []), ...inbound]
      .filter((d) => {
        if (seen.has(d.ipAddress)) return false;
        seen.add(d.ipAddress);
        return true;
      })
      .map((d) => ({
        ipAddress: d.ipAddress,
        port: d.port,
        brand: (d.brand || 'rongta') as ScaleDevice['brand'],
        model: d.model,
        isResponding: d.isResponding !== false,
        protocolVerified: d.protocolVerified,
        discoveryMethod: d.discoveryMethod,
        openPorts: d.openPorts,
      }));

    if (onProgress) {
      onProgress({
        current: result.scanned || devices.length,
        total: result.scanned || 254,
        currentIP: undefined,
      });
    }

    return devices;
  } catch (error) {
    console.error('Network scan error:', error);
    throw error instanceof Error ? error : new Error('Tarama sırasında hata oluştu');
  }
}

/**
 * Belirli bir IP adresinde terazi var mı kontrol eder
 */
export async function probeScaleAtIP(
  ipAddress: string,
  port: number = 20304
): Promise<ScannedDevice | null> {
  try {
    if (typeof window !== 'undefined' && (window as { electronAPI?: { scale?: { probe?: Function } } }).electronAPI?.scale?.probe) {
      const result = await (window as { electronAPI: { scale: { probe: (opts: object) => Promise<{ success?: boolean; brand?: string; model?: string }> } } }).electronAPI.scale.probe({
        ipAddress,
        port,
      });

      if (result.success) {
        return {
          ipAddress,
          port,
          brand: result.brand as ScaleDevice['brand'],
          model: result.model,
          isResponding: true,
        };
      }

      return null;
    }

    const bridgeBase = resolveScaleBridgeBaseUrl();
    if (!bridgeBase) return null;

    const result = await scaleBridgeScanNetwork(ipAddress, ipAddress);
    const hit = (result.devices || []).find((d) => d.ipAddress === ipAddress);
    if (!hit) return null;

    return {
      ipAddress: hit.ipAddress,
      port: hit.port || port,
      brand: (hit.brand || 'rongta') as ScaleDevice['brand'],
      model: hit.model,
      isResponding: true,
    };
  } catch (error) {
    console.error('Probe error:', error);
    return null;
  }
}

/**
 * Seri portları (COM portları) tarar
 */
export async function scanSerialPorts(): Promise<{ port: string; description?: string }[]> {
  try {
    if (typeof window !== 'undefined' && (window as { electronAPI?: { scale?: { scanSerialPorts?: Function } } }).electronAPI?.scale?.scanSerialPorts) {
      const result = await (window as { electronAPI: { scale: { scanSerialPorts: () => Promise<{ ports?: { port: string; description?: string }[] }> } } }).electronAPI.scale.scanSerialPorts();
      return result.ports || [];
    }
    return [];
  } catch (error) {
    console.error('Serial port scan error:', error);
    return [];
  }
}

/**
 * USB cihazlarını tarar
 */
export async function scanUSBDevices(): Promise<{ deviceId: string; name?: string }[]> {
  try {
    if (typeof window !== 'undefined' && (window as { electronAPI?: { scale?: { scanUSBDevices?: Function } } }).electronAPI?.scale?.scanUSBDevices) {
      const result = await (window as { electronAPI: { scale: { scanUSBDevices: () => Promise<{ devices?: { deviceId: string; name?: string }[] }> } } }).electronAPI.scale.scanUSBDevices();
      return result.devices || [];
    }
    return [];
  } catch (error) {
    console.error('USB device scan error:', error);
    return [];
  }
}

/**
 * IP adresinin geçerli olup olmadığını kontrol eder
 */
export function validateIPAddress(ip: string): boolean {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

  if (!ipRegex.test(ip)) {
    return false;
  }

  const parts = ip.split('.').map(Number);
  return parts.every((part) => part >= 0 && part <= 255);
}

/**
 * IP aralığının geçerli olup olmadığını kontrol eder
 */
export function validateIPRange(startIP: string, endIP: string): boolean {
  if (!validateIPAddress(startIP) || !validateIPAddress(endIP)) {
    return false;
  }

  const startParts = startIP.split('.').map(Number);
  const endParts = endIP.split('.').map(Number);

  if (startParts[0] !== endParts[0] ||
      startParts[1] !== endParts[1] ||
      startParts[2] !== endParts[2]) {
    return false;
  }

  return startParts[3] <= endParts[3];
}

/**
 * Varsayılan ağ aralığını köprüden veya yerel tahminden alır
 */
export async function getDefaultIPRange(): Promise<{ startIP: string; endIP: string }> {
  try {
    const defaults = await scaleBridgeScanDefaults();
    if (defaults.startIP && defaults.endIP) {
      return { startIP: defaults.startIP, endIP: defaults.endIP };
    }
  } catch {
    /* köprü yok — aşağıdaki yedek */
  }

  if (isTauriRuntime()) {
    return { startIP: '192.168.0.1', endIP: '192.168.0.254' };
  }

  return { startIP: '192.168.1.1', endIP: '192.168.1.254' };
}
