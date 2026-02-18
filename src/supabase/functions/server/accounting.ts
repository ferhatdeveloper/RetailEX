/**
 * ExRetailOS - Accounting Service (Backend)
 * 
 * Otomatik muhasebe fişi oluşturma servisi
 * Logo muhasebe mantığında çalışır
 * 
 * @created 2024-12-18
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ===== TYPES =====

interface JournalEntry {
  fis_no?: string;
  fis_tarihi: string;
  firma_id: string;
  donem_id: string;
  aciklama: string;
  kaynak_belge_tipi?: string; // 'SALES_INVOICE', 'PURCHASE_INVOICE', etc.
  kaynak_belge_no?: string;
  olusturan_kullanici?: string;
  durum: 'taslak' | 'onaylandi' | 'iptal';
}

interface JournalLine {
  fis_id: string;
  satir_no: number;
  hesap_kodu: string;
  hesap_adi: string;
  borc: number;
  alacak: number;
  aciklama?: string;
  doviz_kodu?: string;
  doviz_tutar?: number;
  kur?: number;
}

interface CreateJournalRequest {
  firma_id: string;
  donem_id: string;
  tarih: string; // ISO date string
  aciklama: string;
  kaynak_belge_tipi?: string;
  kaynak_belge_no?: string;
  satirlar: {
    hesap_kodu: string;
    hesap_adi: string;
    borc: number;
    alacak: number;
    aciklama?: string;
  }[];
}

interface CreateJournalResponse {
  success: boolean;
  fis_no?: string;
  fis_id?: string;
  error?: string;
  details?: any;
}

// ===== HELPER FUNCTIONS =====

/**
 * Yeni fiş numarası oluştur
 * Format: FIS-YYYY-NNNN
 */
async function generateFisNo(firma_id: string, donem_id: string, tarih: string): Promise<string> {
  const year = new Date(tarih).getFullYear();
  
  // Bu yıl ve dönemde kaç fiş var?
  const { data: existingFisler, error } = await supabase
    .from('yevmiye_fisleri')
    .select('fis_no')
    .eq('firma_id', firma_id)
    .eq('donem_id', donem_id)
    .like('fis_no', `FIS-${year}-%`)
    .order('fis_no', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[Accounting] Fiş no error:', error);
    // Fallback: 0001'den başla
    return `FIS-${year}-0001`;
  }

  if (!existingFisler || existingFisler.length === 0) {
    return `FIS-${year}-0001`;
  }

  // Son fiş no'dan sıra numarasını al
  const lastFisNo = existingFisler[0].fis_no;
  const lastNumber = parseInt(lastFisNo.split('-')[2] || '0', 10);
  const nextNumber = lastNumber + 1;

  return `FIS-${year}-${nextNumber.toString().padStart(4, '0')}`;
}

/**
 * Borç-Alacak dengesi kontrolü
 */
function validateBalance(satirlar: any[]): { valid: boolean; error?: string } {
  const totalBorc = satirlar.reduce((sum, s) => sum + (s.borc || 0), 0);
  const totalAlacak = satirlar.reduce((sum, s) => sum + (s.alacak || 0), 0);

  if (Math.abs(totalBorc - totalAlacak) > 0.01) {
    return {
      valid: false,
      error: `Borç-Alacak dengesi uyumsuz! Borç: ${totalBorc} IQD, Alacak: ${totalAlacak} IQD`
    };
  }

  return { valid: true };
}

/**
 * Satır validasyonu
 */
function validateLines(satirlar: any[]): { valid: boolean; error?: string } {
  if (!satirlar || satirlar.length === 0) {
    return { valid: false, error: 'En az bir satır gerekli' };
  }

  for (const satir of satirlar) {
    if (!satir.hesap_kodu || !satir.hesap_adi) {
      return { valid: false, error: 'Hesap kodu ve adı zorunlu' };
    }

    if ((satir.borc || 0) < 0 || (satir.alacak || 0) < 0) {
      return { valid: false, error: 'Borç ve alacak negatif olamaz' };
    }

    if ((satir.borc || 0) > 0 && (satir.alacak || 0) > 0) {
      return { valid: false, error: 'Aynı satırda hem borç hem alacak olamaz' };
    }

    if ((satir.borc || 0) === 0 && (satir.alacak || 0) === 0) {
      return { valid: false, error: 'Borç veya alacak sıfırdan büyük olmalı' };
    }
  }

  return { valid: true };
}

// ===== MAIN FUNCTIONS =====

/**
 * Yevmiye fişi oluştur
 */
export async function createJournalEntry(
  request: CreateJournalRequest
): Promise<CreateJournalResponse> {
  try {
    console.log('[Accounting] Creating journal entry:', {
      firma_id: request.firma_id,
      donem_id: request.donem_id,
      tarih: request.tarih,
      satirlar_count: request.satirlar.length,
    });

    // ===== 1. VALIDATION =====
    
    // Satır validasyonu
    const linesValidation = validateLines(request.satirlar);
    if (!linesValidation.valid) {
      return {
        success: false,
        error: linesValidation.error,
      };
    }

    // Borç-Alacak dengesi
    const balanceValidation = validateBalance(request.satirlar);
    if (!balanceValidation.valid) {
      return {
        success: false,
        error: balanceValidation.error,
      };
    }

    // ===== 2. FİŞ NO OLUŞTUR =====
    const fis_no = await generateFisNo(request.firma_id, request.donem_id, request.tarih);

    // ===== 3. FİŞ BAŞLIĞI OLUŞTUR =====
    const fisBasligi: JournalEntry = {
      fis_no,
      fis_tarihi: request.tarih,
      firma_id: request.firma_id,
      donem_id: request.donem_id,
      aciklama: request.aciklama,
      kaynak_belge_tipi: request.kaynak_belge_tipi,
      kaynak_belge_no: request.kaynak_belge_no,
      durum: 'onaylandi', // Otomatik oluşturulanlar direkt onaylı
    };

    const { data: insertedFis, error: fisError } = await supabase
      .from('yevmiye_fisleri')
      .insert(fisBasligi)
      .select('id, fis_no')
      .single();

    if (fisError || !insertedFis) {
      console.error('[Accounting] Fiş insert error:', fisError);
      return {
        success: false,
        error: `Fiş oluşturulamadı: ${fisError?.message || 'Bilinmeyen hata'}`,
        details: fisError,
      };
    }

    console.log('[Accounting] Fiş created:', insertedFis.fis_no);

    // ===== 4. FİŞ SATIRLARINI OLUŞTUR =====
    const satirlarToInsert: Partial<JournalLine>[] = request.satirlar.map((satir, index) => ({
      fis_id: insertedFis.id,
      satir_no: index + 1,
      hesap_kodu: satir.hesap_kodu,
      hesap_adi: satir.hesap_adi,
      borc: satir.borc || 0,
      alacak: satir.alacak || 0,
      aciklama: satir.aciklama || '',
      doviz_kodu: 'IQD',
    }));

    const { error: satirlarError } = await supabase
      .from('yevmiye_satirlari')
      .insert(satirlarToInsert);

    if (satirlarError) {
      console.error('[Accounting] Satırlar insert error:', satirlarError);
      
      // Rollback: Fiş başlığını sil
      await supabase.from('yevmiye_fisleri').delete().eq('id', insertedFis.id);

      return {
        success: false,
        error: `Satırlar oluşturulamadı: ${satirlarError.message}`,
        details: satirlarError,
      };
    }

    console.log('[Accounting] Satırlar created:', satirlarToInsert.length);

    // ===== 5. BAŞARILI RESPONSE =====
    return {
      success: true,
      fis_no: insertedFis.fis_no,
      fis_id: insertedFis.id,
    };

  } catch (error: any) {
    console.error('[Accounting] Unexpected error:', error);
    return {
      success: false,
      error: error.message || 'Beklenmeyen hata',
      details: error,
    };
  }
}

/**
 * Satış faturası için otomatik muhasebe fişi
 */
export async function createSalesJournal(params: {
  firma_id: string;
  donem_id: string;
  fatura_no: string;
  tarih: string;
  musteri_adi: string;
  tutar: number;
}): Promise<CreateJournalResponse> {
  return createJournalEntry({
    firma_id: params.firma_id,
    donem_id: params.donem_id,
    tarih: params.tarih,
    aciklama: `${params.musteri_adi} - Satış Faturası`,
    kaynak_belge_tipi: 'SALES_INVOICE',
    kaynak_belge_no: params.fatura_no,
    satirlar: [
      {
        hesap_kodu: '100',
        hesap_adi: 'KASA',
        borc: params.tutar,
        alacak: 0,
        aciklama: `${params.musteri_adi} - Tahsilat`,
      },
      {
        hesap_kodu: '600',
        hesap_adi: 'YURTİÇİ SATIŞLAR',
        borc: 0,
        alacak: params.tutar,
        aciklama: `${params.musteri_adi} - Satış`,
      },
    ],
  });
}

/**
 * Alış faturası için otomatik muhasebe fişi
 */
export async function createPurchaseJournal(params: {
  firma_id: string;
  donem_id: string;
  fatura_no: string;
  tarih: string;
  tedarikci_adi: string;
  tutar: number;
}): Promise<CreateJournalResponse> {
  return createJournalEntry({
    firma_id: params.firma_id,
    donem_id: params.donem_id,
    tarih: params.tarih,
    aciklama: `${params.tedarikci_adi} - Alış Faturası`,
    kaynak_belge_tipi: 'PURCHASE_INVOICE',
    kaynak_belge_no: params.fatura_no,
    satirlar: [
      {
        hesap_kodu: '153',
        hesap_adi: 'TİCARİ MALLAR',
        borc: params.tutar,
        alacak: 0,
        aciklama: `${params.tedarikci_adi} - Mal Alımı`,
      },
      {
        hesap_kodu: '100',
        hesap_adi: 'KASA',
        borc: 0,
        alacak: params.tutar,
        aciklama: `${params.tedarikci_adi} - Ödeme`,
      },
    ],
  });
}

/**
 * Tahsilat fişi
 */
export async function createReceiptJournal(params: {
  firma_id: string;
  donem_id: string;
  belge_no: string;
  tarih: string;
  musteri_adi: string;
  tutar: number;
  odeme_tipi: 'nakit' | 'banka' | 'kredi_karti';
}): Promise<CreateJournalResponse> {
  let hesapKodu = '100';
  let hesapAdi = 'KASA';

  if (params.odeme_tipi === 'banka') {
    hesapKodu = '102';
    hesapAdi = 'BANKALAR';
  } else if (params.odeme_tipi === 'kredi_karti') {
    hesapKodu = '108';
    hesapAdi = 'KREDİ KARTI ALACAKLARI';
  }

  return createJournalEntry({
    firma_id: params.firma_id,
    donem_id: params.donem_id,
    tarih: params.tarih,
    aciklama: `${params.musteri_adi} - Tahsilat`,
    kaynak_belge_tipi: 'RECEIPT',
    kaynak_belge_no: params.belge_no,
    satirlar: [
      {
        hesap_kodu: hesapKodu,
        hesap_adi: hesapAdi,
        borc: params.tutar,
        alacak: 0,
        aciklama: `${params.musteri_adi} - Tahsilat (${params.odeme_tipi})`,
      },
      {
        hesap_kodu: '120',
        hesap_adi: 'ALICILAR',
        borc: 0,
        alacak: params.tutar,
        aciklama: `${params.musteri_adi} - Alacak Kapatma`,
      },
    ],
  });
}

/**
 * Ödeme fişi
 */
export async function createPaymentJournal(params: {
  firma_id: string;
  donem_id: string;
  belge_no: string;
  tarih: string;
  tedarikci_adi: string;
  tutar: number;
  odeme_tipi: 'nakit' | 'banka' | 'cek';
}): Promise<CreateJournalResponse> {
  let hesapKodu = '100';
  let hesapAdi = 'KASA';

  if (params.odeme_tipi === 'banka') {
    hesapKodu = '102';
    hesapAdi = 'BANKALAR';
  } else if (params.odeme_tipi === 'cek') {
    hesapKodu = '121';
    hesapAdi = 'VERİLEN ÇEK VE SENETLER';
  }

  return createJournalEntry({
    firma_id: params.firma_id,
    donem_id: params.donem_id,
    tarih: params.tarih,
    aciklama: `${params.tedarikci_adi} - Ödeme`,
    kaynak_belge_tipi: 'PAYMENT',
    kaynak_belge_no: params.belge_no,
    satirlar: [
      {
        hesap_kodu: '320',
        hesap_adi: 'SATICILAR',
        borc: params.tutar,
        alacak: 0,
        aciklama: `${params.tedarikci_adi} - Borç Kapatma`,
      },
      {
        hesap_kodu: hesapKodu,
        hesap_adi: hesapAdi,
        borc: 0,
        alacak: params.tutar,
        aciklama: `${params.tedarikci_adi} - Ödeme (${params.odeme_tipi})`,
      },
    ],
  });
}

/**
 * Fiş listele
 */
export async function listJournalEntries(params: {
  firma_id: string;
  donem_id: string;
  baslangic_tarihi?: string;
  bitis_tarihi?: string;
  limit?: number;
}) {
  try {
    let query = supabase
      .from('yevmiye_fisleri')
      .select(`
        *,
        satirlar:yevmiye_satirlari(*)
      `)
      .eq('firma_id', params.firma_id)
      .eq('donem_id', params.donem_id)
      .order('fis_tarihi', { ascending: false })
      .order('fis_no', { ascending: false });

    if (params.baslangic_tarihi) {
      query = query.gte('fis_tarihi', params.baslangic_tarihi);
    }

    if (params.bitis_tarihi) {
      query = query.lte('fis_tarihi', params.bitis_tarihi);
    }

    if (params.limit) {
      query = query.limit(params.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Accounting] List error:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data,
      count: data?.length || 0,
    };
  } catch (error: any) {
    console.error('[Accounting] List unexpected error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fiş sil
 */
export async function deleteJournalEntry(fis_id: string) {
  try {
    // Önce satırları sil
    const { error: satirlarError } = await supabase
      .from('yevmiye_satirlari')
      .delete()
      .eq('fis_id', fis_id);

    if (satirlarError) {
      console.error('[Accounting] Delete satirlar error:', satirlarError);
      return { success: false, error: satirlarError.message };
    }

    // Sonra başlığı sil
    const { error: fisError } = await supabase
      .from('yevmiye_fisleri')
      .delete()
      .eq('id', fis_id);

    if (fisError) {
      console.error('[Accounting] Delete fis error:', fisError);
      return { success: false, error: fisError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Accounting] Delete unexpected error:', error);
    return { success: false, error: error.message };
  }
}

