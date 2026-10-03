/**
 * Kasa İşlemleri — Rezervasyon Peşinatı tespiti.
 *
 * Senaryo:
 *   Güzellik randevusu için alınan peşinat `beautyService.createSale` üzerinden
 *   bir `sales` fişi oluşturur (`fiche_no = BEA-YYYY-XXXXX` veya
 *   `BEAUTY-PESINAT-{aptId}-{ts}`). Aynı `fiche_no` ile `cash_lines` tablosuna
 *   `KASA_GIRIS` (veya eski akışta `CH_TAHSILAT`) yazılır. Kasa İşlemleri
 *   listesinde `islem_aciklamasi` "Satış faturası" görünür; kullanıcı bunun
 *   normal bir satış faturası mı yoksa rezervasyon peşinatı mı olduğunu
 *   ayırt edemez.
 *
 * Bu modül üç yardımcı sunar:
 *   1) `detectReservationDepositFiches(ficheNoList, salesRowsByFiche)` —
 *      Sunucudan çekilen `sales` satırlarını `fiche_no` üzerinden indeksler
 *      ve `is_deposit = true` olanları "rezervasyon peşinatı" olarak işaretler.
 *   2) `isBeautyFicheNo(ficheNo)` — `BEA-*` veya `BEAUTY-PESINAT-*` öneki
 *      taşıyanları güzellik fiş adayı olarak tanır (faturalar tablosu).
 *   3) `resolveCashLineTypeLabelShort(...)` — Kasa İşlemleri tablosunun "Tür"
 *      kolonunda gösterilecek kısa etiket (çok dilli).
 *
 * Davranış:
 *   - Sadece `BEA-*` veya `BEAUTY-PESINAT-*` öneki taşıyan fişler için DB
 *     sorgusu koşulur; binlerce satır içeren kasa listesinde gereksiz JOIN
 *     engellenir.
 *   - `is_deposit = true` (Migration 182 / 192) ya da `notes` içinde
 *     `deposit:1` tag'i olan satırlar rezervasyon peşinatı kabul edilir.
 *     İkinci kontrol geriye dönük uyumluluk içindir (kolon henüz yazılmamış
 *     eski fişler).
 *   - `BEAUTY-REMAINDER-*` öneki ile gelen kalan ödeme satırları **ayrı
 *     tür**'dür (doğrudan `CH_TAHSILAT` definition'ı ayrıştırılır); burada
 *     sadece peşinat (ön ödeme) ayrımı yapılır.
 *
 * @example
 *   const deposit = detectReservationDepositFiches(['BEA-2026-MUS0WBJT'], [
 *     { fiche_no: 'BEA-2026-MUS0WBJT', is_deposit: true, notes: 'rex_appt:abc | deposit:1' },
 *   ]);
 *   // deposit.has('BEA-2026-MUS0WBJT') === true
 */

export interface SalesRowForDepositCheck {
    /** Fiş no (BEA-YYYY-XXXXX veya BEAUTY-PESINAT-...) */
    fiche_no?: string | null;
    /** Migration 182 / 192 ile eklenen kolon (true = peşinat) */
    is_deposit?: boolean | null;
    /** notes içine yazılan yedek tag — eski / eksik kolonlu fişler için */
    notes?: string | null;
}

const BEAUTY_FICHE_PREFIX_RE = /^(BEA-|BEAUTY-PESINAT-)/i;

/** Sorgulanmadan önce önek kontrolü: BEA-* veya BEAUTY-PESINAT-* mi? */
export function isBeautyFicheNo(ficheNo: string | null | undefined): boolean {
    return BEAUTY_FICHE_PREFIX_RE.test(String(ficheNo ?? '').trim());
}

/** `notes` içindeki `deposit:1` tag'i — geriye dönük uyumluluk (Bug 14 notu). */
export function notesHasDepositFlag(notes: string | null | undefined): boolean {
    return /deposit:1(?:[|]|$)/i.test(String(notes ?? ''));
}

/**
 * Verilen fiş no listesinden hangilerinin rezervasyon peşinatı olduğunu döner.
 * `salesRowsByFiche` anahtarı `fiche_no` (büyük-küçük harf duyarsız).
 *
 * @param ficheNoList  Kasa islemleri listesindeki `islem_no` değerleri
 * @param salesRowsByFiche  `sales` tablosundan çekilmiş satırlar (Map veya dizi)
 * @returns  Rezervasyon peşinatı fiş no'ları (Set)
 */
export function detectReservationDepositFiches(
    ficheNoList: Array<string | null | undefined> | null | undefined,
    salesRowsByFiche: Map<string, SalesRowForDepositCheck> | SalesRowForDepositCheck[] | null | undefined,
): Set<string> {
    const out = new Set<string>();
    if (!Array.isArray(ficheNoList) || ficheNoList.length === 0) return out;
    let map: Map<string, SalesRowForDepositCheck>;
    if (salesRowsByFiche instanceof Map) {
        // Büyük-küçük harf duyarsız arama için alt anahtarlar ekle
        map = new Map<string, SalesRowForDepositCheck>();
        for (const [k, v] of salesRowsByFiche.entries()) {
            const lk = String(k ?? '').trim().toLowerCase();
            if (lk) map.set(lk, v);
        }
    } else if (Array.isArray(salesRowsByFiche)) {
        map = new Map(
            salesRowsByFiche
                .map((r) => [String(r?.fiche_no ?? '').trim().toLowerCase(), r] as const)
                .filter(([k]) => Boolean(k)),
        );
    } else {
        map = new Map();
    }

    for (const raw of ficheNoList) {
        const fn = String(raw ?? '').trim();
        if (!fn) continue;
        if (!isBeautyFicheNo(fn)) continue;
        const row = map.get(fn.toLowerCase());
        if (!row) continue;
        if (row.is_deposit === true) {
            out.add(fn);
            continue;
        }
        if (notesHasDepositFlag(row.notes)) {
            out.add(fn);
        }
    }
    return out;
}

/**
 * Kasa İşlemleri "Tür" kolonu için kısa etiket (çok dilli).
 *
 *   1) `isReservationDeposit=true` → "Rezervasyon Peşinatı" (öncelikli)
 *   2) Aksi halde description içinde fatura anahtar kelimesi → fatura etiketi
 *   3) Aksi halde `islem_tipi` sözlük eşlemesi (CH_TAHSILAT, KASA_GIRIS …)
 *   4) Son çare: ham `islem_tipi` döndürülür
 *
 * `tm` parametresi `useLanguage().tm` (modül çeviri anahtarları) olmalı.
 */
export function resolveCashLineTypeLabelShort(
    islemTipi: string | null | undefined,
    aciklama: string | null | undefined,
    isReservationDeposit: boolean,
    tm: (key: string) => string,
): string {
    if (isReservationDeposit) {
        return tm('cashTransactionTypeReservationDeposit');
    }
    const tip = String(islemTipi || '').trim();
    const defNorm = String(aciklama || '').toLocaleLowerCase('tr-TR');
    if (defNorm.includes('hizmet fatur')) {
        if (defNorm.includes('alınan') || defNorm.includes('alinan')) return tm('cashReceivedServiceInvoice');
        if (defNorm.includes('verilen')) return tm('cashGivenServiceInvoice');
        return tm('cashServiceInvoice');
    }
    if (defNorm.includes('satış fatur') || defNorm.includes('satis fatur')) return tm('cashSalesInvoice');
    if (defNorm.includes('alış fatur') || defNorm.includes('alis fatur')) return tm('cashPurchaseInvoice');
    const labels: Record<string, string> = {
        CH_TAHSILAT: tm('chCollection'),
        CH_ODEME: tm('chPayment'),
        KASA_GIRIS: tm('cashIn'),
        KASA_CIKIS: tm('cashOut'),
        GIDER_PUSULASI: tm('expenseVoucher') || 'Gider pusulası',
        SATIS_FATURASI: tm('cashSalesInvoice'),
        ALIS_FATURASI: tm('cashPurchaseInvoice'),
        HIZMET_FATURASI: tm('cashServiceInvoice'),
        ACILIS: tm('openingDebit'),
        KAPANIS: tm('openingCredit'),
        ACILIS_BORC: tm('openingDebit'),
        ACILIS_ALACAK: tm('openingCredit'),
        VIRMAN: 'Virman',
    };
    return labels[tip] || tip;
}
