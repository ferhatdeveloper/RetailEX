/**
 * Terazi İletişim Protokolü
 * 
 * Desteklenen Markalar:
 * - Bizerba
 * - Toledo
 * - Mettler Toledo
 * - Digi
 * - CAS
 * - Dibal
 */

import type { Product } from '../App';

export interface ScaleDevice {
  id: string;
  name: string;
  brand: 'bizerba' | 'toledo' | 'mettler' | 'digi' | 'cas' | 'dibal' | 'generic';
  model: string;
  connectionType: 'tcp' | 'usb' | 'serial';
  ipAddress?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
  status: 'online' | 'offline' | 'error' | 'syncing';
  lastSync?: string;
  productCount?: number;
  firmwareVersion?: string;
}

export interface ScaleProduct {
  pluCode: string; // PLU kodu (1-99999)
  name: string;
  price: number;
  unit: string;
  barcode?: string;
  tare?: number; // Dara (ambalaj) ağırlığı
  shelfLife?: number; // Raf ömrü (gün)
  expiryDays?: number; // Son kullanma tarihi (gün)
}

export interface ScaleSyncResult {
  success: boolean;
  message: string;
  sentCount?: number;
  failedCount?: number;
  errors?: string[];
}

/**
 * Terazi bağlantısını test eder
 */
export async function testScaleConnection(device: ScaleDevice): Promise<boolean> {
  try {
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.testConnection) {
      const result = await (window as any).electronAPI.scale.testConnection({
        type: device.connectionType,
        ipAddress: device.ipAddress,
        port: device.port,
        comPort: device.comPort,
        baudRate: device.baudRate
      });
      return result.success;
    }
    
    // Web ortamında simülasyon
    console.log('Testing scale connection:', device);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // IP validasyonu
    if (device.connectionType === 'tcp' && device.ipAddress) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      return ipRegex.test(device.ipAddress);
    }
    
    return true;
  } catch (error) {
    console.error('Scale connection test error:', error);
    return false;
  }
}

/**
 * Ürünleri teraziye gönderir
 */
export async function sendProductsToScale(
  device: ScaleDevice,
  products: Product[],
  pluStartIndex: number = 1
): Promise<ScaleSyncResult> {
  try {
    // Ürünleri terazi formatına dönüştür
    const scaleProducts: ScaleProduct[] = products.map((product, index) => ({
      pluCode: String(pluStartIndex + index).padStart(5, '0'),
      name: product.name.substring(0, 40), // Max 40 karakter
      price: product.price,
      unit: product.unit,
      barcode: product.barcode,
      tare: 0,
      shelfLife: 0,
      expiryDays: 0
    }));
    
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.sendProducts) {
      const result = await (window as any).electronAPI.scale.sendProducts({
        device: {
          type: device.connectionType,
          brand: device.brand,
          ipAddress: device.ipAddress,
          port: device.port,
          comPort: device.comPort,
          baudRate: device.baudRate
        },
        products: scaleProducts
      });
      
      return {
        success: result.success,
        message: result.message,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        errors: result.errors
      };
    }
    
    // Web ortamında simülasyon
    console.log('Sending products to scale:', device.name, scaleProducts);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: true,
      message: `${scaleProducts.length} ürün başarıyla gönderildi`,
      sentCount: scaleProducts.length,
      failedCount: 0
    };
  } catch (error) {
    console.error('Send products error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Bilinmeyen hata',
      sentCount: 0,
      failedCount: products.length,
      errors: [error instanceof Error ? error.message : 'Bilinmeyen hata']
    };
  }
}

/**
 * Tek ürünü teraziye gönderir
 */
export async function sendSingleProductToScale(
  device: ScaleDevice,
  product: Product,
  pluCode: string
): Promise<ScaleSyncResult> {
  const scaleProduct: ScaleProduct = {
    pluCode: pluCode.padStart(5, '0'),
    name: product.name.substring(0, 40),
    price: product.price,
    unit: product.unit,
    barcode: product.barcode,
    tare: 0,
    shelfLife: 0,
    expiryDays: 0
  };
  
  try {
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.sendSingleProduct) {
      const result = await (window as any).electronAPI.scale.sendSingleProduct({
        device: {
          type: device.connectionType,
          brand: device.brand,
          ipAddress: device.ipAddress,
          port: device.port,
          comPort: device.comPort,
          baudRate: device.baudRate
        },
        product: scaleProduct
      });
      
      return {
        success: result.success,
        message: result.message
      };
    }
    
    // Web ortamında simülasyon
    console.log('Sending single product to scale:', device.name, scaleProduct);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      message: `${product.name} (PLU: ${pluCode}) başarıyla gönderildi`
    };
  } catch (error) {
    console.error('Send single product error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Bilinmeyen hata'
    };
  }
}

/**
 * Teraziden ürün listesini okur
 */
export async function readProductsFromScale(device: ScaleDevice): Promise<ScaleProduct[]> {
  try {
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.readProducts) {
      const result = await (window as any).electronAPI.scale.readProducts({
        type: device.connectionType,
        brand: device.brand,
        ipAddress: device.ipAddress,
        port: device.port,
        comPort: device.comPort,
        baudRate: device.baudRate
      });
      
      return result.products || [];
    }
    
    // Web ortamında simülasyon
    console.log('Reading products from scale:', device.name);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return [];
  } catch (error) {
    console.error('Read products error:', error);
    return [];
  }
}

/**
 * Terazideki tüm ürünleri siler
 */
export async function clearScaleProducts(device: ScaleDevice): Promise<ScaleSyncResult> {
  try {
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.clearProducts) {
      const result = await (window as any).electronAPI.scale.clearProducts({
        type: device.connectionType,
        brand: device.brand,
        ipAddress: device.ipAddress,
        port: device.port,
        comPort: device.comPort,
        baudRate: device.baudRate
      });
      
      return {
        success: result.success,
        message: result.message
      };
    }
    
    // Web ortamında simülasyon
    console.log('Clearing products from scale:', device.name);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      message: 'Tüm ürünler başarıyla silindi'
    };
  } catch (error) {
    console.error('Clear products error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Bilinmeyen hata'
    };
  }
}

/**
 * Terazi bilgilerini okur (model, firmware, vb.)
 */
export async function getScaleInfo(device: ScaleDevice): Promise<{
  model?: string;
  firmwareVersion?: string;
  productCount?: number;
  maxProducts?: number;
}> {
  try {
    // Electron API kontrolü
    if (typeof window !== 'undefined' && (window as any).electronAPI?.scale?.getInfo) {
      const result = await (window as any).electronAPI.scale.getInfo({
        type: device.connectionType,
        brand: device.brand,
        ipAddress: device.ipAddress,
        port: device.port,
        comPort: device.comPort,
        baudRate: device.baudRate
      });
      
      return result;
    }
    
    // Web ortamında simülasyon
    console.log('Getting scale info:', device.name);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      model: device.model,
      firmwareVersion: '1.0.0',
      productCount: 0,
      maxProducts: 10000
    };
  } catch (error) {
    console.error('Get scale info error:', error);
    return {};
  }
}

/**
 * PLU kod formatını doğrular
 */
export function validatePLUCode(pluCode: string): boolean {
  const code = parseInt(pluCode);
  return code >= 1 && code <= 99999;
}

/**
 * Terazi markasına göre varsayılan port numarasını döndürür
 */
export function getDefaultPort(brand: ScaleDevice['brand']): number {
  switch (brand) {
    case 'bizerba':
      return 3001;
    case 'toledo':
    case 'mettler':
      return 8001;
    case 'digi':
      return 3000;
    case 'cas':
      return 5000;
    case 'dibal':
      return 8000;
    default:
      return 3000;
  }
}

/**
 * Terazi markasına göre varsayılan baud rate döndürür
 */
export function getDefaultBaudRate(brand: ScaleDevice['brand']): number {
  switch (brand) {
    case 'bizerba':
    case 'toledo':
    case 'mettler':
      return 9600;
    case 'digi':
      return 19200;
    case 'cas':
    case 'dibal':
      return 9600;
    default:
      return 9600;
  }
}

