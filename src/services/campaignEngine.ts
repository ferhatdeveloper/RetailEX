/**
 * Advanced Campaign Engine
 * Pattern: Strategy Pattern + Chain of Responsibility
 * Features: Coupons, Loyalty, Time-based, Segmentation
 */

import { CartItem } from '../components/pos/types';

// Campaign Types
export type CampaignType = 
  | 'PERCENTAGE_DISCOUNT'
  | 'AMOUNT_DISCOUNT'
  | 'BUY_X_GET_Y'
  | 'BASKET_DISCOUNT'
  | 'COUPON'
  | 'LOYALTY_POINTS'
  | 'TIME_BASED'
  | 'SEGMENT_BASED';

export type CampaignTrigger = 'MANUAL' | 'AUTO' | 'COUPON';

// Campaign Configuration
export interface Campaign {
  id: string;
  code?: string;
  name: string;
  type?: CampaignType;
  trigger?: CampaignTrigger;
  
  // New comprehensive fields
  description: string;
  campaignType?: 'product' | 'category' | 'cart' | 'customer';
  discountType: 'percentage' | 'fixed' | 'buyXgetY';
  discountValue: number;
  
  // Discount
  discountRate?: number;                              // %10, %20
  discountAmount?: number;                            // 50 IQD, 100 IQD
  maxDiscountAmount?: number;                         // Max discount limit
  minPurchaseAmount?: number;                         // Min purchase amount
  
  // Buy X Get Y
  buyQuantity?: number;
  getQuantity?: number;
  targetProducts?: string[];                          // Product IDs
  
  // Basket conditions
  minBasketAmount?: number;
  minQuantity?: number;
  
  // Loyalty
  loyaltyPointsRequired?: number;
  loyaltyPointsEarned?: number;
  
  // Time-based
  startTime?: string;                                 // "09:00"
  endTime?: string;                                   // "11:00"
  validDays?: number[];                               // [1,2,3,4,5] (Monday-Friday)
  
  // Segment
  customerSegments?: string[];                        // ['VIP', 'GOLD']
  customerTypes?: string[];                           // ['retail', 'wholesale']
  applyToAllCustomers?: boolean;
  
  // Validity
  startDate: string;
  endDate: string;
  is_active?: boolean;
  active: boolean;
  
  // Product & Category selection
  productIds: string[];
  selectedCategories?: string[];
  
  // Limits
  maxUsagePerCustomer?: number;
  maxTotalUsage?: number;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  currentUsage?: number;
  
  // Stacking
  canStackWithOthers?: boolean;
  stackable?: boolean;
  priority?: number;                                   // Higher = first applied
  
  // Multi-language support
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

// Coupon
export interface Coupon {
  code: string;
  campaign_id: string;
  customer_id?: string;                               // null = public coupon
  usage_limit: number;
  usage_count: number;
  expires_at: string;
  is_active: boolean;
}

// Loyalty Program
export interface LoyaltyProgram {
  id: string;
  name: string;
  points_per_lira: number;                            // 1 IQD = X puan
  points_redemption_rate: number;                     // 100 puan = X IQD
  tiers: LoyaltyTier[];
}

export interface LoyaltyTier {
  name: string;
  min_points: number;
  discount_rate: number;
  benefits: string[];
}

// Campaign Result
export interface CampaignResult {
  campaign_id: string;
  campaign_name: string;
  discount_amount: number;
  applied: boolean;
  message?: string;
  points_earned?: number;
  points_redeemed?: number;
}

/**
 * Campaign Validator (Chain of Responsibility)
 */
abstract class CampaignValidator {
  protected next: CampaignValidator | null = null;

  setNext(validator: CampaignValidator): CampaignValidator {
    this.next = validator;
    return validator;
  }

  async validate(
    campaign: Campaign,
    cart: CartItem[],
    customer?: any,
    context?: any
  ): Promise<{ valid: boolean; message?: string }> {
    const result = await this.check(campaign, cart, customer, context);
    
    if (!result.valid) {
      return result;
    }

    if (this.next) {
      return this.next.validate(campaign, cart, customer, context);
    }

    return { valid: true };
  }

  protected abstract check(
    campaign: Campaign,
    cart: CartItem[],
    customer?: any,
    context?: any
  ): Promise<{ valid: boolean; message?: string }>;
}

// Date validator
class DateValidator extends CampaignValidator {
  protected async check(campaign: Campaign): Promise<{ valid: boolean; message?: string }> {
    const now = new Date();
    const start = new Date(campaign.startDate);
    const end = new Date(campaign.endDate);

    if (now < start || now > end) {
      return { valid: false, message: 'Kampanya tarihleri geçersiz' };
    }

    return { valid: true };
  }
}

// Time validator
class TimeValidator extends CampaignValidator {
  protected async check(campaign: Campaign): Promise<{ valid: boolean; message?: string }> {
    if (!campaign.startTime || !campaign.endTime) {
      return { valid: true };
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = campaign.startTime.split(':').map(Number);
    const [endHour, endMin] = campaign.endTime.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (currentTime < startTime || currentTime > endTime) {
      return { valid: false, message: 'Kampanya saatleri dışında' };
    }

    // Check valid days
    if (campaign.validDays && campaign.validDays.length > 0) {
      const dayOfWeek = now.getDay();
      if (!campaign.validDays.includes(dayOfWeek)) {
        return { valid: false, message: 'Bu gün kampanya geçerli değil' };
      }
    }

    return { valid: true };
  }
}

// Basket validator
class BasketValidator extends CampaignValidator {
  protected async check(campaign: Campaign, cart: CartItem[]): Promise<{ valid: boolean; message?: string }> {
    if (campaign.minBasketAmount) {
      const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      
      if (total < campaign.minBasketAmount) {
        return { 
          valid: false, 
          message: `Minimum sepet tutarı ${campaign.minBasketAmount}` 
        };
      }
    }

    if (campaign.minQuantity) {
      const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
      
      if (totalQty < campaign.minQuantity) {
        return { 
          valid: false, 
          message: `Minimum ${campaign.minQuantity} ürün gerekli` 
        };
      }
    }

    return { valid: true };
  }
}

// Customer segment validator
class SegmentValidator extends CampaignValidator {
  protected async check(
    campaign: Campaign,
    cart: CartItem[],
    customer?: any
  ): Promise<{ valid: boolean; message?: string }> {
    if (!customer && (campaign.customerSegments || campaign.customerTypes)) {
      return { valid: false, message: 'Müşteri girişi gerekli' };
    }

    if (campaign.customerSegments && customer) {
      if (!campaign.customerSegments.includes(customer.segment)) {
        return { valid: false, message: 'Müşteri segmenti uygun değil' };
      }
    }

    if (campaign.customerTypes && customer) {
      if (!campaign.customerTypes.includes(customer.customer_type)) {
        return { valid: false, message: 'Müşteri tipi uygun değil' };
      }
    }

    return { valid: true };
  }
}

// Usage limit validator
class UsageLimitValidator extends CampaignValidator {
  protected async check(
    campaign: Campaign,
    cart: CartItem[],
    customer?: any
  ): Promise<{ valid: boolean; message?: string }> {
    if (campaign.maxTotalUsage && campaign.currentUsage >= campaign.maxTotalUsage) {
      return { valid: false, message: 'Kampanya kullanım limiti doldu' };
    }

    // Check per-customer limit (requires database check in production)
    if (campaign.maxUsagePerCustomer && customer) {
      // TODO: Check database for customer usage count
      // For now, assume it's valid
    }

    return { valid: true };
  }
}

/**
 * Campaign Strategy Interface
 */
interface CampaignStrategy {
  calculate(campaign: Campaign, cart: CartItem[], customer?: any): number;
}

// Percentage discount
class PercentageDiscountStrategy implements CampaignStrategy {
  calculate(campaign: Campaign, cart: CartItem[]): number {
    if (!campaign.discountRate) return 0;
    
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return subtotal * (campaign.discountRate / 100);
  }
}

// Amount discount
class AmountDiscountStrategy implements CampaignStrategy {
  calculate(campaign: Campaign): number {
    return campaign.discountAmount || 0;
  }
}

// Buy X Get Y
class BuyXGetYStrategy implements CampaignStrategy {
  calculate(campaign: Campaign, cart: CartItem[]): number {
    if (!campaign.buyQuantity || !campaign.getQuantity) return 0;
    
    // Find qualifying products
    let qualifyingItems = cart;
    if (campaign.targetProducts && campaign.targetProducts.length > 0) {
      qualifyingItems = cart.filter(item => 
        campaign.targetProducts!.includes(item.id)
      );
    }

    const totalQty = qualifyingItems.reduce((sum, item) => sum + item.quantity, 0);
    const sets = Math.floor(totalQty / campaign.buyQuantity);
    
    if (sets === 0) return 0;

    // Sort by price descending (free cheapest items)
    const sortedItems = [...qualifyingItems].sort((a, b) => b.price - a.price);
    
    // Calculate discount (free items)
    const freeItemsCount = sets * campaign.getQuantity;
    let discount = 0;
    let remaining = freeItemsCount;

    for (const item of sortedItems.reverse()) {
      if (remaining === 0) break;
      
      const itemsToDiscount = Math.min(item.quantity, remaining);
      discount += item.price * itemsToDiscount;
      remaining -= itemsToDiscount;
    }

    return discount;
  }
}

// Loyalty points
class LoyaltyPointsStrategy implements CampaignStrategy {
  calculate(campaign: Campaign, cart: CartItem[], customer?: any): number {
    if (!campaign.loyaltyPointsRequired || !customer) return 0;
    
    // Check if customer has enough points
    if (customer.loyalty_points < campaign.loyaltyPointsRequired) {
      return 0;
    }

    // Return discount amount based on points
    // Assume 100 points = 10 TL
    const redemptionRate = 0.1; // 1 point = 0.1 TL
    return campaign.loyaltyPointsRequired * redemptionRate;
  }
}

/**
 * Campaign Engine (Facade)
 */
export class CampaignEngine {
  private strategies: Map<CampaignType, CampaignStrategy>;
  private validatorChain: CampaignValidator;

  constructor() {
    // Initialize strategies
    this.strategies = new Map([
      ['PERCENTAGE_DISCOUNT', new PercentageDiscountStrategy()],
      ['AMOUNT_DISCOUNT', new AmountDiscountStrategy()],
      ['BUY_X_GET_Y', new BuyXGetYStrategy()],
      ['BASKET_DISCOUNT', new PercentageDiscountStrategy()],
      ['LOYALTY_POINTS', new LoyaltyPointsStrategy()]
    ]);

    // Build validator chain
    const dateValidator = new DateValidator();
    const timeValidator = new TimeValidator();
    const basketValidator = new BasketValidator();
    const segmentValidator = new SegmentValidator();
    const usageLimitValidator = new UsageLimitValidator();

    dateValidator
      .setNext(timeValidator)
      .setNext(basketValidator)
      .setNext(segmentValidator)
      .setNext(usageLimitValidator);

    this.validatorChain = dateValidator;
  }

  /**
   * Apply campaigns to cart
   */
  async applyCampaigns(
    campaigns: Campaign[],
    cart: CartItem[],
    customer?: any
  ): Promise<CampaignResult[]> {
    const results: CampaignResult[] = [];

    // Sort by priority (highest first)
    const sortedCampaigns = [...campaigns].sort((a, b) => b.priority - a.priority);

    for (const campaign of sortedCampaigns) {
      if (!campaign.is_active) continue;

      // Validate campaign
      const validation = await this.validatorChain.validate(campaign, cart, customer);
      
      if (!validation.valid) {
        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          discount_amount: 0,
          applied: false,
          message: validation.message
        });
        continue;
      }

      // Calculate discount
      const strategy = this.strategies.get(campaign.type);
      if (!strategy) continue;

      const discount = strategy.calculate(campaign, cart, customer);

      results.push({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        discount_amount: discount,
        applied: discount > 0,
        message: discount > 0 ? 'Kampanya uygulandı' : 'İndirim hesaplanamadı'
      });

      // If campaign doesn't stack, break
      if (!campaign.canStackWithOthers && discount > 0) {
        break;
      }
    }

    return results;
  }

  /**
   * Validate coupon code
   */
  async validateCoupon(
    couponCode: string,
    customer?: any
  ): Promise<{ valid: boolean; coupon?: Coupon; message?: string }> {
    // TODO: Check database for coupon
    // Mock implementation
    if (couponCode === 'TEST10') {
      return {
        valid: true,
        coupon: {
          code: 'TEST10',
          campaign_id: 'camp-001',
          usage_limit: 100,
          usage_count: 5,
          expires_at: '2025-12-31',
          is_active: true
        }
      };
    }

    return { valid: false, message: 'Geçersiz kupon kodu' };
  }

  /**
   * Calculate loyalty points
   */
  calculateLoyaltyPoints(
    amount: number,
    loyaltyProgram: LoyaltyProgram
  ): number {
    return Math.floor(amount * loyaltyProgram.points_per_lira);
  }

  /**
   * Get loyalty tier
   */
  getLoyaltyTier(
    points: number,
    loyaltyProgram: LoyaltyProgram
  ): LoyaltyTier | null {
    const sortedTiers = [...loyaltyProgram.tiers].sort((a, b) => b.min_points - a.min_points);
    
    for (const tier of sortedTiers) {
      if (points >= tier.min_points) {
        return tier;
      }
    }

    return null;
  }
}

// Mock campaigns
export const mockCampaigns: Campaign[] = [
  {
    id: 'camp-001',
    code: 'SUMMER20',
    name: 'Yaz İndirimi %20',
    type: 'PERCENTAGE_DISCOUNT',
    trigger: 'AUTO',
    discountRate: 20,
    minBasketAmount: 100,
    startDate: '2025-06-01',
    endDate: '2025-08-31',
    is_active: true,
    currentUsage: 0,
    canStackWithOthers: false,
    priority: 10
  },
  {
    id: 'camp-002',
    code: 'MORNING50',
    name: 'Sabah İndirimi 50',
    type: 'AMOUNT_DISCOUNT',
    trigger: 'AUTO',
    discountAmount: 50,
    minBasketAmount: 200,
    startTime: '09:00',
    endTime: '11:00',
    validDays: [1, 2, 3, 4, 5],
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    is_active: true,
    currentUsage: 0,
    canStackWithOthers: true,
    priority: 5
  },
  {
    id: 'camp-003',
    code: '2AL1ALA',
    name: '2 Al 1 Öde',
    type: 'BUY_X_GET_Y',
    trigger: 'AUTO',
    buyQuantity: 2,
    getQuantity: 1,
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    is_active: true,
    currentUsage: 0,
    canStackWithOthers: false,
    priority: 15
  },
  {
    id: 'camp-004',
    code: 'VIP10',
    name: 'VIP Müşteri %10',
    type: 'SEGMENT_BASED',
    trigger: 'AUTO',
    discountRate: 10,
    customerSegments: ['VIP', 'GOLD'],
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    is_active: true,
    currentUsage: 0,
    canStackWithOthers: true,
    priority: 20
  }
];

// Mock loyalty program
export const mockLoyaltyProgram: LoyaltyProgram = {
  id: 'loyalty-001',
  name: 'RetailOS Sadakat Programı',
  points_per_lira: 1,                                 // 1 TL = 1 puan
  points_redemption_rate: 0.1,                        // 1 puan = 0.1 TL
  tiers: [
    {
      name: 'Bronz',
      min_points: 0,
      discount_rate: 0,
      benefits: ['Puan kazanma']
    },
    {
      name: 'Gümüş',
      min_points: 1000,
      discount_rate: 5,
      benefits: ['%5 indirim', 'Doğum günü hediyesi']
    },
    {
      name: 'Altın',
      min_points: 5000,
      discount_rate: 10,
      benefits: ['%10 indirim', 'Ücretsiz kargo', 'Özel fırsatlar']
    },
    {
      name: 'Platinum',
      min_points: 10000,
      discount_rate: 15,
      benefits: ['%15 indirim', 'Kişisel danışman', 'Erken erişim']
    }
  ]
};

// Singleton instance
export const campaignEngine = new CampaignEngine();
