/**
 * Business Calculation Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import * as calc from '../../shared/utils/calculations';
import { CartItem, Product, Campaign } from '../../core/types';

describe('Calculations Utility', () => {
    describe('calculateItemSubtotal', () => {
        it('should calculate quantity * price', () => {
            expect(calc.calculateItemSubtotal(2, 500)).toBe(1000);
            expect(calc.calculateItemSubtotal(0, 100)).toBe(0);
            expect(calc.calculateItemSubtotal(1.5, 100)).toBe(150);
        });
    });

    describe('calculateDiscountAmount', () => {
        it('should calculate percentage discount', () => {
            expect(calc.calculateDiscountAmount(1000, 'percentage', 10)).toBe(100);
            expect(calc.calculateDiscountAmount(1000, 'percentage', 0)).toBe(0);
            expect(calc.calculateDiscountAmount(1000, 'percentage', 100)).toBe(1000);
        });

        it('should return fixed discount', () => {
            expect(calc.calculateDiscountAmount(1000, 'fixed', 50)).toBe(50);
        });
    });

    describe('calculateTax', () => {
        it('should calculate tax based on amount and rate', () => {
            expect(calc.calculateTax(1000, 15)).toBe(150);
            expect(calc.calculateTax(1000, 0)).toBe(0);
        });
    });

    describe('calculateChange', () => {
        it('should calculate positive change', () => {
            expect(calc.calculateChange(1500, 2000)).toBe(500);
        });
        it('should return 0 if cash received is less than total', () => {
            expect(calc.calculateChange(1500, 1000)).toBe(0);
        });
    });

    describe('Cart Calculations', () => {
        const mockProduct: Product = {
            id: 'p1',
            name: 'Product 1',
            barcode: '123',
            price: 1000,
            cost: 500,
            stock: 10,
            category: 'Cat 1',
            unit: 'pcs',
            taxRate: 15
        };

        const cartItems: CartItem[] = [
            {
                product: mockProduct,
                quantity: 2,
                discount: 200,
                subtotal: 1800
            },
            {
                product: { ...mockProduct, id: 'p2', price: 500 },
                quantity: 1,
                discount: 0,
                subtotal: 500
            }
        ];

        it('should calculate cart subtotal (base prices * quantities)', () => {
            expect(calc.calculateCartSubtotal(cartItems)).toEqual(2500);
        });

        it('should calculate total items discount', () => {
            expect(calc.calculateCartTotalDiscount(cartItems)).toEqual(200);
        });

        it('should calculate cart final total', () => {
            expect(calc.calculateCartTotal(cartItems)).toEqual(2300);
        });
    });

    describe('Campaign Logic', () => {
        const mockCampaign: Campaign = {
            id: 'c1',
            name: 'Test Campaign',
            description: 'Test',
            type: 'percentage',
            discountValue: 10,
            startDate: '2020-01-01',
            endDate: '2099-12-31',
            active: true,
            minPurchase: 1000
        };

        it('should calculate campaign discount', () => {
            expect(calc.calculateCampaignDiscount(mockCampaign, 2000)).toBe(200);

            const fixedCampaign: Campaign = { ...mockCampaign, type: 'fixed', discountValue: 50 };
            expect(calc.calculateCampaignDiscount(fixedCampaign, 2000)).toBe(50);
        });

        it('should validate campaign applicability', () => {
            expect(calc.isCampaignApplicable(mockCampaign, 2000, [])).toBe(true);
            expect(calc.isCampaignApplicable(mockCampaign, 500, [])).toBe(false); // Below minPurchase

            const inactiveCampaign: Campaign = { ...mockCampaign, active: false };
            expect(calc.isCampaignApplicable(inactiveCampaign, 2000, [])).toBe(false);
        });
    });
});


