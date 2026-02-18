// POS Service - Business Logic
import type { Sale, SaleItem, CartItem, Campaign } from '../../../core/types';
import { generateInvoiceNumber, getCurrentTimestamp } from '../../../shared/utils';
import { 
  calculateCartSubtotal, 
  calculateCartTotalDiscount, 
  calculateCartTotal,
  isCampaignApplicable,
  calculateCampaignDiscount 
} from '../../../shared/utils';

export class POSService {
  /**
   * Complete a sale transaction
   */
  static completeSale(
    cart: CartItem[],
    paymentMethod: string,
    customerId?: string,
    customerName?: string,
    appliedCampaign?: Campaign | null
  ): Sale {
    const saleItems: SaleItem[] = cart.map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      price: item.product.price,
      discount: item.discount,
      total: item.subtotal,
      variant: item.variant,
    }));

    const subtotal = calculateCartSubtotal(cart);
    const discount = calculateCartTotalDiscount(cart);
    let total = calculateCartTotal(cart);

    // Apply campaign discount if applicable
    let campaignId: string | undefined;
    if (appliedCampaign) {
      const campaignDiscount = calculateCampaignDiscount(appliedCampaign, subtotal);
      total -= campaignDiscount;
      campaignId = appliedCampaign.id;
    }

    const sale: Sale = {
      id: generateInvoiceNumber('FIS'),
      date: getCurrentTimestamp(),
      customerId,
      customerName,
      items: saleItems,
      subtotal,
      discount,
      total,
      paymentMethod,
      campaignId,
    };

    return sale;
  }

  /**
   * Find applicable campaigns for current cart
   */
  static findApplicableCampaigns(
    cart: CartItem[],
    campaigns: Campaign[]
  ): Campaign[] {
    const cartTotal = calculateCartTotal(cart);
    
    return campaigns.filter(campaign => 
      isCampaignApplicable(campaign, cartTotal, cart)
    );
  }

  /**
   * Calculate best campaign discount
   */
  static getBestCampaign(
    cart: CartItem[],
    campaigns: Campaign[]
  ): Campaign | null {
    const applicableCampaigns = this.findApplicableCampaigns(cart, campaigns);
    
    if (applicableCampaigns.length === 0) return null;

    const cartSubtotal = calculateCartSubtotal(cart);

    // Find campaign with highest discount
    let bestCampaign = applicableCampaigns[0];
    let maxDiscount = calculateCampaignDiscount(bestCampaign, cartSubtotal);

    for (let i = 1; i < applicableCampaigns.length; i++) {
      const campaign = applicableCampaigns[i];
      const discount = calculateCampaignDiscount(campaign, cartSubtotal);
      
      if (discount > maxDiscount) {
        maxDiscount = discount;
        bestCampaign = campaign;
      }
    }

    return bestCampaign;
  }

  /**
   * Validate payment amount
   */
  static validatePayment(
    total: number,
    paymentMethod: string,
    cashAmount?: number
  ): { valid: boolean; error?: string } {
    if (paymentMethod === 'cash' && cashAmount !== undefined) {
      if (cashAmount < total) {
        return { 
          valid: false, 
          error: 'Yetersiz nakit tutarı!' 
        };
      }
    }

    return { valid: true };
  }

  /**
   * Calculate change for cash payment
   */
  static calculateChange(total: number, cashReceived: number): number {
    return Math.max(0, cashReceived - total);
  }

  /**
   * Generate receipt data
   */
  static generateReceiptData(sale: Sale) {
    return {
      invoiceNo: sale.id,
      date: new Date(sale.date).toLocaleString('tr-TR'),
      items: sale.items,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      customerName: sale.customerName || 'Bireysel',
    };
  }
}

