/**
 * Hareket Dökümü — net tutar hesabı (indirim sonrası).
 *
 * Veri kaynağı önceliği:
 *  1. `net_amount` (DB'de zaten varsa) — en doğru, KDV hariç net
 *  2. `gross_amount - discount_amount` (DB'den geliyorsa)
 *  3. `unit_price * quantity - discount_amount` (geriye uyumlu fallback)
 *  4. Son çare: `unit_price * quantity` (ambar fişlerinde indirim yok)
 *
 * Negatif sonuç üretmez (`Math.max(0, …)`); yuvarlama hatalarından
 * kaçınmak için 2 ondalık hassasiyetle yuvarlar.
 */
export interface NetAmountInput {
    quantity: number | string;
    unit_price: number | string;
    gross_amount?: number | string | null;
    discount_amount?: number | string | null;
    net_amount?: number | string | null;
}

export function computeNetAmount(input: NetAmountInput): number {
    const qty = Number(input.quantity) || 0;
    const unitPrice = Number(input.unit_price) || 0;
    const explicitNet = Number(input.net_amount ?? 0);
    const gross =
        Number(input.gross_amount ?? 0) ||
        Math.abs(qty) * unitPrice;
    const discount = Math.max(0, Number(input.discount_amount ?? 0));

    let net: number;
    if (explicitNet > 0) {
        net = explicitNet;
    } else if (gross > 0) {
        net = Math.max(0, gross - discount);
    } else {
        // gross_amount 0 geldiyse (eski slip kayıtları): fallback unit_price × qty
        net = Math.abs(qty) * unitPrice;
    }

    return Math.round(net * 100) / 100;
}

/**
 * Bir kalem listesinin toplam net tutarını döner (dip toplam doğrulaması için).
 * Pozitif tutar (giriş) eklenir, negatif (iade) çıkarılır.
 */
export function computeNetTotal(items: NetAmountInput[]): number {
    const sum = items.reduce((acc, it) => acc + computeNetAmount(it), 0);
    return Math.round(sum * 100) / 100;
}