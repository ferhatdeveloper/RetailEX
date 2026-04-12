import { Campaign, CartItem } from '../core/types';
import { roundPosDiscountAmountUp } from './discountRounding';

export interface CampaignResult {
  totalDiscount: number;
  itemDiscounts: { index: number, discountAmount: number }[];
  appliedCampaignId: string | null;
}

/**
 * Advanced Campaign Engine for RetailEX POS
 * Handles product-specific rules, Buy X Get Y, and complex conditions.
 */
export function applyCampaign(cart: CartItem[], campaign: Campaign): CampaignResult {
  const result: CampaignResult = {
    totalDiscount: 0,
    itemDiscounts: [],
    appliedCampaignId: campaign.id
  };

  // 1. Filter eligible items
  const eligibleItems = cart.map((item, index) => ({ item, index })).filter(({ item }) => {
    // Product ID check
    if (campaign.productIds && campaign.productIds.length > 0) {
      if (!campaign.productIds.includes(item.product.id)) return false;
    }

    // Category check
    if (campaign.selectedCategories && campaign.selectedCategories.length > 0) {
      if (!campaign.selectedCategories.includes(item.product.category)) return false;
    }

    // Unit check (optional, if campaign specifies unit)
    if (campaign.campaignUnit && campaign.campaignUnit !== 'NONE') {
      if (item.unit !== campaign.campaignUnit) return false;
    }

    return true;
  });

  if (eligibleItems.length === 0) {
    return { ...result, appliedCampaignId: null };
  }

  // Calculate sum of eligible items (after item-level discounts)
  const eligibleSubtotal = eligibleItems.reduce((sum, { item }) => {
    const price = item.price || item.variant?.price || item.product.price;
    const itemDiscount = (item.quantity * price) * (item.discount / 100);
    return sum + (item.quantity * price) - itemDiscount;
  }, 0);

  // 2. Check Min Purchase Amount
  if (campaign.minPurchaseAmount && eligibleSubtotal < campaign.minPurchaseAmount) {
    return { ...result, appliedCampaignId: null };
  }

  // 3. Handle different Discount Types
  const discountType = campaign.discountType || (campaign.type as any); // Fallback to legacy 'type'

  if (discountType === 'percentage') {
    result.totalDiscount = eligibleSubtotal * (campaign.discountValue / 100);
  } 
  else if (discountType === 'fixed') {
    result.totalDiscount = Math.min(campaign.discountValue, eligibleSubtotal);
  } 
  else if (discountType === 'buyXgetY') {
    // Buy X Get Y (e.g. 2 Al 1 Öde -> buyQuantity=2, getQuantity=1)
    // Interpretation: User pays for 'getQuantity' for every 'buyQuantity' items.
    // Actually standard is: Buy X, get Y free. So total items needed = X + Y.
    // Based on CreateCampaignPage UI, X is "Alım Miktarı", Y is "Ödeme Miktarı".
    // "2 Al 1 Öde" -> X=2, Y=1. You get 2 items, only pay for 1.
    
    const X = campaign.buyQuantity || 1;
    const Y = campaign.getQuantity || 1;
    
    if (X > Y) {
      // Group items by unit price (descending) to apply discount to the cheapest ones (or as defined)
      // Standard practice: "N al M öde" applies to items of same price or cheapest in set.
      const flattenedItems: { index: number, price: number }[] = [];
      eligibleItems.forEach(({ item, index }) => {
        const itemPrice = item.price || item.variant?.price || item.product.price;
        // Consider item-level percentage discount
        const effectivePrice = itemPrice * (1 - item.discount / 100);
        for (let i = 0; i < item.quantity; i++) {
          flattenedItems.push({ index, price: effectivePrice });
        }
      });

      // Sort by price descending
      flattenedItems.sort((a, b) => b.price - a.price);

      let discount = 0;
      const numGroups = Math.floor(flattenedItems.length / X);
      
      for (let g = 0; g < numGroups; g++) {
        const group = flattenedItems.slice(g * X, (g + 1) * X);
        // In "X al Y öde", we discount (X-Y) items. Usually the cheapest ones in the group.
        // Since we sorted descending, the last (X-Y) items in each group are the cheapest.
        const numFree = X - Y;
        const freeItems = group.slice(-numFree);
        freeItems.forEach(item => {
          const inc = roundPosDiscountAmountUp(item.price);
          discount += inc;
          // Track item-level discount for visualization
          const existing = result.itemDiscounts.find(d => d.index === item.index);
          if (existing) {
            existing.discountAmount += inc;
          } else {
            result.itemDiscounts.push({ index: item.index, discountAmount: inc });
          }
        });
      }
      result.totalDiscount = discount;
    }
  } 
  else if (discountType === 'priceOverride') {
    // Force a specific price for all eligible items
    let discount = 0;
    eligibleItems.forEach(({ item, index }) => {
      const originalPrice = item.price || item.variant?.price || item.product.price;
      const effectivePrice = originalPrice * (1 - item.discount / 100);
      const campaignPrice = campaign.discountValue; // discountValue stores the override price
      
      if (effectivePrice > campaignPrice) {
        const itemDiscount = roundPosDiscountAmountUp((effectivePrice - campaignPrice) * item.quantity);
        discount += itemDiscount;
        result.itemDiscounts.push({ index, discountAmount: itemDiscount });
      }
    });
    result.totalDiscount = discount;
  }

  // 4. İndirim tutarını 250’lik kademeye yukarı yuvarla; satır kırılımlı kampanyalarda satırları sonra topla
  if (result.itemDiscounts.length === 0 && result.totalDiscount > 0) {
    result.totalDiscount = roundPosDiscountAmountUp(result.totalDiscount);
  } else if (result.itemDiscounts.length > 0) {
    result.itemDiscounts = result.itemDiscounts.map((d) => ({
      index: d.index,
      discountAmount: roundPosDiscountAmountUp(d.discountAmount),
    }));
    result.totalDiscount = result.itemDiscounts.reduce((s, d) => s + d.discountAmount, 0);
  }

  result.totalDiscount = Math.min(result.totalDiscount, eligibleSubtotal);
  if (campaign.maxDiscountAmount != null && campaign.maxDiscountAmount > 0) {
    result.totalDiscount = Math.min(result.totalDiscount, campaign.maxDiscountAmount);
  }

  return result;
}
