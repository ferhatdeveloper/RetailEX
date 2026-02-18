/**
 * Terazi Ağ Tarayıcı
 * 
 * Ağdaki terazileri otomatik olarak bulur
 */

import type { ScaleDevice } from './scaleProtocol';
import { getDefaultPort } from './scaleProtocol';

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
}

/**
 * IP aralığını tarar ve terazileri bulur
 */
export async function scanNetwork(
  startIP: string = '192.168.1.1',
  endIP: string = '192.168.1.254',
  onProgress?: (progress: ScanProgress) => void
): Promise<ScannedDevice[]> {
  try {
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.scanNetwork) {
      const result = await (window as any).electronAPI.scale.scanNetwork({
        startIP,
        endIP,
        onProgress
      });
      
      return result.devices || [];
    }
    
    // Web ortamında simülasyon
    console.log('Scanning network:', startIP, 'to', endIP);
    
    // IP aralığını parse et
    const startParts = startIP.split('.').map(Number);
    const endParts = endIP.split('.').map(Number);
    
    const startLastOctet = startParts[3];
    const endLastOctet = endParts[3];
    const baseIP = `${startParts[0]}.${startParts[1]}.${startParts[2]}`;
    
    const total = endLastOctet - startLastOctet + 1;
    const foundDevices: ScannedDevice[] = [];
    
    // Simülasyon: Bazı IP'lerde terazi var gibi davran
    for (let i = startLastOctet; i <= endLastOctet; i++) {
      const currentIP = `${baseIP}.${i}`;
      
      // Progress callback
      if (onProgress) {
        onProgress({
          current: i - startLastOctet + 1,
          total,
          currentIP
        });
      }
      
      // Simülasyon gecikmesi (gerçekte network request olacak)
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // %5 ihtimalle terazi bul (simülasyon)
      if (Math.random() < 0.05) {
        const brands: ScaleDevice['brand'][] = ['bizerba', 'toledo', 'digi', 'cas'];
        const randomBrand = brands[Math.floor(Math.random() * brands.length)];
        
        foundDevices.push({
          ipAddress: currentIP,
          port: getDefaultPort(randomBrand),
          brand: randomBrand,
          model: `${randomBrand.toUpperCase()}-${Math.floor(Math.random() * 9000) + 1000}`,
          isResponding: true
        });
      }
    }
    
    return foundDevices;
  } catch (error) {
    console.error('Network scan error:', error);
    return [];
  }
}

/**
 * Belirli bir IP adresinde terazi var mı kontrol eder
 */
export async function probeScaleAtIP(
  ipAddress: string,
  port: number = 3000
): Promise<ScannedDevice | null> {
  try {
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.probe) {
      const result = await (window as any).electronAPI.scale.probe({
        ipAddress,
        port
      });
      
      if (result.success) {
        return {
          ipAddress,
          port,
          brand: result.brand,
          model: result.model,
          isResponding: true
        };
      }
      
      return null;
    }
    
    // Web ortamında simülasyon
    console.log('Probing scale at:', ipAddress, port);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // %20 ihtimalle terazi bul (simülasyon)
    if (Math.random() < 0.2) {
      const brands: ScaleDevice['brand'][] = ['bizerba', 'toledo', 'digi', 'cas'];
      const randomBrand = brands[Math.floor(Math.random() * brands.length)];
      
      return {
        ipAddress,
        port,
        brand: randomBrand,
        model: `${randomBrand.toUpperCase()}-${Math.floor(Math.random() * 9000) + 1000}`,
        isResponding: true
      };
    }
    
    return null;
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
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.scanSerialPorts) {
      const result = await (window as any).electronAPI.scale.scanSerialPorts();
      return result.ports || [];
    }
    
    // Web ortamında simülasyon
    console.log('Scanning serial ports...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Simülasyon: Bazı COM portları
    return [
      { port: 'COM1', description: 'Communications Port' },
      { port: 'COM3', description: 'USB Serial Port' },
      { port: 'COM5', description: 'Scale Device' }
    ];
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
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.scanUSBDevices) {
      const result = await (window as any).electronAPI.scale.scanUSBDevices();
      return result.devices || [];
    }
    
    // Web ortamında simülasyon
    console.log('Scanning USB devices...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Simülasyon: Bazı USB cihazları
    return [
      { deviceId: 'USB001', name: 'Bizerba Scale USB' },
      { deviceId: 'USB002', name: 'Generic Scale Device' }
    ];
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
  return parts.every(part => part >= 0 && part <= 255);
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
  
  // İlk 3 oktet aynı olmalı
  if (startParts[0] !== endParts[0] || 
      startParts[1] !== endParts[1] || 
      startParts[2] !== endParts[2]) {
    return false;
  }
  
  // Son oktet: start <= end
  return startParts[3] <= endParts[3];
}

/**
 * Varsayılan ağ aralığını tahmin eder
 */
export function getDefaultIPRange(): { startIP: string; endIP: string } {
  // Varsayılan olarak 192.168.1.x ağını tara
  return {
    startIP: '192.168.1.1',
    endIP: '192.168.1.254'
  };
}

