/**
 * Customer Segmentation & Loyalty Service
 * Pattern: Strategy Pattern + Observer Pattern
 * Features: RFM analysis, segmentation, loyalty tiers, automated campaigns
 */

import { Customer, Sale } from '../App';

// Customer Segments
export type CustomerSegment = 
  | 'VIP'           // En değerli müşteriler
  | 'GOLD'          // Sadık müşteriler
  | 'SILVER'        // Orta seviye
  | 'BRONZE'        // Yeni müşteriler
  | 'AT_RISK'       // Kayıp olma riski
  | 'LOST'          // Kayıp müşteriler
  | 'DORMANT';      // Pasif müşteriler

// RFM Score
export interface RFMScore {
  recency: number;        // 1-5 (5 = en son alışveriş)
  frequency: number;      // 1-5 (5 = en sık)
  monetary: number;       // 1-5 (5 = en yüksek harcama)
  total: number;          // Toplam skor (3-15)
}

// Customer Analytics
export interface CustomerAnalytics {
  customer_id: string;
  segment: CustomerSegment;
  rfm_score: RFMScore;
  lifetime_value: number;
  total_purchases: number;
  total_spent: number;
  average_order_value: number;
  days_since_last_purchase: number;
  purchase_frequency: number;                         // Purchases per month
  predicted_churn_risk: number;                       // 0-100%
  loyalty_points: number;
  loyalty_tier: LoyaltyTier;
  recommendations: string[];
}

// Loyalty Tier
export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export interface LoyaltyTierConfig {
  tier: LoyaltyTier;
  min_points: number;
  discount_rate: number;
  benefits: string[];
  color: string;
  icon: string;
}

// Loyalty Transaction
export interface LoyaltyTransaction {
  id: string;
  customer_id: string;
  type: 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST';
  points: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: string;
  description: string;
  created_at: string;
  expires_at?: string;
}

// Segment Rules
export interface SegmentRule {
  segment: CustomerSegment;
  conditions: {
    min_rfm?: number;
    max_rfm?: number;
    min_purchases?: number;
    max_days_since_purchase?: number;
    min_lifetime_value?: number;
  };
  priority: number;
}

/**
 * Segmentation Strategy Interface
 */
interface SegmentationStrategy {
  segment(customer: Customer, analytics: Partial<CustomerAnalytics>): CustomerSegment;
}

/**
 * RFM Segmentation Strategy
 */
class RFMSegmentationStrategy implements SegmentationStrategy {
  private rules: SegmentRule[] = [
    {
      segment: 'VIP',
      conditions: { min_rfm: 13, min_lifetime_value: 50000 },
      priority: 1
    },
    {
      segment: 'GOLD',
      conditions: { min_rfm: 11, min_purchases: 10 },
      priority: 2
    },
    {
      segment: 'SILVER',
      conditions: { min_rfm: 8, min_purchases: 5 },
      priority: 3
    },
    {
      segment: 'AT_RISK',
      conditions: { max_rfm: 7, max_days_since_purchase: 90 },
      priority: 4
    },
    {
      segment: 'LOST',
      conditions: { max_days_since_purchase: 180 },
      priority: 5
    },
    {
      segment: 'BRONZE',
      conditions: {},
      priority: 6
    }
  ];

  segment(customer: Customer, analytics: Partial<CustomerAnalytics>): CustomerSegment {
    // Sort by priority and find first matching rule
    const sortedRules = [...this.rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (this.matchesRule(analytics, rule.conditions)) {
        return rule.segment;
      }
    }

    return 'BRONZE'; // Default
  }

  private matchesRule(
    analytics: Partial<CustomerAnalytics>,
    conditions: SegmentRule['conditions']
  ): boolean {
    if (conditions.min_rfm && (analytics.rfm_score?.total || 0) < conditions.min_rfm) {
      return false;
    }

    if (conditions.max_rfm && (analytics.rfm_score?.total || 0) > conditions.max_rfm) {
      return false;
    }

    if (conditions.min_purchases && (analytics.total_purchases || 0) < conditions.min_purchases) {
      return false;
    }

    if (conditions.max_days_since_purchase && 
        (analytics.days_since_last_purchase || 0) > conditions.max_days_since_purchase) {
      return false;
    }

    if (conditions.min_lifetime_value && 
        (analytics.lifetime_value || 0) < conditions.min_lifetime_value) {
      return false;
    }

    return true;
  }
}

/**
 * Loyalty Tier Manager
 */
class LoyaltyTierManager {
  private tiers: LoyaltyTierConfig[] = [
    {
      tier: 'BRONZE',
      min_points: 0,
      discount_rate: 0,
      benefits: ['Puan kazanma', 'Özel kampanyalar'],
      color: '#CD7F32',
      icon: 'ğŸ¥‰'
    },
    {
      tier: 'SILVER',
      min_points: 1000,
      discount_rate: 5,
      benefits: ['%5 indirim', 'Doğum günü hediyesi', 'Erken erişim'],
      color: '#C0C0C0',
      icon: 'ğŸ¥ˆ'
    },
    {
      tier: 'GOLD',
      min_points: 5000,
      discount_rate: 10,
      benefits: ['%10 indirim', 'Ücretsiz kargo', 'Öncelikli destek', 'Özel etkinlikler'],
      color: '#FFD700',
      icon: 'ğŸ¥‡'
    },
    {
      tier: 'PLATINUM',
      min_points: 10000,
      discount_rate: 15,
      benefits: ['%15 indirim', 'Kişisel danışman', 'VIP lounge', 'Yıllık hediye'],
      color: '#E5E4E2',
      icon: 'ğŸ’'
    },
    {
      tier: 'DIAMOND',
      min_points: 25000,
      discount_rate: 20,
      benefits: ['%20 indirim', 'Limitsiz avantajlar', 'Özel deneyimler', 'Concierge hizmet'],
      color: '#B9F2FF',
      icon: 'ğŸ’ '
    }
  ];

  getTier(points: number): LoyaltyTierConfig {
    const sortedTiers = [...this.tiers].sort((a, b) => b.min_points - a.min_points);
    
    for (const tier of sortedTiers) {
      if (points >= tier.min_points) {
        return tier;
      }
    }

    return this.tiers[0]; // Bronze
  }

  getAllTiers(): LoyaltyTierConfig[] {
    return this.tiers;
  }

  getNextTier(currentPoints: number): { 
    tier: LoyaltyTierConfig; 
    points_needed: number 
  } | null {
    const currentTier = this.getTier(currentPoints);
    const currentIndex = this.tiers.findIndex(t => t.tier === currentTier.tier);

    if (currentIndex === this.tiers.length - 1) {
      return null; // Already at highest tier
    }

    const nextTier = this.tiers[currentIndex + 1];
    return {
      tier: nextTier,
      points_needed: nextTier.min_points - currentPoints
    };
  }
}

/**
 * Customer Segmentation Service
 */
export class CustomerSegmentationService {
  private segmentationStrategy: SegmentationStrategy;
  private loyaltyTierManager: LoyaltyTierManager;
  private loyaltyTransactions: Map<string, LoyaltyTransaction[]> = new Map();
  private pointsPerLira: number = 1;                  // 1 TL = 1 puan
  private pointsRedemptionRate: number = 0.1;         // 1 puan = 0.1 TL

  constructor() {
    this.segmentationStrategy = new RFMSegmentationStrategy();
    this.loyaltyTierManager = new LoyaltyTierManager();
  }

  /**
   * Calculate RFM Score
   */
  calculateRFMScore(customer: Customer, sales: Sale[]): RFMScore {
    const customerSales = sales.filter(s => s.customerId === customer.id);

    if (customerSales.length === 0) {
      return { recency: 1, frequency: 1, monetary: 1, total: 3 };
    }

    // Recency (1-5, 5 = most recent)
    const lastPurchase = new Date(Math.max(...customerSales.map(s => new Date(s.date).getTime())));
    const daysSincePurchase = Math.floor((Date.now() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24));
    
    let recency = 5;
    if (daysSincePurchase > 180) recency = 1;
    else if (daysSincePurchase > 90) recency = 2;
    else if (daysSincePurchase > 30) recency = 3;
    else if (daysSincePurchase > 7) recency = 4;

    // Frequency (1-5, 5 = most frequent)
    const purchaseCount = customerSales.length;
    
    let frequency = 1;
    if (purchaseCount >= 50) frequency = 5;
    else if (purchaseCount >= 20) frequency = 4;
    else if (purchaseCount >= 10) frequency = 3;
    else if (purchaseCount >= 5) frequency = 2;

    // Monetary (1-5, 5 = highest spending)
    const totalSpent = customerSales.reduce((sum, s) => sum + s.total, 0);
    
    let monetary = 1;
    if (totalSpent >= 100000) monetary = 5;
    else if (totalSpent >= 50000) monetary = 4;
    else if (totalSpent >= 20000) monetary = 3;
    else if (totalSpent >= 5000) monetary = 2;

    return {
      recency,
      frequency,
      monetary,
      total: recency + frequency + monetary
    };
  }

  /**
   * Analyze customer
   */
  analyzeCustomer(customer: Customer, sales: Sale[]): CustomerAnalytics {
    const customerSales = sales.filter(s => s.customerId === customer.id);

    // Calculate RFM
    const rfm_score = this.calculateRFMScore(customer, sales);

    // Calculate metrics
    const total_purchases = customerSales.length;
    const total_spent = customerSales.reduce((sum, s) => sum + s.total, 0);
    const average_order_value = total_purchases > 0 ? total_spent / total_purchases : 0;

    const lastPurchase = customerSales.length > 0
      ? new Date(Math.max(...customerSales.map(s => new Date(s.date).getTime())))
      : null;

    const days_since_last_purchase = lastPurchase
      ? Math.floor((Date.now() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24))
      : 9999;

    // Calculate purchase frequency (purchases per month)
    const firstPurchase = customerSales.length > 0
      ? new Date(Math.min(...customerSales.map(s => new Date(s.date).getTime())))
      : null;

    const monthsSinceFirst = firstPurchase
      ? Math.max(1, Math.floor((Date.now() - firstPurchase.getTime()) / (1000 * 60 * 60 * 24 * 30)))
      : 1;

    const purchase_frequency = total_purchases / monthsSinceFirst;

    // Predict churn risk
    const predicted_churn_risk = this.predictChurnRisk(rfm_score, days_since_last_purchase);

    // Get loyalty info
    const loyalty_points = customer.loyalty_points || 0;
    const loyalty_tier_config = this.loyaltyTierManager.getTier(loyalty_points);

    // Determine segment
    const segment = this.segmentationStrategy.segment(customer, {
      rfm_score,
      total_purchases,
      lifetime_value: total_spent,
      days_since_last_purchase
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(segment, rfm_score, days_since_last_purchase);

    return {
      customer_id: customer.id,
      segment,
      rfm_score,
      lifetime_value: total_spent,
      total_purchases,
      total_spent,
      average_order_value,
      days_since_last_purchase,
      purchase_frequency,
      predicted_churn_risk,
      loyalty_points,
      loyalty_tier: loyalty_tier_config.tier,
      recommendations
    };
  }

  /**
   * Predict churn risk (0-100%)
   */
  private predictChurnRisk(rfm: RFMScore, daysSincePurchase: number): number {
    let risk = 0;

    // Low RFM score increases risk
    if (rfm.total <= 5) risk += 40;
    else if (rfm.total <= 8) risk += 20;

    // Long time since purchase increases risk
    if (daysSincePurchase > 180) risk += 50;
    else if (daysSincePurchase > 90) risk += 30;
    else if (daysSincePurchase > 60) risk += 15;

    return Math.min(100, risk);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    segment: CustomerSegment,
    rfm: RFMScore,
    daysSincePurchase: number
  ): string[] {
    const recommendations: string[] = [];

    if (segment === 'VIP') {
      recommendations.push('VIP özel deneyimler sun');
      recommendations.push('Kişisel danışman ata');
      recommendations.push('Yeni ürünlerde erken erişim');
    }

    if (segment === 'AT_RISK') {
      recommendations.push('Geri kazanma kampanyası gönder');
      recommendations.push('Özel indirim kodu ver');
      recommendations.push('Müşteri memnuniyeti anketi yap');
    }

    if (segment === 'LOST') {
      recommendations.push('Win-back kampanyası başlat');
      recommendations.push('Neden ayrıldığını öğren');
    }

    if (daysSincePurchase > 30) {
      recommendations.push(`${daysSincePurchase} gündür alışveriş yok - hatırlat`);
    }

    if (rfm.monetary >= 4) {
      recommendations.push('Yüksek harcama - premium ürünler öner');
    }

    return recommendations;
  }

  /**
   * Earn loyalty points
   */
  async earnPoints(
    customerId: string,
    amount: number,
    referenceType: string = 'PURCHASE',
    referenceId?: string
  ): Promise<LoyaltyTransaction> {
    const points = Math.floor(amount * this.pointsPerLira);

    // Get current balance
    const transactions = this.loyaltyTransactions.get(customerId) || [];
    const currentBalance = transactions.reduce((sum, t) => {
      return t.type === 'EARN' ? sum + t.points : sum - Math.abs(t.points);
    }, 0);

    // Create transaction
    const transaction: LoyaltyTransaction = {
      id: `loy-${Date.now()}`,
      customer_id: customerId,
      type: 'EARN',
      points,
      balance_after: currentBalance + points,
      reference_type: referenceType,
      reference_id: referenceId,
      description: `${amount.toFixed(2)} tutarında alışveriş için ${points} puan`,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
    };

    transactions.push(transaction);
    this.loyaltyTransactions.set(customerId, transactions);

    return transaction;
  }

  /**
   * Redeem points
   */
  async redeemPoints(
    customerId: string,
    points: number,
    description: string = 'Puan kullanımı'
  ): Promise<{ success: boolean; transaction?: LoyaltyTransaction; message?: string }> {
    const transactions = this.loyaltyTransactions.get(customerId) || [];
    const currentBalance = transactions.reduce((sum, t) => {
      return t.type === 'EARN' ? sum + t.points : sum - Math.abs(t.points);
    }, 0);

    if (currentBalance < points) {
      return { 
        success: false, 
        message: `Yetersiz puan. Mevcut: ${currentBalance}, Gerekli: ${points}` 
      };
    }

    const transaction: LoyaltyTransaction = {
      id: `loy-${Date.now()}`,
      customer_id: customerId,
      type: 'REDEEM',
      points: -points,
      balance_after: currentBalance - points,
      description,
      created_at: new Date().toISOString()
    };

    transactions.push(transaction);
    this.loyaltyTransactions.set(customerId, transactions);

    return { success: true, transaction };
  }

  /**
   * Get points balance
   */
  getPointsBalance(customerId: string): number {
    const transactions = this.loyaltyTransactions.get(customerId) || [];
    return transactions.reduce((sum, t) => {
      return t.type === 'EARN' ? sum + t.points : sum - Math.abs(t.points);
    }, 0);
  }

  /**
   * Get loyalty tier
   */
  getLoyaltyTier(points: number): LoyaltyTierConfig {
    return this.loyaltyTierManager.getTier(points);
  }

  /**
   * Get all tiers
   */
  getAllTiers(): LoyaltyTierConfig[] {
    return this.loyaltyTierManager.getAllTiers();
  }

  /**
   * Get next tier
   */
  getNextTier(currentPoints: number): ReturnType<LoyaltyTierManager['getNextTier']> {
    return this.loyaltyTierManager.getNextTier(currentPoints);
  }

  /**
   * Get loyalty transactions
   */
  getLoyaltyTransactions(customerId: string): LoyaltyTransaction[] {
    return this.loyaltyTransactions.get(customerId) || [];
  }

  /**
   * Bulk analyze customers
   */
  bulkAnalyze(customers: Customer[], sales: Sale[]): Map<string, CustomerAnalytics> {
    const results = new Map<string, CustomerAnalytics>();

    customers.forEach(customer => {
      const analytics = this.analyzeCustomer(customer, sales);
      results.set(customer.id, analytics);
    });

    return results;
  }

  /**
   * Get segment distribution
   */
  getSegmentDistribution(analytics: CustomerAnalytics[]): Map<CustomerSegment, number> {
    const distribution = new Map<CustomerSegment, number>();

    analytics.forEach(a => {
      const count = distribution.get(a.segment) || 0;
      distribution.set(a.segment, count + 1);
    });

    return distribution;
  }

  /**
   * Convert points to money
   */
  pointsToMoney(points: number): number {
    return points * this.pointsRedemptionRate;
  }

  /**
   * Convert money to points
   */
  moneyToPoints(amount: number): number {
    return Math.floor(amount * this.pointsPerLira);
  }
}

// Singleton instance
export const customerSegmentationService = new CustomerSegmentationService();

// Export types
export type { CustomerAnalytics, LoyaltyTierConfig, LoyaltyTransaction };

