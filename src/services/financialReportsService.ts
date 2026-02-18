/**
 * ExRetailOS - Financial Reports Service
 * 
 * Gelir Tablosu (Income Statement) ve Bilanço (Balance Sheet)
 * Logo muhasebe formatında çalışır
 * 
 * @created 2024-12-18
 */

import { projectId, publicAnonKey } from '../utils/supabase/info';

// ===== TYPES =====

export interface IncomeStatementLine {
  hesap_kodu: string;
  hesap_adi: string;
  tutar: number;
  yuzde?: number; // Satışlara göre %
  seviye: number; // 1=Ana grup, 2=Alt grup, 3=Detay
  grup: 'SATIS' | 'MALIYET' | 'GIDER' | 'GELIR' | 'SONUC';
}

export interface IncomeStatementData {
  // SATIŞLAR
  brut_satislar: number;
  satis_iadeleri: number;
  satis_iskontolari: number;
  net_satislar: number;
  
  // MALİYETLER
  satilan_mal_maliyeti: number;
  brut_kar: number;
  brut_kar_yuzdesi: number;
  
  // GİDERLER
  genel_yonetim_giderleri: number;
  pazarlama_giderleri: number;
  personel_giderleri: number;
  kira_giderleri: number;
  diger_giderler: number;
  toplam_giderler: number;
  
  // DİĞER GELİR/GİDERLER
  faiz_gelirleri: number;
  faiz_giderleri: number;
  kur_farki_gelirleri: number;
  kur_farki_giderleri: number;
  diger_gelirler: number;
  
  // NET SONUÇ
  donem_net_kari: number;
  donem_net_kari_yuzdesi: number;
  
  // Detaylı satırlar
  lines: IncomeStatementLine[];
}

export interface BalanceSheetLine {
  hesap_kodu: string;
  hesap_adi: string;
  tutar: number;
  yuzde?: number; // Toplam aktif/pasife göre %
  seviye: number;
  kategori: 'AKTIF' | 'PASIF';
  grup: string;
}

export interface BalanceSheetData {
  // AKTİF (Varlıklar)
  donen_varliklar: {
    kasa: number;
    bankalar: number;
    alicilar: number;
    stoklar: number;
    diger: number;
    toplam: number;
  };
  
  duran_varliklar: {
    demirbaslar: number;
    tasitlar: number;
    binalar: number;
    diger: number;
    toplam: number;
  };
  
  toplam_aktif: number;
  
  // PASİF (Kaynaklar)
  kisa_vadeli_borclar: {
    banka_kredileri: number;
    saticilar: number;
    odenecek_vergiler: number;
    personel_borclari: number;
    diger: number;
    toplam: number;
  };
  
  uzun_vadeli_borclar: {
    banka_kredileri: number;
    diger: number;
    toplam: number;
  };
  
  ozkaynaklar: {
    sermaye: number;
    gecmis_yil_karlari: number;
    donem_net_kari: number;
    toplam: number;
  };
  
  toplam_pasif: number;
  
  // Dengeli mi?
  dengeli: boolean;
  fark: number;
  
  // Detaylı satırlar
  lines: BalanceSheetLine[];
}

export interface FinancialReportsParams {
  firma_id: string;
  donem_id: string;
  baslangic_tarihi?: string;
  bitis_tarihi?: string;
}

// ===== HESAP GRUPLARI =====

const GELIR_HESAPLARI = {
  SATISLAR: ['600', '601', '602'],
  SATIS_IADELERI: ['610', '611'],
  FAIZ_GELIRLERI: ['640', '641'],
  KUR_FARKI_GELIRLERI: ['642'],
  DIGER_GELIRLER: ['649'],
};

const GIDER_HESAPLARI = {
  MAL_ALISI: ['710'],
  ALIS_ISKONTOLARI: ['720'], // İskonto (-) gider değil, maliyetten düşer
  GENEL_YONETIM: ['730', '731', '732'],
  PAZARLAMA: ['740', '741', '742'],
  PERSONEL: ['750', '751', '752', '753', '754'],
  KIRA: ['760'],
  ELEKTRIK_SU: ['770'],
  FAIZ_GIDERLERI: ['780'],
  KUR_FARKI_GIDERLERI: ['781'],
  DIGER_GIDERLER: ['789'],
};

const AKTIF_HESAPLARI = {
  KASA: ['100'],
  BANKALAR: ['102'],
  ALICILAR: ['120', '121'],
  STOKLAR: ['153', '154'],
  DONEN_DIGER: ['180'],
  DEMIRBASLAR: ['253', '254'],
  TASITLAR: ['255'],
  BINALAR: ['252'],
};

const PASIF_HESAPLARI = {
  BANKA_KREDILERI_KV: ['300', '301'],
  SATICILAR: ['320', '321'],
  ODENECEK_VERGILER: ['360'],
  PERSONEL_BORCLARI: ['335'],
  BANKA_KREDILERI_UV: ['400', '401'],
  SERMAYE: ['500'],
  GECMIS_YIL_KARLARI: ['570', '571'],
  GECMIS_YIL_ZARARLARI: ['580'],
  DONEM_NET_KARI: ['590'],
  DONEM_NET_ZARARI: ['591'],
};

// ===== SERVICE CLASS =====

export class FinancialReportsService {
  /**
   * Gelir Tablosu (Income Statement) oluştur
   */
  static async generateIncomeStatement(params: FinancialReportsParams): Promise<IncomeStatementData> {
    console.log('[FinancialReports] Generating Income Statement:', params);
    
    try {
      // Tüm yevmiye kayıtlarını getir
      const movements = await this.fetchAllMovements(params);
      
      // Hesaplara göre topla
      const totals = this.calculateAccountTotals(movements);
      
      // SATIŞLAR
      const brut_satislar = this.sumAccounts(totals, GELIR_HESAPLARI.SATISLAR, 'alacak');
      const satis_iadeleri = this.sumAccounts(totals, GELIR_HESAPLARI.SATIS_IADELERI, 'borc');
      const net_satislar = brut_satislar - satis_iadeleri;
      
      // MALİYET
      const mal_alislari = this.sumAccounts(totals, GIDER_HESAPLARI.MAL_ALISI, 'borc');
      const alis_iskontolari = this.sumAccounts(totals, GIDER_HESAPLARI.ALIS_ISKONTOLARI, 'alacak');
      const satilan_mal_maliyeti = mal_alislari - alis_iskontolari;
      
      // BRÜT KAR
      const brut_kar = net_satislar - satilan_mal_maliyeti;
      const brut_kar_yuzdesi = net_satislar > 0 ? (brut_kar / net_satislar) * 100 : 0;
      
      // GİDERLER
      const genel_yonetim_giderleri = this.sumAccounts(totals, GIDER_HESAPLARI.GENEL_YONETIM, 'borc');
      const pazarlama_giderleri = this.sumAccounts(totals, GIDER_HESAPLARI.PAZARLAMA, 'borc');
      const personel_giderleri = this.sumAccounts(totals, GIDER_HESAPLARI.PERSONEL, 'borc');
      const kira_giderleri = this.sumAccounts(totals, GIDER_HESAPLARI.KIRA, 'borc');
      const diger_giderler = 
        this.sumAccounts(totals, GIDER_HESAPLARI.ELEKTRIK_SU, 'borc') +
        this.sumAccounts(totals, GIDER_HESAPLARI.DIGER_GIDERLER, 'borc');
      
      const toplam_giderler = 
        genel_yonetim_giderleri +
        pazarlama_giderleri +
        personel_giderleri +
        kira_giderleri +
        diger_giderler;
      
      // DİĞER GELİR/GİDER
      const faiz_gelirleri = this.sumAccounts(totals, GELIR_HESAPLARI.FAIZ_GELIRLERI, 'alacak');
      const faiz_giderleri = this.sumAccounts(totals, GIDER_HESAPLARI.FAIZ_GIDERLERI, 'borc');
      const kur_farki_gelirleri = this.sumAccounts(totals, GELIR_HESAPLARI.KUR_FARKI_GELIRLERI, 'alacak');
      const kur_farki_giderleri = this.sumAccounts(totals, GIDER_HESAPLARI.KUR_FARKI_GIDERLERI, 'borc');
      const diger_gelirler = this.sumAccounts(totals, GELIR_HESAPLARI.DIGER_GELIRLER, 'alacak');
      
      const net_diger_gelirler = 
        faiz_gelirleri - faiz_giderleri +
        kur_farki_gelirleri - kur_farki_giderleri +
        diger_gelirler;
      
      // DÖNEM NET KARI/ZARARI
      const donem_net_kari = brut_kar - toplam_giderler + net_diger_gelirler;
      const donem_net_kari_yuzdesi = net_satislar > 0 ? (donem_net_kari / net_satislar) * 100 : 0;
      
      // Detaylı satırlar oluştur
      const lines: IncomeStatementLine[] = [];
      
      // Satışlar bölümü
      lines.push({
        hesap_kodu: '600',
        hesap_adi: 'BRÜT SATIŞLAR',
        tutar: brut_satislar,
        yuzde: 100,
        seviye: 1,
        grup: 'SATIS'
      });
      
      if (satis_iadeleri > 0) {
        lines.push({
          hesap_kodu: '610',
          hesap_adi: 'Satış İadeleri (-)',
          tutar: -satis_iadeleri,
          yuzde: net_satislar > 0 ? (satis_iadeleri / net_satislar) * 100 : 0,
          seviye: 2,
          grup: 'SATIS'
        });
      }
      
      lines.push({
        hesap_kodu: '',
        hesap_adi: 'NET SATIŞLAR',
        tutar: net_satislar,
        yuzde: 100,
        seviye: 1,
        grup: 'SATIS'
      });
      
      // Maliyet
      lines.push({
        hesap_kodu: '710',
        hesap_adi: 'Satılan Malların Maliyeti (-)',
        tutar: -satilan_mal_maliyeti,
        yuzde: net_satislar > 0 ? (satilan_mal_maliyeti / net_satislar) * 100 : 0,
        seviye: 1,
        grup: 'MALIYET'
      });
      
      lines.push({
        hesap_kodu: '',
        hesap_adi: 'BRÜT KAR',
        tutar: brut_kar,
        yuzde: brut_kar_yuzdesi,
        seviye: 1,
        grup: 'SONUC'
      });
      
      // Giderler
      if (genel_yonetim_giderleri > 0) {
        lines.push({
          hesap_kodu: '730',
          hesap_adi: 'Genel Yönetim Giderleri (-)',
          tutar: -genel_yonetim_giderleri,
          yuzde: net_satislar > 0 ? (genel_yonetim_giderleri / net_satislar) * 100 : 0,
          seviye: 2,
          grup: 'GIDER'
        });
      }
      
      if (pazarlama_giderleri > 0) {
        lines.push({
          hesap_kodu: '740',
          hesap_adi: 'Pazarlama Giderleri (-)',
          tutar: -pazarlama_giderleri,
          yuzde: net_satislar > 0 ? (pazarlama_giderleri / net_satislar) * 100 : 0,
          seviye: 2,
          grup: 'GIDER'
        });
      }
      
      if (personel_giderleri > 0) {
        lines.push({
          hesap_kodu: '750',
          hesap_adi: 'Personel Giderleri (-)',
          tutar: -personel_giderleri,
          yuzde: net_satislar > 0 ? (personel_giderleri / net_satislar) * 100 : 0,
          seviye: 2,
          grup: 'GIDER'
        });
      }
      
      lines.push({
        hesap_kodu: '',
        hesap_adi: 'FAALİYET KARI',
        tutar: brut_kar - toplam_giderler,
        yuzde: net_satislar > 0 ? ((brut_kar - toplam_giderler) / net_satislar) * 100 : 0,
        seviye: 1,
        grup: 'SONUC'
      });
      
      // Diğer gelirler
      if (net_diger_gelirler !== 0) {
        lines.push({
          hesap_kodu: '640',
          hesap_adi: 'Diğer Gelir/Giderler',
          tutar: net_diger_gelirler,
          seviye: 2,
          grup: 'GELIR'
        });
      }
      
      // Net kar/zarar
      lines.push({
        hesap_kodu: donem_net_kari >= 0 ? '590' : '591',
        hesap_adi: donem_net_kari >= 0 ? 'DÖNEM NET KARI' : 'DÖNEM NET ZARARI',
        tutar: donem_net_kari,
        yuzde: donem_net_kari_yuzdesi,
        seviye: 1,
        grup: 'SONUC'
      });
      
      return {
        brut_satislar,
        satis_iadeleri,
        satis_iskontolari: 0,
        net_satislar,
        satilan_mal_maliyeti,
        brut_kar,
        brut_kar_yuzdesi,
        genel_yonetim_giderleri,
        pazarlama_giderleri,
        personel_giderleri,
        kira_giderleri,
        diger_giderler,
        toplam_giderler,
        faiz_gelirleri,
        faiz_giderleri,
        kur_farki_gelirleri,
        kur_farki_giderleri,
        diger_gelirler,
        donem_net_kari,
        donem_net_kari_yuzdesi,
        lines
      };
      
    } catch (error: any) {
      console.error('[FinancialReports] Error generating income statement:', error);
      throw error;
    }
  }
  
  /**
   * Bilanço (Balance Sheet) oluştur
   */
  static async generateBalanceSheet(params: FinancialReportsParams): Promise<BalanceSheetData> {
    console.log('[FinancialReports] Generating Balance Sheet:', params);
    
    try {
      // Tüm yevmiye kayıtlarını getir
      const movements = await this.fetchAllMovements(params);
      
      // Hesaplara göre topla
      const totals = this.calculateAccountTotals(movements);
      
      // DÖNEN VARLIKLAR
      const kasa = this.sumAccounts(totals, AKTIF_HESAPLARI.KASA, 'bakiye');
      const bankalar = this.sumAccounts(totals, AKTIF_HESAPLARI.BANKALAR, 'bakiye');
      const alicilar = this.sumAccounts(totals, AKTIF_HESAPLARI.ALICILAR, 'bakiye');
      const stoklar = this.sumAccounts(totals, AKTIF_HESAPLARI.STOKLAR, 'bakiye');
      const donen_diger = this.sumAccounts(totals, AKTIF_HESAPLARI.DONEN_DIGER, 'bakiye');
      const donen_varliklar_toplam = kasa + bankalar + alicilar + stoklar + donen_diger;
      
      // DURAN VARLIKLAR
      const demirbaslar = this.sumAccounts(totals, AKTIF_HESAPLARI.DEMIRBASLAR, 'bakiye');
      const tasitlar = this.sumAccounts(totals, AKTIF_HESAPLARI.TASITLAR, 'bakiye');
      const binalar = this.sumAccounts(totals, AKTIF_HESAPLARI.BINALAR, 'bakiye');
      const duran_diger = 0;
      const duran_varliklar_toplam = demirbaslar + tasitlar + binalar + duran_diger;
      
      const toplam_aktif = donen_varliklar_toplam + duran_varliklar_toplam;
      
      // KISA VADELİ BORÇLAR
      const kv_banka_kredileri = this.sumAccounts(totals, PASIF_HESAPLARI.BANKA_KREDILERI_KV, 'bakiye', true);
      const saticilar = this.sumAccounts(totals, PASIF_HESAPLARI.SATICILAR, 'bakiye', true);
      const odenecek_vergiler = this.sumAccounts(totals, PASIF_HESAPLARI.ODENECEK_VERGILER, 'bakiye', true);
      const personel_borclari = this.sumAccounts(totals, PASIF_HESAPLARI.PERSONEL_BORCLARI, 'bakiye', true);
      const kv_diger = 0;
      const kisa_vadeli_toplam = kv_banka_kredileri + saticilar + odenecek_vergiler + personel_borclari + kv_diger;
      
      // UZUN VADELİ BORÇLAR
      const uv_banka_kredileri = this.sumAccounts(totals, PASIF_HESAPLARI.BANKA_KREDILERI_UV, 'bakiye', true);
      const uv_diger = 0;
      const uzun_vadeli_toplam = uv_banka_kredileri + uv_diger;
      
      // ÖZKAYNAKLAR
      const sermaye = this.sumAccounts(totals, PASIF_HESAPLARI.SERMAYE, 'bakiye', true);
      const gecmis_yil_karlari = 
        this.sumAccounts(totals, PASIF_HESAPLARI.GECMIS_YIL_KARLARI, 'bakiye', true) -
        this.sumAccounts(totals, PASIF_HESAPLARI.GECMIS_YIL_ZARARLARI, 'bakiye');
      
      // Dönem karını hesapla
      const incomeStatement = await this.generateIncomeStatement(params);
      const donem_net_kari = incomeStatement.donem_net_kari;
      
      const ozkaynaklar_toplam = sermaye + gecmis_yil_karlari + donem_net_kari;
      
      const toplam_pasif = kisa_vadeli_toplam + uzun_vadeli_toplam + ozkaynaklar_toplam;
      
      const dengeli = Math.abs(toplam_aktif - toplam_pasif) < 0.01;
      const fark = toplam_aktif - toplam_pasif;
      
      // Detaylı satırlar
      const lines: BalanceSheetLine[] = [];
      
      // AKTİF
      lines.push({
        hesap_kodu: '',
        hesap_adi: 'DÖNEN VARLIKLAR',
        tutar: donen_varliklar_toplam,
        seviye: 1,
        kategori: 'AKTIF',
        grup: 'DONEN'
      });
      
      if (kasa > 0) {
        lines.push({
          hesap_kodu: '100',
          hesap_adi: 'Kasa',
          tutar: kasa,
          yuzde: toplam_aktif > 0 ? (kasa / toplam_aktif) * 100 : 0,
          seviye: 2,
          kategori: 'AKTIF',
          grup: 'DONEN'
        });
      }
      
      if (bankalar > 0) {
        lines.push({
          hesap_kodu: '102',
          hesap_adi: 'Bankalar',
          tutar: bankalar,
          yuzde: toplam_aktif > 0 ? (bankalar / toplam_aktif) * 100 : 0,
          seviye: 2,
          kategori: 'AKTIF',
          grup: 'DONEN'
        });
      }
      
      if (alicilar > 0) {
        lines.push({
          hesap_kodu: '120',
          hesap_adi: 'Alıcılar',
          tutar: alicilar,
          yuzde: toplam_aktif > 0 ? (alicilar / toplam_aktif) * 100 : 0,
          seviye: 2,
          kategori: 'AKTIF',
          grup: 'DONEN'
        });
      }
      
      if (stoklar > 0) {
        lines.push({
          hesap_kodu: '153',
          hesap_adi: 'Ticari Mallar',
          tutar: stoklar,
          yuzde: toplam_aktif > 0 ? (stoklar / toplam_aktif) * 100 : 0,
          seviye: 2,
          kategori: 'AKTIF',
          grup: 'DONEN'
        });
      }
      
      // PASİF
      lines.push({
        hesap_kodu: '',
        hesap_adi: 'KISA VADELİ BORÇLAR',
        tutar: kisa_vadeli_toplam,
        seviye: 1,
        kategori: 'PASIF',
        grup: 'KISA_VADELI'
      });
      
      if (saticilar > 0) {
        lines.push({
          hesap_kodu: '320',
          hesap_adi: 'Satıcılar',
          tutar: saticilar,
          yuzde: toplam_pasif > 0 ? (saticilar / toplam_pasif) * 100 : 0,
          seviye: 2,
          kategori: 'PASIF',
          grup: 'KISA_VADELI'
        });
      }
      
      lines.push({
        hesap_kodu: '',
        hesap_adi: 'ÖZKAYNAKLAR',
        tutar: ozkaynaklar_toplam,
        seviye: 1,
        kategori: 'PASIF',
        grup: 'OZKAYNAK'
      });
      
      lines.push({
        hesap_kodu: '500',
        hesap_adi: 'Sermaye',
        tutar: sermaye,
        yuzde: toplam_pasif > 0 ? (sermaye / toplam_pasif) * 100 : 0,
        seviye: 2,
        kategori: 'PASIF',
        grup: 'OZKAYNAK'
      });
      
      lines.push({
        hesap_kodu: donem_net_kari >= 0 ? '590' : '591',
        hesap_adi: 'Dönem Net Karı/Zararı',
        tutar: donem_net_kari,
        yuzde: toplam_pasif > 0 ? (donem_net_kari / toplam_pasif) * 100 : 0,
        seviye: 2,
        kategori: 'PASIF',
        grup: 'OZKAYNAK'
      });
      
      return {
        donen_varliklar: {
          kasa,
          bankalar,
          alicilar,
          stoklar,
          diger: donen_diger,
          toplam: donen_varliklar_toplam
        },
        duran_varliklar: {
          demirbaslar,
          tasitlar,
          binalar,
          diger: duran_diger,
          toplam: duran_varliklar_toplam
        },
        toplam_aktif,
        kisa_vadeli_borclar: {
          banka_kredileri: kv_banka_kredileri,
          saticilar,
          odenecek_vergiler,
          personel_borclari,
          diger: kv_diger,
          toplam: kisa_vadeli_toplam
        },
        uzun_vadeli_borclar: {
          banka_kredileri: uv_banka_kredileri,
          diger: uv_diger,
          toplam: uzun_vadeli_toplam
        },
        ozkaynaklar: {
          sermaye,
          gecmis_yil_karlari,
          donem_net_kari,
          toplam: ozkaynaklar_toplam
        },
        toplam_pasif,
        dengeli,
        fark,
        lines
      };
      
    } catch (error: any) {
      console.error('[FinancialReports] Error generating balance sheet:', error);
      throw error;
    }
  }
  
  /**
   * Tüm yevmiye hareketlerini getir
   */
  private static async fetchAllMovements(params: FinancialReportsParams): Promise<any[]> {
    try {
      const url = new URL(`https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/accounting/journal-entries`);
      url.searchParams.append('firma_id', params.firma_id);
      url.searchParams.append('donem_id', params.donem_id);
      
      if (params.baslangic_tarihi) {
        url.searchParams.append('baslangic_tarihi', params.baslangic_tarihi);
      }
      if (params.bitis_tarihi) {
        url.searchParams.append('bitis_tarihi', params.bitis_tarihi);
      }
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch movements');
      }
      
      const result = await response.json();
      return result.data || [];
      
    } catch (error) {
      console.error('[FinancialReports] Error fetching movements:', error);
      return [];
    }
  }
  
  /**
   * Hesap bakiyelerini hesapla
   */
  private static calculateAccountTotals(movements: any[]): Map<string, { borc: number; alacak: number; bakiye: number }> {
    const totals = new Map();
    
    movements.forEach((entry: any) => {
      entry.satirlar?.forEach((satir: any) => {
        const kod = satir.hesap_kodu;
        if (!totals.has(kod)) {
          totals.set(kod, { borc: 0, alacak: 0, bakiye: 0 });
        }
        const current = totals.get(kod);
        current.borc += satir.borc || 0;
        current.alacak += satir.alacak || 0;
        current.bakiye = current.borc - current.alacak;
      });
    });
    
    return totals;
  }
  
  /**
   * Hesap kodlarını topla
   */
  private static sumAccounts(
    totals: Map<string, any>, 
    codes: string[], 
    field: 'borc' | 'alacak' | 'bakiye',
    negate: boolean = false
  ): number {
    let sum = 0;
    
    codes.forEach(code => {
      // Prefix match (örn: "100" ile "100.01" eşleşir)
      for (const [key, value] of totals.entries()) {
        if (key.startsWith(code)) {
          sum += value[field] || 0;
        }
      }
    });
    
    return negate ? Math.abs(sum) : Math.max(0, sum);
  }
}

/**
 * Format money (IQD) - Türkiye formatı
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
 * Format percentage
 */
export function formatPercent(value: number): string {
  return value.toFixed(2) + '%';
}

