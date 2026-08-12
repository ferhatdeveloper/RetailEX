/**
 * Basit POS kampanya motoru — web `src/utils/campaignEngine.ts` özeti.
 * Destek: percentage, fixed, buyXgetY (X al Y öde), priceOverride.
 */

import type { CampaignDetail } from '../api/campaignsApi';

export type CampaignCartLine = {
  productId: string;
  price: number;
  qty: number;
  /** Ürün kategori kodu — kategori kampanyası için */
  categoryCode?: string | null;
};

export type CampaignApplyResult = {
  totalDiscount: number;
  /** Uygulandıysa kampanya id; min. tutar / uygun satır yoksa null */
  appliedCampaignId: string | null;
  eligibleSubtotal: number;
};

function roundMoney(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeDiscountType(campaign: CampaignDetail): string {
  const raw = String(campaign.discountType || campaign.type || 'percentage').trim();
  if (raw === 'buy-x-get-y') return 'buyXgetY';
  return raw;
}

/** Kampanyaya uygun sepet satırları */
export function filterEligibleLines(
  cart: CampaignCartLine[],
  campaign: CampaignDetail,
): { line: CampaignCartLine; index: number }[] {
  return cart
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      if (campaign.productIds && campaign.productIds.length > 0) {
        if (!campaign.productIds.includes(line.productId)) return false;
      }
      if (campaign.categoryId) {
        const cat = (line.categoryCode || '').trim();
        if (!cat || cat !== campaign.categoryId.trim()) return false;
      }
      return true;
    });
}

/**
 * Tek kampanyayı sepete uygular. Koşul tutmazsa discount=0 ve appliedCampaignId=null.
 */
export function applyCampaign(
  cart: CampaignCartLine[],
  campaign: CampaignDetail,
): CampaignApplyResult {
  const empty: CampaignApplyResult = {
    totalDiscount: 0,
    appliedCampaignId: null,
    eligibleSubtotal: 0,
  };

  if (!campaign.active) return empty;

  const eligible = filterEligibleLines(cart, campaign);
  if (eligible.length === 0) return empty;

  const eligibleSubtotal = eligible.reduce(
    (s, { line }) => s + line.price * line.qty,
    0,
  );

  if (campaign.minPurchaseAmount > 0 && eligibleSubtotal < campaign.minPurchaseAmount) {
    return { ...empty, eligibleSubtotal };
  }

  const discountType = normalizeDiscountType(campaign);
  let totalDiscount = 0;

  if (discountType === 'percentage') {
    totalDiscount = eligibleSubtotal * (campaign.discountValue / 100);
  } else if (discountType === 'fixed') {
    totalDiscount = Math.min(campaign.discountValue, eligibleSubtotal);
  } else if (discountType === 'buyXgetY') {
    // DB’de X/Y yok — varsayılan 2 al 1 öde (discountValue ile X; Y=1)
    const X = Math.max(2, Math.floor(campaign.discountValue) || 2);
    const Y = 1;
    if (X > Y) {
      const flattened: number[] = [];
      eligible.forEach(({ line }) => {
        for (let i = 0; i < line.qty; i++) flattened.push(line.price);
      });
      flattened.sort((a, b) => b - a);
      const numGroups = Math.floor(flattened.length / X);
      let discount = 0;
      for (let g = 0; g < numGroups; g++) {
        const group = flattened.slice(g * X, (g + 1) * X);
        const numFree = X - Y;
        group.slice(-numFree).forEach((p) => {
          discount += p;
        });
      }
      totalDiscount = discount;
    }
  } else if (discountType === 'priceOverride') {
    let discount = 0;
    const campaignPrice = campaign.discountValue;
    eligible.forEach(({ line }) => {
      if (line.price > campaignPrice) {
        discount += (line.price - campaignPrice) * line.qty;
      }
    });
    totalDiscount = discount;
  } else {
    // Bilinmeyen tip → yüzde varsay
    totalDiscount = eligibleSubtotal * (campaign.discountValue / 100);
  }

  totalDiscount = roundMoney(totalDiscount);
  totalDiscount = Math.min(totalDiscount, eligibleSubtotal);
  if (campaign.maxDiscountAmount != null && campaign.maxDiscountAmount > 0) {
    totalDiscount = Math.min(totalDiscount, campaign.maxDiscountAmount);
  }
  totalDiscount = roundMoney(totalDiscount);

  if (totalDiscount <= 0) {
    return { totalDiscount: 0, appliedCampaignId: null, eligibleSubtotal };
  }

  return {
    totalDiscount,
    appliedCampaignId: campaign.id,
    eligibleSubtotal,
  };
}

/** Öncelik ASC sonra en yüksek indirim — otomatik seçim */
export function pickBestCampaign(
  cart: CampaignCartLine[],
  campaigns: CampaignDetail[],
): { campaign: CampaignDetail; result: CampaignApplyResult } | null {
  if (cart.length === 0 || campaigns.length === 0) return null;

  const ranked = [...campaigns].sort((a, b) => {
    const p = (a.priority || 0) - (b.priority || 0);
    if (p !== 0) return p;
    return a.name.localeCompare(b.name, 'tr');
  });

  let best: { campaign: CampaignDetail; result: CampaignApplyResult } | null = null;

  for (const c of ranked) {
    const result = applyCampaign(cart, c);
    if (!result.appliedCampaignId || result.totalDiscount <= 0) continue;
    if (!best || result.totalDiscount > best.result.totalDiscount) {
      best = { campaign: c, result };
    }
  }

  return best;
}
