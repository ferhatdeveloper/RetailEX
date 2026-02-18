/**
 * Tartılı Ürün Barkod Parser
 * 
 * Farklı EAN-13 formatlarını destekler:
 * 
 * **Format 1 (Ağırlık Sonda)**: 2PPPPPWWWWWC
 *   - Örnek: 2123450012340
 *   - Ürün Kodu: 12345 (1-6. pozisyon)
 *   - Ağırlık: 1234 gram (6-11. pozisyon)
 * 
 * **Format 2 (Ağırlık Başta)**: 2WWWWWPPPPPC
 *   - Örnek: 2012340123450
 *   - Ağırlık: 1234 gram (1-6. pozisyon)
 *   - Ürün Kodu: 12345 (6-11. pozisyon)
 * 
 * **Format 3 (Logo Tiger)**: 20PPPPWWWWWC
 *   - Örnek: 2001234012340
 *   - Ürün Kodu: 1234 (2-6. pozisyon)
 *   - Ağırlık: 1234 gram (6-11. pozisyon)
 * 
 * **Format 4 (Fiyat Bazlı)**: 23PPPPFFFFFC
 *   - Örnek: 2312345012990
 *   - Ürün Kodu: 12345
 *   - Fiyat: 129.90 (para bazlı, ağırlık değil)
 */

export interface ParsedBarcode {
  isWeightBased: boolean;
  isPriceBased?: boolean;
  productCode?: string;
  weight?: number; // gram cinsinden
  price?: number; // fiyat bazlı ise (kuruş cinsinden)
  originalBarcode: string;
  format?: 'weight_end' | 'weight_start' | 'logo_tiger' | 'price_based' | 'unknown';
}

/**
 * Barkodu parse eder ve tartılı ürün bilgilerini çıkarır
 * Format otomatik tespit edilir
 */
export function parseBarcode(barcode: string): ParsedBarcode {
  const trimmed = barcode.trim();
  
  // 13 haneli EAN-13 formatı kontrolü
  if (trimmed.length !== 13) {
    return {
      isWeightBased: false,
      originalBarcode: trimmed
    };
  }
  
  // İlk 2 hane kontrolü
  const prefix = trimmed.substring(0, 2);
  const prefixNum = parseInt(prefix);
  
  // 20-29 arası tartılı ürün prefix'i
  if (prefixNum < 20 || prefixNum > 29) {
    return {
      isWeightBased: false,
      originalBarcode: trimmed
    };
  }
  
  // Format tespiti - ikinci haneye göre
  const secondDigit = parseInt(trimmed[1]);
  
  // Format 4: Fiyat bazlı (23, 24, 25 ile başlar)
  if (prefixNum >= 23 && prefixNum <= 25) {
    const productCode = trimmed.substring(2, 7); // 5 hane
    const priceValue = parseInt(trimmed.substring(7, 12)); // 5 hane (kuruş)
    
    return {
      isWeightBased: false,
      isPriceBased: true,
      productCode,
      price: priceValue,
      originalBarcode: trimmed,
      format: 'price_based'
    };
  }
  
  // Format 3: Logo Tiger (20, 21 ile başlar - ikinci hane 0 veya 1)
  if (prefixNum === 20 || prefixNum === 21) {
    const productCode = trimmed.substring(2, 6); // 4 hane
    const weightValue = parseInt(trimmed.substring(6, 11)); // 5 hane
    
    return {
      isWeightBased: true,
      productCode,
      weight: weightValue,
      originalBarcode: trimmed,
      format: 'logo_tiger'
    };
  }
  
  // Format 1 ve 2 ayrımı için heuristic kullan
  // Ağırlık değerleri genelde daha küçük sayılar olur (0-50000 gram arası)
  
  // Format 1 dene: 2PPPPPWWWWWC (Ağırlık Sonda)
  const format1ProductCode = trimmed.substring(1, 6);
  const format1Weight = parseInt(trimmed.substring(6, 11));
  
  // Format 2 dene: 2WWWWWPPPPPC (Ağırlık Başta)
  const format2Weight = parseInt(trimmed.substring(1, 6));
  const format2ProductCode = trimmed.substring(6, 11);
  
  // Akıllı format seçimi:
  // 1. Ağırlık değeri makul aralıkta mı? (0-50000 gram = 0-50kg)
  // 2. Format 1 öncelikli (daha yaygın)
  
  const isFormat1Valid = format1Weight >= 0 && format1Weight <= 50000;
  const isFormat2Valid = format2Weight >= 0 && format2Weight <= 50000;
  
  // Her ikisi de geçerli ise Format 1'i tercih et (daha yaygın)
  // Sadece Format 2 geçerli ise onu kullan
  if (isFormat1Valid) {
    return {
      isWeightBased: true,
      productCode: format1ProductCode,
      weight: format1Weight,
      originalBarcode: trimmed,
      format: 'weight_end'
    };
  } else if (isFormat2Valid) {
    return {
      isWeightBased: true,
      productCode: format2ProductCode,
      weight: format2Weight,
      originalBarcode: trimmed,
      format: 'weight_start'
    };
  }
  
  // Hiçbir format uymazsa, varsayılan Format 1
  return {
    isWeightBased: true,
    productCode: format1ProductCode,
    weight: format1Weight,
    originalBarcode: trimmed,
    format: 'weight_end'
  };
}

/**
 * Gram cinsinden ağırlığı birime göre dönüştürür
 */
export function convertWeight(weightInGrams: number, unit: string): number {
  const upperUnit = unit.toUpperCase();
  
  switch (upperUnit) {
    case 'GR':
    case 'GRAM':
      return weightInGrams;
    
    case 'KG':
    case 'KİLO':
      return weightInGrams / 1000;
    
    case 'LT':
    case 'LİTRE':
      // Sıvılarda genelde 1:1 kabul edilir (su bazlı)
      return weightInGrams / 1000;
    
    default:
      // Bilinmeyen birim - gram olarak dön
      return weightInGrams / 1000; // kg varsayımı
  }
}

/**
 * Kuruş cinsinden fiyatı TL'ye dönüştürür
 */
export function convertPrice(priceInCents: number): number {
  return priceInCents / 100;
}

/**
 * Barkod tartılı ürün barkodu mu kontrol eder (hızlı kontrol)
 */
export function isWeightBasedBarcode(barcode: string): boolean {
  if (barcode.length !== 13) return false;
  const prefix = parseInt(barcode.substring(0, 2));
  return prefix >= 20 && prefix <= 29;
}

/**
 * Barkod formatını açıklama olarak döndürür (debug/log için)
 */
export function getBarcodeFormatInfo(parsed: ParsedBarcode): string {
  if (!parsed.isWeightBased && !parsed.isPriceBased) {
    return 'Normal ürün barkodu';
  }
  
  switch (parsed.format) {
    case 'weight_end':
      return 'Format 1: Ağırlık sonda (2PPPPPWWWWW)';
    case 'weight_start':
      return 'Format 2: Ağırlık başta (2WWWWWPPPPP)';
    case 'logo_tiger':
      return 'Format 3: Logo Tiger (20PPPPWWWWW)';
    case 'price_based':
      return 'Format 4: Fiyat bazlı (23PPPPFFFFF)';
    default:
      return 'Bilinmeyen format';
  }
}
