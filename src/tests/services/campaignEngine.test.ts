/**
 * Campaign Engine Tests
 * Test Framework: Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CampaignEngine, Campaign, mockCampaigns } from '../../services/campaignEngine';
import { CartItem } from '../../components/pos/types';
import type { Product } from '../../core/types/models';

function mkProduct(partial: Partial<Product> & Pick<Product, 'id' | 'name' | 'price'>): Product {
  return {
    barcode: partial.barcode ?? '0',
    cost: partial.cost ?? 0,
    stock: partial.stock ?? 0,
    category: partial.category ?? 'Genel',
    unit: partial.unit ?? 'Adet',
    taxRate: partial.taxRate ?? 18,
    ...partial,
  };
}

describe('CampaignEngine', () => {
  let engine: CampaignEngine;
  let mockCart: CartItem[];

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    engine = new CampaignEngine();
    mockCart = [
      {
        product: mkProduct({ id: 'prod-1', name: 'Ürün 1', price: 100 }),
        quantity: 2,
        discount: 0,
        subtotal: 200,
        price: 100,
      },
      {
        product: mkProduct({ id: 'prod-2', name: 'Ürün 2', price: 50 }),
        quantity: 1,
        discount: 0,
        subtotal: 50,
        price: 50,
      },
    ];
  });

  describe('Percentage Discount Campaign', () => {
    it('should apply 20% discount correctly', async () => {
      const campaign: Campaign = {
        ...mockCampaigns[0],
        discountRate: 20,
        minBasketAmount: 100,
      };

      const results = await engine.applyCampaigns([campaign], mockCart);

      expect(results).toHaveLength(1);
      expect(results[0].applied).toBe(true);
      expect(results[0].discount_amount).toBe(50);
    });

    it('should not apply if basket below minimum', async () => {
      const campaign: Campaign = {
        ...mockCampaigns[0],
        minBasketAmount: 1000,
      };

      const results = await engine.applyCampaigns([campaign], mockCart);

      expect(results[0].applied).toBe(false);
      expect(results[0].message).toContain('Minimum sepet tutarı');
    });
  });

  describe('Buy X Get Y Campaign', () => {
    it('should calculate free items correctly', async () => {
      const cart: CartItem[] = [
        {
          product: mkProduct({ id: 'prod-1', name: 'Ürün', price: 100 }),
          quantity: 3,
          discount: 0,
          subtotal: 300,
          price: 100,
        },
      ];

      const campaign: Campaign = {
        ...mockCampaigns[2],
        buyQuantity: 2,
        getQuantity: 1,
      };

      const results = await engine.applyCampaigns([campaign], cart);

      expect(results[0].applied).toBe(true);
      expect(results[0].discount_amount).toBe(100);
    });
  });

  describe('Time-based Campaign', () => {
    it('should validate time correctly', async () => {
      vi.useFakeTimers();
      // Pazartesi 10:30 — validDays [1..5] ve 09:00–11:00 aralığı içinde
      vi.setSystemTime(new Date('2026-05-18T10:30:00'));

      const campaign: Campaign = {
        ...mockCampaigns[1],
        startTime: '09:00',
        endTime: '11:00',
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
        tiers: [],
      });

      expect(points).toBe(1000);
    });
  });
});
