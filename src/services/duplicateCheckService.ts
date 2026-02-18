/**
 * RetailOS - Tekrarlı Kayıt Engelleme Servisi
 * SHA256 hash ile kayıt benzersizliği kontrolü
 */

import CryptoJS from 'crypto-js';

export interface DuplicateCheckResult {
  is_duplicate: boolean;
  existing_record_id?: number;
  hash: string;
  message: string;
}

/**
 * Veriden SHA256 hash oluştur
 */
export function generateHash(data: any): string {
  // Objeyi JSON string'e çevir, boşlukları kaldır
  const jsonString = JSON.stringify(data, Object.keys(data).sort());
  
  // SHA256 hash oluştur
  const hash = CryptoJS.SHA256(jsonString).toString();
  
  return hash;
}

/**
 * Fatura tekrar kontrolü
 */
export async function checkDuplicateFatura(
  faturaNo: string,
  firmaId: number,
  cariId: number,
  tutar: number
): Promise<DuplicateCheckResult> {
  const data = {
    fatura_no: faturaNo,
    firma_id: firmaId,
    cari_id: cariId,
    tutar: tutar
  };

  const hash = generateHash(data);

  try {
    const response = await fetch('/api/v1/duplicate-check/fatura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_name: 'FaturaMaster',
        hash: hash,
        data: data
      })
    });

    if (!response.ok) {
      throw new Error('Tekrar kontrolü başarısız');
    }

    return await response.json();
  } catch (error) {
    console.error('Duplicate check error:', error);
    return {
      is_duplicate: false,
      hash: hash,
      message: 'Kontrol yapılamadı, işleme devam ediliyor'
    };
  }
}

/**
 * Ürün tekrar kontrolü
 */
export async function checkDuplicateUrun(
  urunKodu: string,
  firmaId: number,
  barkod?: string
): Promise<DuplicateCheckResult> {
  const data = {
    urun_kodu: urunKodu,
    firma_id: firmaId,
    barkod: barkod || null
  };

  const hash = generateHash(data);

  try {
    const response = await fetch('/api/v1/duplicate-check/urun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_name: 'Urunler',
        hash: hash,
        data: data
      })
    });

    if (!response.ok) {
      throw new Error('Tekrar kontrolü başarısız');
    }

    return await response.json();
  } catch (error) {
    console.error('Duplicate check error:', error);
    return {
      is_duplicate: false,
      hash: hash,
      message: 'Kontrol yapılamadı, işleme devam ediliyor'
    };
  }
}

/**
 * Müşteri tekrar kontrolü
 */
export async function checkDuplicateMusteri(
  vergiNo: string,
  tcNo: string,
  email: string,
  telefon: string
): Promise<DuplicateCheckResult> {
  const data = {
    vergi_no: vergiNo || null,
    tc_no: tcNo || null,
    email: email || null,
    telefon: telefon || null
  };

  const hash = generateHash(data);

  try {
    const response = await fetch('/api/v1/duplicate-check/musteri', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_name: 'Musteriler',
        hash: hash,
        data: data
      })
    });

    if (!response.ok) {
      throw new Error('Tekrar kontrolü başarısız');
    }

    return await response.json();
  } catch (error) {
    console.error('Duplicate check error:', error);
    return {
      is_duplicate: false,
      hash: hash,
      message: 'Kontrol yapılamadı, işleme devam ediliyor'
    };
  }
}

/**
 * Kasa hareketi tekrar kontrolü
 */
export async function checkDuplicateKasaHareket(
  belgeNo: string,
  kasaBankaId: number,
  tutar: number,
  tarih: string
): Promise<DuplicateCheckResult> {
  const data = {
    belge_no: belgeNo,
    kasa_banka_id: kasaBankaId,
    tutar: tutar,
    tarih: tarih
  };

  const hash = generateHash(data);

  try {
    const response = await fetch('/api/v1/duplicate-check/kasa-hareket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_name: 'KasaHareketleri',
        hash: hash,
        data: data
      })
    });

    if (!response.ok) {
      throw new Error('Tekrar kontrolü başarısız');
    }

    return await response.json();
  } catch (error) {
    console.error('Duplicate check error:', error);
    return {
      is_duplicate: false,
      hash: hash,
      message: 'Kontrol yapılamadı, işleme devam ediliyor'
    };
  }
}

/**
 * Genel tekrar kontrolü (her tablo için)
 */
export async function checkDuplicate(
  tableName: string,
  data: any
): Promise<DuplicateCheckResult> {
  const hash = generateHash(data);

  try {
    const response = await fetch('/api/v1/duplicate-check/generic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_name: tableName,
        hash: hash,
        data: data
      })
    });

    if (!response.ok) {
      throw new Error('Tekrar kontrolü başarısız');
    }

    return await response.json();
  } catch (error) {
    console.error('Duplicate check error:', error);
    return {
      is_duplicate: false,
      hash: hash,
      message: 'Kontrol yapılamadı, işleme devam ediliyor'
    };
  }
}

/**
 * React Hook - Tekrarlı kayıt kontrolü ile form submit
 */
export function useDuplicateCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);

  const checkBeforeSubmit = async (
    tableName: string,
    data: any,
    onSuccess: () => void,
    onDuplicate?: (result: DuplicateCheckResult) => void
  ) => {
    setIsChecking(true);

    try {
      const result = await checkDuplicate(tableName, data);
      setDuplicateResult(result);

      if (result.is_duplicate) {
        // Tekrarlı kayıt bulundu
        if (onDuplicate) {
          onDuplicate(result);
        } else {
          alert(`UYARI: Bu kayıt daha önce eklenmiş!\n\n${result.message}`);
        }
      } else {
        // Tekrar yok, devam et
        onSuccess();
      }
    } catch (error) {
      console.error('Duplicate check error:', error);
      // Hata durumunda işleme devam et (güvenli taraf)
      onSuccess();
    } finally {
      setIsChecking(false);
    }
  };

  return { isChecking, duplicateResult, checkBeforeSubmit };
}

/**
 * Örnek Kullanım:
 * 
 * // Fatura kaydetmeden önce kontrol
 * const result = await checkDuplicateFatura('F-2024-001', 1, 123, 1500.00);
 * 
 * if (result.is_duplicate) {
 *   alert('Bu fatura daha önce kaydedilmiş!');
 *   return;
 * }
 * 
 * // Faturayı kaydet
 * await saveFatura(faturaData);
 * 
 * 
 * // React Component içinde:
 * const { isChecking, checkBeforeSubmit } = useDuplicateCheck();
 * 
 * const handleSubmit = () => {
 *   checkBeforeSubmit(
 *     'Urunler',
 *     { urun_kodu: 'PRD001', firma_id: 1 },
 *     () => {
 *       // Tekrar yok, kaydet
 *       saveProduct();
 *     },
 *     (result) => {
 *       // Tekrar var, kullanıcıya sor
 *       if (confirm(`Bu ürün zaten kayıtlı! Yine de kaydetmek istiyor musunuz?`)) {
 *         saveProduct();
 *       }
 *     }
 *   );
 * };
 */


