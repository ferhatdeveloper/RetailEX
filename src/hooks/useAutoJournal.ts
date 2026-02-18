/**
 * ExRetailOS - Auto Journal Hook
 * 
 * Satış, alış, tahsilat, ödeme işlemleri için otomatik muhasebe fişi oluşturur.
 * JournalEntryGenerator servisi ile entegre çalışır.
 * 
 * @created 2024-12-18
 */

import { useCallback } from 'react';
import { useFirmaDonem } from '../contexts/FirmaDonemContext';
import { JournalEntryGenerator, type JournalEntry, type JournalLine } from '../services/journalEntryGenerator';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { logger } from '../utils/logger';

export interface AutoJournalResult {
  success: boolean;
  journalEntry?: JournalEntry;
  error?: string;
}

export interface JournalResult {
  success: boolean;
  fis_no?: string;
  fis_id?: number;
  satirlar?: JournalLine[];
  error?: string;
}

/**
 * Backend'e muhasebe fişi gönder
 */
async function sendJournalToBackend(params: {
  firma_id: string;
  donem_id: string;
  tarih: Date;
  aciklama: string;
  kaynak_belge_tipi: string;
  kaynak_belge_no: string;
  satirlar: JournalLine[];
}): Promise<JournalResult> {
  try {
    // Backend'e POST request
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/journal-entries`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          firma_id: params.firma_id,
          donem_id: params.donem_id,
          fis_tarihi: params.tarih.toISOString().split('T')[0],
          aciklama: params.aciklama,
          kaynak_belge_tipi: params.kaynak_belge_tipi,
          kaynak_belge_no: params.kaynak_belge_no,
          durum: 'onaylandi', // Otomatik fişler direkt onaylı
          lines: params.satirlar.map((satir, index) => ({
            satir_no: index + 1,
            hesap_kodu: satir.hesap_kodu,
            hesap_adi: satir.hesap_adi,
            borc: satir.borc,
            alacak: satir.alacak,
            aciklama: satir.aciklama,
            doviz_kodu: 'IQD',
          })),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[AutoJournal] Backend error:', data);
      return {
        success: false,
        error: data.error || 'Backend hatası',
      };
    }

    console.log('[AutoJournal] Backend response:', data);

    return {
      success: true,
      fis_no: data.entry?.fis_no || generateFisNo(params.tarih),
      fis_id: data.entry?.id,
      satirlar: params.satirlar,
    };
  } catch (error: any) {
    console.error('[AutoJournal] Network error:', error);
    return {
      success: false,
      error: `Bağlantı hatası: ${error.message}`,
    };
  }
}

/**
 * Fis No oluştur
 */
function generateFisNo(tarih: Date): string {
  const year = tarih.getFullYear();
  const month = String(tarih.getMonth() + 1).padStart(2, '0');
  const day = String(tarih.getDate()).padStart(2, '0');
  const hours = String(tarih.getHours()).padStart(2, '0');
  const minutes = String(tarih.getMinutes()).padStart(2, '0');
  const seconds = String(tarih.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Otomatik muhasebe fişi hook'u
 */
export const useAutoJournal = () => {
  const { selectedFirm, selectedPeriod } = useFirmaDonem();

  // Helper for backward compatibility
  const selectedFirma = selectedFirm ? { ...selectedFirm, id: (selectedFirm.logicalref || 0).toString() } : null;
  const selectedDonem = selectedPeriod ? { ...selectedPeriod, id: (selectedPeriod.logicalref || 0).toString() } : null;
  const isPeriodOpen = () => selectedPeriod?.active ?? false;

  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0`;

  /**
   * Muhasebe fişini backend'e kaydet
   */
  const saveJournalEntry = useCallback(async (entry: JournalEntry): Promise<boolean> => {
    try {
      const response = await fetch(`${baseUrl}/accounting/journal-entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          firma_id: entry.firma_id,
          donem_id: entry.donem_id,
          fis_tarihi: entry.fis_tarihi,
          aciklama: entry.aciklama,
          kaynak_belge_tipi: entry.kaynak_belge_tipi,
          kaynak_belge_no: entry.kaynak_belge_no,
          satirlar: entry.satirlar.map(satir => ({
            hesap_kodu: satir.hesap_kodu,
            hesap_adi: satir.hesap_adi,
            borc: satir.borc,
            alacak: satir.alacak,
            aciklama: satir.aciklama
          }))
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const error = data.error || 'Failed to save journal entry';
        logger.error('[AutoJournal] Backend error:', error);
        throw new Error(error);
      }

      logger.log('[AutoJournal] Journal entry saved successfully:', data.entry?.fis_no);
      return true;
    } catch (error: any) {
      logger.error('[AutoJournal] Failed to save journal entry:', error);
      return false;
    }
  }, [baseUrl]);

  /**
   * Satış faturası için otomatik fiş
   */
  const createSalesJournal = useCallback(async (params: {
    fatura_no: string;
    tarih: Date;
    musteri_adi: string;
    tutar: number;
    aciklama?: string;
  }): Promise<AutoJournalResult> => {
    try {
      // Firma/Dönem kontrolü
      if (!selectedFirma || !selectedDonem) {
        return {
          success: false,
          error: 'Firma ve dönem seçilmeli',
        };
      }

      // Dönem açık mı?
      if (!isPeriodOpen()) {
        return {
          success: false,
          error: 'Dönem kapalı. Muhasebe fişi oluşturulamaz.',
        };
      }

      // Muhasebe fişi oluştur
      const entry = JournalEntryGenerator.generateSalesInvoiceEntry({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        ...params,
      });

      // Backend'e kaydet
      const saved = await saveJournalEntry(entry);

      if (saved) {
        return {
          success: true,
          journalEntry: entry,
        };
      } else {
        return {
          success: false,
          error: 'Muhasebe fişi kaydedilemedi',
        };
      }
    } catch (error: any) {
      logger.error('[AutoJournal] Error creating sales journal:', error);
      return {
        success: false,
        error: error.message || 'Bilinmeyen hata',
      };
    }
  }, [selectedFirm, selectedPeriod, saveJournalEntry]);

  /**
   * Alış faturası için otomatik fiş
   */
  const createPurchaseJournal = useCallback(async (params: {
    fatura_no: string;
    tarih: Date;
    tedarikci_adi: string;
    tutar: number;
    aciklama?: string;
  }): Promise<AutoJournalResult> => {
    try {
      // Firma/Dönem kontrolü
      if (!selectedFirma || !selectedDonem) {
        return {
          success: false,
          error: 'Firma ve dönem seçilmeli',
        };
      }

      // Dönem açık mı?
      if (!isPeriodOpen()) {
        return {
          success: false,
          error: 'Dönem kapalı. Muhasebe fişi oluşturulamaz.',
        };
      }

      // Muhasebe fişi oluştur
      const entry = JournalEntryGenerator.generatePurchaseInvoiceEntry({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        ...params,
      });

      // Backend'e kaydet
      const saved = await saveJournalEntry(entry);

      if (saved) {
        return {
          success: true,
          journalEntry: entry,
        };
      } else {
        return {
          success: false,
          error: 'Muhasebe fişi kaydedilemedi',
        };
      }
    } catch (error: any) {
      logger.error('[AutoJournal] Error creating purchase journal:', error);
      return {
        success: false,
        error: error.message || 'Bilinmeyen hata',
      };
    }
  }, [selectedFirm, selectedPeriod, saveJournalEntry]);

  /**
   * Tahsilat için otomatik fiş
   */
  const createReceiptJournal = useCallback(async (params: {
    belge_no: string;
    tarih: Date;
    musteri_adi: string;
    tutar: number;
    odeme_yontemi: 'NAKIT' | 'KART' | 'HAVALE';
    aciklama?: string;
  }): Promise<AutoJournalResult> => {
    try {
      // Firma/Dönem kontrolü
      if (!selectedFirma || !selectedDonem) {
        return {
          success: false,
          error: 'Firma ve dönem seçilmeli',
        };
      }

      // Dönem açık mı?
      if (!isPeriodOpen()) {
        return {
          success: false,
          error: 'Dönem kapalı. Muhasebe fişi oluşturulamaz.',
        };
      }

      // Muhasebe fişi oluştur
      const entry = JournalEntryGenerator.generateReceiptEntry({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        ...params,
      });

      // Backend'e kaydet
      const saved = await saveJournalEntry(entry);

      if (saved) {
        return {
          success: true,
          journalEntry: entry,
        };
      } else {
        return {
          success: false,
          error: 'Muhasebe fişi kaydedilemedi',
        };
      }
    } catch (error: any) {
      logger.error('[AutoJournal] Error creating receipt journal:', error);
      return {
        success: false,
        error: error.message || 'Bilinmeyen hata',
      };
    }
  }, [selectedFirm, selectedPeriod, saveJournalEntry]);

  /**
   * Ödeme için otomatik fiş
   */
  const createPaymentJournal = useCallback(async (params: {
    belge_no: string;
    tarih: Date;
    tedarikci_adi: string;
    tutar: number;
    odeme_yontemi: 'NAKIT' | 'KART' | 'HAVALE';
    aciklama?: string;
  }): Promise<AutoJournalResult> => {
    try {
      // Firma/Dönem kontrolü
      if (!selectedFirma || !selectedDonem) {
        return {
          success: false,
          error: 'Firma ve dönem seçilmeli',
        };
      }

      // Dönem açık mı?
      if (!isPeriodOpen()) {
        return {
          success: false,
          error: 'Dönem kapalı. Muhasebe fişi oluşturulamaz.',
        };
      }

      // Muhasebe fişi oluştur
      const entry = JournalEntryGenerator.generatePaymentEntry({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        ...params,
      });

      // Backend'e kaydet
      const saved = await saveJournalEntry(entry);

      if (saved) {
        return {
          success: true,
          journalEntry: entry,
        };
      } else {
        return {
          success: false,
          error: 'Muhasebe fişi kaydedilemedi',
        };
      }
    } catch (error: any) {
      logger.error('[AutoJournal] Error creating payment journal:', error);
      return {
        success: false,
        error: error.message || 'Bilinmeyen hata',
      };
    }
  }, [selectedFirm, selectedPeriod, saveJournalEntry]);

  /**
   * Transfer için otomatik fiş
   */
  const createTransferJournal = useCallback(async (params: {
    belge_no: string;
    tarih: Date;
    kaynak_depo: string;
    hedef_depo: string;
    tutar: number;
    aciklama?: string;
  }): Promise<AutoJournalResult> => {
    try {
      // Firma/Dönem kontrolü
      if (!selectedFirma || !selectedDonem) {
        return {
          success: false,
          error: 'Firma ve dönem seçilmeli',
        };
      }

      // Dönem açık mı?
      if (!isPeriodOpen()) {
        return {
          success: false,
          error: 'Dönem kapalı. Muhasebe fişi oluşturulamaz.',
        };
      }

      // Muhasebe fişi oluştur
      const entry = JournalEntryGenerator.generateTransferEntry({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        ...params,
      });

      // Backend'e kaydet
      const saved = await saveJournalEntry(entry);

      if (saved) {
        return {
          success: true,
          journalEntry: entry,
        };
      } else {
        return {
          success: false,
          error: 'Muhasebe fişi kaydedilemedi',
        };
      }
    } catch (error: any) {
      logger.error('[AutoJournal] Error creating transfer journal:', error);
      return {
        success: false,
        error: error.message || 'Bilinmeyen hata',
      };
    }
  }, [selectedFirm, selectedPeriod, saveJournalEntry]);

  /**
   * Genel amaçlı muhasebe fişi oluştur
   */
  const createCustomJournal = useCallback(async (
    entry: JournalEntry
  ): Promise<AutoJournalResult> => {
    try {
      // Firma/Dönem kontrolü
      if (!selectedFirma || !selectedDonem) {
        return {
          success: false,
          error: 'Firma ve dönem seçilmeli',
        };
      }

      // Dönem açık mı?
      if (!isPeriodOpen()) {
        return {
          success: false,
          error: 'Dönem kapalı. Muhasebe fişi oluşturulamaz.',
        };
      }

      // Backend'e kaydet
      const saved = await saveJournalEntry(entry);

      if (saved) {
        return {
          success: true,
          journalEntry: entry,
        };
      } else {
        return {
          success: false,
          error: 'Muhasebe fişi kaydedilemedi',
        };
      }
    } catch (error: any) {
      logger.error('[AutoJournal] Error creating custom journal:', error);
      return {
        success: false,
        error: error.message || 'Bilinmeyen hata',
      };
    }
  }, [selectedFirm, selectedPeriod, saveJournalEntry]);

  return {
    // Status
    isReady: !!selectedFirm && !!selectedPeriod && isPeriodOpen(),
    firma: selectedFirma,
    donem: selectedDonem,

    // Methods
    createSalesJournal,
    createPurchaseJournal,
    createReceiptJournal,
    createPaymentJournal,
    createTransferJournal,
    createCustomJournal,
  };
};

/**
 * Helper - Sonuç mesajını formatla
 */
export const formatJournalResult = (result: AutoJournalResult): string => {
  if (result.success && result.journalEntry) {
    return `✅ Muhasebe fişi oluşturuldu: ${result.journalEntry.fis_no}`;
  }
  return `❌ ${result.error || 'Muhasebe fişi oluşturulamadı'}`;
};
