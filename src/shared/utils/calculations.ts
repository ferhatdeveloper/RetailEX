// Business Calculation Utilities
import type { CartItem, Campaign, Product } from '../../core/types';

/**
 * Calculate item subtotal (quantity * price)
 */
export const calculateItemSubtotal = (quantity: number, price: number): number => {
  return quantity * price;
};

/**
 * Calculate discount amount
 */
export const calculateDiscountAmount = (
  subtotal: number,
  discountType: 'percentage' | 'fixed',
  discountValue: number
): number => {
  if (discountType === 'percentage') {
    return (subtotal * discountValue) / 100;
  }
  return discountValue;
};

/**
 * Calculate item total after discount
 */
export const calculateItemTotal = (
  quantity: number,
  price: number,
  discount: number
): number => {
  const subtotal = calculateItemSubtotal(quantity, price);
  return subtotal - discount;
};

/**
 * Calculate cart subtotal
 */
export const calculateCartSubtotal = (items: CartItem[]): number => {
  return items.reduce((sum, item) => {
    return sum + calculateItemSubtotal(item.quantity, item.product.price);
  }, 0);
};

/**
 * Calculate cart total discount
 */
export const calculateCartTotalDiscount = (items: CartItem[]): number => {
  return items.reduce((sum, item) => sum + item.discount, 0);
};

/**
 * Calculate cart total
 */
export const calculateCartTotal = (items: CartItem[]): number => {
  return items.reduce((sum, item) => sum + item.subtotal, 0);
};

/**
 * Calculate tax amount
 */
export const calculateTax = (amount: number, taxRate: number): number => {
  return (amount * taxRate) / 100;
};

/**
 * Check if campaign is applicable
 */
export const isCampaignApplicable = (
  campaign: Campaign,
  cartTotal: number,
  items: CartItem[]
): boolean => {
  // Check if campaign is active
  if (!campaign.active) return false;

  // Check date range
  const now = new Date();
  const start = new Date(campaign.startDate);
  const end = new Date(campaign.endDate);
  if (now < start || now > end) return false;

  // Check minimum purchase
  if (campaign.minPurchase && cartTotal < campaign.minPurchase) return false;

  // Check category specific campaigns
  if (campaign.type === 'category' && campaign.categoryId) {
    const hasMatchingCategory = items.some(
      item => item.product.category.includes(campaign.categoryId!)
    );
    if (!hasMatchingCategory) return false;
  }

  // Check product specific campaigns
  if (campaign.productIds && campaign.productIds.length > 0) {
    const hasMatchingProduct = items.some(
      item => campaign.productIds!.includes(item.product.id)
    );
    if (!hasMatchingProduct) return false;
  }

  return true;
};

/**
 * Calculate campaign discount
 */
export const calculateCampaignDiscount = (
  campaign: Campaign,
  cartSubtotal: number
): number => {
  if (campaign.type === 'percentage') {
    return (cartSubtotal * campaign.discountValue) / 100;
  } else if (campaign.type === 'fixed') {
    return campaign.discountValue;
  }
  return 0;
};

/**
 * Calculate change amount for cash payment
 */
export const calculateChange = (total: number, cashReceived: number): number => {
  return Math.max(0, cashReceived - total);
};

/**
 * Round to 2 decimal places
 */
export const roundToTwo = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * Calculate profit margin
 */
export const calculateProfitMargin = (price: number, cost: number): number => {
  if (cost === 0) return 0;
  return ((price - cost) / price) * 100;
};

/**
 * Calculate markup percentage
 */
export const calculateMarkup = (price: number, cost: number): number => {
  if (cost === 0) return 0;
  return ((price - cost) / cost) * 100;
};


