/**
 * ExRetailOS - Mizan (Trial Balance) Service
 * 
 * Muhasebe hesaplarının borç-alacak dengelerini hesaplar
 * Logo muhasebe formatında çalışır
 * 
 * @created 2024-12-18
 */

import { projectId, publicAnonKey } from '../utils/supabase/info';
import { supabase } from '../utils/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ===== TYPES =====

export interface MizanLine {
  hesap_kodu: string;
  hesap_adi: string;
  hesap_tipi: 'AKTIF' | 'PASIF' | 'GELIR' | 'GIDER' | 'SERMAYE';
  seviye: number; // 1=Ana, 2=Alt, 3=Detay

  // Önceki dönem
  onceki_donem_borc: number;
  onceki_donem_alacak: number;
  onceki_donem_bakiye: number; // Pozitif=Borç, Negatif=Alacak

  // Bu dönem hareketleri
  donem_borc: number;
  donem_alacak: number;

  // Toplam (Önceki + Dönem)
  toplam_borc: number;
  toplam_alacak: number;

  // Bakiye
  bakiye_borc: number;
  bakiye_alacak: number;
  bakiye: number; // Net bakiye (Borç - Alacak)
}

export interface MizanSummary {
  toplam_borc: number;
  toplam_alacak: number;
  fark: number;
  dengeli: boolean; // Borç = Alacak ?
  hesap_sayisi: number;
}

export interface MizanParams {
  firma_id: string;
  donem_id: string;
  baslangic_tarihi?: string; // YYYY-MM-DD
  bitis_tarihi?: string;     // YYYY-MM-DD
  hesap_kodu_filtre?: string; // Örn: "100" sadece 100'le başlayanlar
  detay_seviye?: 1 | 2 | 3;  // 1=Ana hesaplar, 2=Alt hesaplar, 3=Tümü
}

// ===== HESAP PLANI (Default Chart of Accounts) =====

export const STANDARD_CHART_OF_ACCOUNTS = [
  // AKTİF (Asset Accounts)
  { hesap_kodu: '100', hesap_adi: 'KASA', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '101', hesap_adi: 'ALINAN ÇEKLER', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '102', hesap_adi: 'BANKALAR', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '108', hesap_adi: 'KREDİ KARTI ALACAKLARI', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '120', hesap_adi: 'ALICILAR (MÜŞTERİLER)', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '121', hesap_adi: 'VERİLEN ÇEK VE SENETLER', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '153', hesap_adi: 'TİCARİ MALLAR', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '180', hesap_adi: 'GELECEK AYLARA AİT GİDERLER', tip: 'AKTIF', seviye: 1, borc_alacak: 'BORC' },

  // PASİF (Liability Accounts)
  { hesap_kodu: '300', hesap_adi: 'BANKA KREDİLERİ', tip: 'PASIF', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '320', hesap_adi: 'SATICILAR', tip: 'PASIF', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '360', hesap_adi: 'ÖDENECEK VERGİLER', tip: 'PASIF', seviye: 1, borc_alacak: 'ALACAK' },

  // SERMAYE (Equity Accounts)
  { hesap_kodu: '500', hesap_adi: 'SERMAYE', tip: 'SERMAYE', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '570', hesap_adi: 'GEÇMİŞ YIL KARLARI', tip: 'SERMAYE', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '580', hesap_adi: 'GEÇMİŞ YIL ZARARLARI', tip: 'SERMAYE', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '590', hesap_adi: 'DÖNEM NET KARI', tip: 'SERMAYE', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '591', hesap_adi: 'DÖNEM NET ZARARI', tip: 'SERMAYE', seviye: 1, borc_alacak: 'BORC' },

  // GELİR (Revenue Accounts)
  { hesap_kodu: '600', hesap_adi: 'YURTİÇİ SATIŞLAR', tip: 'GELIR', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '601', hesap_adi: 'YURTDIŞI SATIŞLAR', tip: 'GELIR', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '602', hesap_adi: 'HİZMET GELİRLERİ', tip: 'GELIR', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '610', hesap_adi: 'SATIŞ İSKONTOLARI (-)', tip: 'GELIR', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '611', hesap_adi: 'SATIŞ İADELERİ (-)', tip: 'GELIR', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '640', hesap_adi: 'FAİZ GELİRLERİ', tip: 'GELIR', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '642', hesap_adi: 'KUR FARKI GELİRLERİ', tip: 'GELIR', seviye: 1, borc_alacak: 'ALACAK' },

  // GİDER (Expense Accounts)
  { hesap_kodu: '710', hesap_adi: 'TİCARİ MALLAR ALIŞ BEDELİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '720', hesap_adi: 'ALIŞ İSKONTOLARI (-)', tip: 'GIDER', seviye: 1, borc_alacak: 'ALACAK' },
  { hesap_kodu: '730', hesap_adi: 'GENEL YÖNETİM GİDERLERİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '740', hesap_adi: 'PAZARLAMA GİDERLERİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '750', hesap_adi: 'PERSONEL GİDERLERİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '760', hesap_adi: 'KİRA GİDERLERİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '770', hesap_adi: 'ELEKTRİK SU GAZ GİDERLERİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '780', hesap_adi: 'FAİZ GİDERLERİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
  { hesap_kodu: '781', hesap_adi: 'KUR FARKI GİDERLERİ', tip: 'GIDER', seviye: 1, borc_alacak: 'BORC' },
];

// ===== SERVICE CLASS =====

export class MizanService {
  /**
   * Mizan raporu oluştur
   */
  static async generateMizan(params: MizanParams): Promise<{
    lines: MizanLine[];
    summary: MizanSummary;
  }> {
    console.log('[Mizan] Generating trial balance:', params);

    try {
      // 1. Hesap planını getir
      const chartOfAccounts = await this.getChartOfAccounts(params.firma_id);
      console.log('[Mizan] Chart of accounts loaded:', chartOfAccounts.length);

      // 2. Her hesap için bakiye hesapla
      const mizanLines: MizanLine[] = [];

      for (const hesap of chartOfAccounts) {
        // Seviye filtresi
        if (params.detay_seviye && hesap.seviye > params.detay_seviye) {
          continue;
        }

        // Hesap kodu filtresi
        if (params.hesap_kodu_filtre && !hesap.hesap_kodu.startsWith(params.hesap_kodu_filtre)) {
          continue;
        }

        // Önceki dönem bakiyesi
        const oncekiDonem = await this.getPreviousPeriodBalance(
          hesap.hesap_kodu,
          params.firma_id,
          params.donem_id
        );

        // Bu dönem hareketleri
        const donemHareketleri = await this.getPeriodMovements(
          hesap.hesap_kodu,
          params.firma_id,
          params.donem_id,
          params.baslangic_tarihi,
          params.bitis_tarihi
        );

        // Toplamlar
        const toplam_borc = oncekiDonem.borc + donemHareketleri.borc;
        const toplam_alacak = oncekiDonem.alacak + donemHareketleri.alacak;
        const bakiye = toplam_borc - toplam_alacak;

        // Sadece hareketli hesapları ekle (0 olanları gösterme)
        if (toplam_borc > 0 || toplam_alacak > 0) {
          mizanLines.push({
            hesap_kodu: hesap.hesap_kodu,
            hesap_adi: hesap.hesap_adi,
            hesap_tipi: hesap.tip as any,
            seviye: hesap.seviye,

            onceki_donem_borc: oncekiDonem.borc,
            onceki_donem_alacak: oncekiDonem.alacak,
            onceki_donem_bakiye: oncekiDonem.borc - oncekiDonem.alacak,

            donem_borc: donemHareketleri.borc,
            donem_alacak: donemHareketleri.alacak,

            toplam_borc,
            toplam_alacak,

            bakiye_borc: bakiye > 0 ? bakiye : 0,
            bakiye_alacak: bakiye < 0 ? -bakiye : 0,
            bakiye,
          });
        }
      }

      // 3. Özet hesapla
      const summary = this.calculateSummary(mizanLines);

      console.log('[Mizan] Generated:', {
        lines: mizanLines.length,
        summary
      });

      return {
        lines: mizanLines,
        summary
      };

    } catch (error: any) {
      console.error('[Mizan] Error generating:', error);
      throw error;
    }
  }

  /**
   * Hesap planını getir (firma bazlı)
   */
  private static async getChartOfAccounts(firma_id: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('firma_id', firma_id)
        .order('hesap_kodu', { ascending: true });

      if (error || !data || data.length === 0) {
        console.warn('[Mizan] Chart of accounts not found or error, using default:', error);
        return STANDARD_CHART_OF_ACCOUNTS.map(h => ({
          ...h,
          firma_id,
          seviye: h.seviye || 1
        }));
      }

      return data;
    } catch (error) {
      console.error('[Mizan] Error loading chart of accounts:', error);
      return STANDARD_CHART_OF_ACCOUNTS.map(h => ({
        ...h,
        firma_id,
        seviye: h.seviye || 1
      }));
    }
  }

  /**
   * Önceki dönem bakiyesi (devir)
   */
  private static async getPreviousPeriodBalance(
    hesap_kodu: string,
    firma_id: string,
    donem_id: string
  ): Promise<{ borc: number; alacak: number }> {
    try {
      // 1. Önceki dönem bulunuyor mu?
      // NOT: Gerçek veritabanında 'fiscal_periods' tablosundan önceki dönem bulunur
      // Şimdilik açılış fişini (Opening Balance) sorgulayalım

      const { data, error } = await supabase
        .from('journal_entries')
        .select(`
            id,
            lines:journal_lines(hesap_kodu, borc, alacak)
        `)
        .eq('firma_id', firma_id)
        .eq('donem_id', donem_id)
        .eq('fis_tipi', 'Acilis'); // Açılış fişi

      if (error) throw error;

      let totalBorc = 0;
      let totalAlacak = 0;

      data?.forEach((entry: any) => {
        const lines = entry.lines || []; // Supabase joins return array
        lines.forEach((line: any) => {
          if (line.hesap_kodu === hesap_kodu || line.hesap_kodu.startsWith(hesap_kodu + '.')) {
            totalBorc += line.borc || 0;
            totalAlacak += line.alacak || 0;
          }
        });
      });

      return { borc: totalBorc, alacak: totalAlacak };
    } catch (error) {
      console.error('[Mizan] Error loading previous period:', error);
      return { borc: 0, alacak: 0 };
    }
  }

  /**
   * Dönem hareketleri (yevmiye fişlerinden)
   */
  private static async getPeriodMovements(
    hesap_kodu: string,
    firma_id: string,
    donem_id: string,
    baslangic_tarihi?: string,
    bitis_tarihi?: string
  ): Promise<{ borc: number; alacak: number }> {
    try {
      let query = supabase
        .from('journal_entries')
        .select(`
            id,
            fis_tarihi,
            lines:journal_lines!inner(hesap_kodu, borc, alacak)
        `)
        .eq('firma_id', firma_id)
        .eq('donem_id', donem_id)
        .neq('fis_tipi', 'Acilis'); // Açılış fişi hariç, o önceki döneme dahil edildi

      if (baslangic_tarihi) {
        query = query.gte('fis_tarihi', baslangic_tarihi);
      }
      if (bitis_tarihi) {
        query = query.lte('fis_tarihi', bitis_tarihi);
      }

      const { data, error } = await query;

      if (error) throw error;

      let totalBorc = 0;
      let totalAlacak = 0;

      const entries = data || [];

      entries.forEach((entry: any) => {
        const lines = entry.lines || [];
        lines.forEach((satir: any) => {
          // Client-side filtering because simple 'like' might match '1000' for '100'
          if (satir.hesap_kodu === hesap_kodu || satir.hesap_kodu.startsWith(hesap_kodu + '.')) {
            totalBorc += satir.borc || 0;
            totalAlacak += satir.alacak || 0;
          }
        });
      });

      return {
        borc: totalBorc,
        alacak: totalAlacak
      };

    } catch (error) {
      console.error('[Mizan] Error loading period movements:', error);
      return { borc: 0, alacak: 0 };
    }
  }

  /**
   * Mizan özeti hesapla
   */
  private static calculateSummary(lines: MizanLine[]): MizanSummary {
    const toplam_borc = lines.reduce((sum, line) => sum + line.toplam_borc, 0);
    const toplam_alacak = lines.reduce((sum, line) => sum + line.toplam_alacak, 0);
    const fark = Math.abs(toplam_borc - toplam_alacak);

    return {
      toplam_borc,
      toplam_alacak,
      fark,
      dengeli: fark < 0.01, // 1 kuruş tolerans
      hesap_sayisi: lines.length
    };
  }

  /**
   * Mizan PDF export
   */
  static exportToPDF(lines: MizanLine[], summary: MizanSummary): void {
    try {
      const doc = new jsPDF();

      // Title
      doc.setFontSize(18);
      doc.text("Mizan Raporu (Trial Balance)", 14, 22);
      doc.setFontSize(11);
      doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 14, 30);

      // Table
      const tableColumn = ["Hesap Kodu", "Hesap Adı", "Borç", "Alacak", "Bakiye"];
      const tableRows: any[] = [];

      lines.forEach(line => {
        const row = [
          line.hesap_kodu,
          line.hesap_adi,
          formatMoney(line.toplam_borc),
          formatMoney(line.toplam_alacak),
          formatMoney(line.bakiye) + (line.bakiye > 0 ? ' (B)' : line.bakiye < 0 ? ' (A)' : '')
        ];
        tableRows.push(row);
      });

      // Summary Row
      tableRows.push([
        "TOPLAM",
        "",
        formatMoney(summary.toplam_borc),
        formatMoney(summary.toplam_alacak),
        formatMoney(summary.fark)
      ]);

      (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' }
      });

      doc.save("mizan_raporu.pdf");
      console.log('PDF exported successfully');
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('PDF oluşturulurken bir hata oluştu.');
    }
  }

  /**
   * Mizan Excel export
   */
  static exportToExcel(lines: MizanLine[], summary: MizanSummary): void {
    try {
      const wsData = [
        ["Hesap Kodu", "Hesap Adı", "Borç", "Alacak", "Bakiye", "Bakiye Tipi"],
        ...lines.map(line => [
          line.hesap_kodu,
          line.hesap_adi,
          line.toplam_borc,
          line.toplam_alacak,
          Math.abs(line.bakiye),
          line.bakiye > 0 ? 'Borç' : line.bakiye < 0 ? 'Alacak' : '-'
        ]),
        ["", "TOPLAM", summary.toplam_borc, summary.toplam_alacak, summary.fark, summary.dengeli ? 'Dengeli' : 'Dengesiz']
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Column widths
      ws['!cols'] = [
        { wch: 15 }, // Kodu
        { wch: 40 }, // Adı
        { wch: 15 }, // Borç
        { wch: 15 }, // Alacak
        { wch: 15 }, // Bakiye
        { wch: 10 }, // Tip
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Mizan");

      XLSX.writeFile(wb, "mizan_raporu.xlsx");
      console.log('Excel exported successfully');
    } catch (error) {
      console.error('Excel export failed:', error);
      alert('Excel oluşturulurken bir hata oluştu.');
    }
  }
}

/**
 * Helper - Format money (IQD)
 */
export function formatMoney(amount: number): string {
  let formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  // Eğer ondalık kısım sıfırsa (örn: ,00), virgül ve sıfırları kaldır
  if (formatted.endsWith(',00') || formatted.endsWith(',0')) {
    formatted = formatted.replace(/[,]0+$/, '');
  }

  return formatted;
}

/**
 * Helper - Bakiye type (Borç/Alacak)
 */
export function getBakiyeType(bakiye: number): 'B' | 'A' | '-' {
  if (bakiye > 0.01) return 'B'; // Borç
  if (bakiye < -0.01) return 'A'; // Alacak
  return '-'; // Sıfır
}
