/**
 * Campaign Engine Tests
 * Test Framework: Vitest / Jest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CampaignEngine, Campaign, mockCampaigns } from '../../services/campaignEngine';
import { CartItem } from '../../components/pos/types';

describe('CampaignEngine', () => {
  let engine: CampaignEngine;
  let mockCart: CartItem[];

  beforeEach(() => {
    engine = new CampaignEngine();
    mockCart = [
      {
        id: 'prod-1',
        barcode: '1234567890',
        name: 'Ürün 1',
        price: 100,
        quantity: 2,
        taxRate: 18
      },
      {
        id: 'prod-2',
        barcode: '0987654321',
        name: 'Ürün 2',
        price: 50,
        quantity: 1,
        taxRate: 18
      }
    ];
  });

  describe('Percentage Discount Campaign', () => {
    it('should apply 20% discount correctly', async () => {
      const campaign: Campaign = {
        ...mockCampaigns[0],
        discountRate: 20,
        minBasketAmount: 100
      };

      const results = await engine.applyCampaigns([campaign], mockCart);

      expect(results).toHaveLength(1);
      expect(results[0].applied).toBe(true);
      expect(results[0].discount_amount).toBe(50); // 250 * 0.2
    });

    it('should not apply if basket below minimum', async () => {
      const campaign: Campaign = {
        ...mockCampaigns[0],
        minBasketAmount: 1000
      };

      const results = await engine.applyCampaigns([campaign], mockCart);

      expect(results[0].applied).toBe(false);
      expect(results[0].message).toContain('Minimum sepet tutarı');
    });
  });

  describe('Buy X Get Y Campaign', () => {
    it('should calculate free items correctly', async () => {
      const cart: CartItem[] = [
        { id: 'prod-1', barcode: '123', name: 'Ürün', price: 100, quantity: 3, taxRate: 18 }
      ];

      const campaign: Campaign = {
        ...mockCampaigns[2],
        buyQuantity: 2,
        getQuantity: 1
      };

      const results = await engine.applyCampaigns([campaign], cart);

      expect(results[0].applied).toBe(true);
      expect(results[0].discount_amount).toBe(100); // 1 free item
    });
  });

  describe('Time-based Campaign', () => {
    it('should validate time correctly', async () => {
      const now = new Date();
      const currentHour = now.getHours();

      const campaign: Campaign = {
        ...mockCampaigns[1],
        startTime: `${String(currentHour - 1).padStart(2, '0')}:00`,
        endTime: `${String(currentHour + 1).padStart(2, '0')}:00`
      };

      const results = await engine.applyCampaigns([campaign], mockCart);

      expect(results[0].applied).toBe(true);
    });
  });

  describe('Coupon Validation', () => {
    it('should validate TEST10 coupon', async () => {
      const result = await engine.validateCoupon('TEST10');

      expect(result.valid).toBe(true);
      expect(result.coupon).toBeDefined();
      expect(result.coupon?.code).toBe('TEST10');
    });

    it('should reject invalid coupon', async () => {
      const result = await engine.validateCoupon('INVALID');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Geçersiz');
    });
  });

  describe('Loyalty Points', () => {
    it('should calculate loyalty points correctly', () => {
      const points = engine.calculateLoyaltyPoints(1000, {
        id: 'loy-1',
        name: 'Test',
        points_per_lira: 1,
        points_redemption_rate: 0.1,
        tiers: []
      });

      expect(points).toBe(1000);
    });

    it('should get correct loyalty tier', () => {
      const tier = engine.getLoyaltyTier(5500, {
        id: 'loy-1',
        name: 'Test',
        points_per_lira: 1,
        points_redemption_rate: 0.1,
        tiers: [
          { name: 'Bronz', min_points: 0, discount_rate: 0, benefits: [] },
          { name: 'Gümüş', min_points: 1000, discount_rate: 5, benefits: [] },
          { name: 'Altın', min_points: 5000, discount_rate: 10, benefits: [] }
        ]
      });

      expect(tier?.name).toBe('Altın');
      expect(tier?.discount_rate).toBe(10);
    });
  });

  describe('Campaign Stacking', () => {
    it('should stack campaigns when allowed', async () => {
      const campaigns: Campaign[] = [
        { ...mockCampaigns[0], canStackWithOthers: true, priority: 10 },
        { ...mockCampaigns[1], canStackWithOthers: true, priority: 5 }
      ];

      const results = await engine.applyCampaigns(campaigns, mockCart);

      const appliedCount = results.filter(r => r.applied).length;
      expect(appliedCount).toBeGreaterThan(1);
    });

    it('should not stack when not allowed', async () => {
      const campaigns: Campaign[] = [
        { ...mockCampaigns[0], canStackWithOthers: false, priority: 10 },
        { ...mockCampaigns[1], canStackWithOthers: true, priority: 5 }
      ];

      const results = await engine.applyCampaigns(campaigns, mockCart);

      const appliedCount = results.filter(r => r.applied).length;
      expect(appliedCount).toBe(1); // Only first campaign applied
    });
  });
});

