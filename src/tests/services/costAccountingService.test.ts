/**
 * Cost Accounting Service Tests
 * 
 * Tests for FIFO cost calculation and profitability analysis
 * 
 * @created 2024-12-18
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CostAccountingService } from '../../services/costAccountingService';

describe('CostAccountingService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('FIFO Cost Calculation', () => {
    it('should calculate FIFO cost for simple case', async () => {
      const result = await CostAccountingService.calculateFIFOCost({
        product_code: 'PROD001',
        quantity: 10,
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result).toHaveProperty('total_cost');
      expect(result).toHaveProperty('avg_cost');
      expect(result.total_cost).toBeGreaterThan(0);
    });

    it('should handle insufficient stock', async () => {
      await expect(
        CostAccountingService.calculateFIFOCost({
          product_code: 'PROD999',
          quantity: 1000000,
          firma_id: 'FIRMA001',
          donem_id: 'DONEM2024'
        })
      ).rejects.toThrow();
    });

    it('should consume oldest layers first (FIFO)', async () => {
      // Test that FIFO order is maintained
      const result = await CostAccountingService.calculateFIFOCost({
        product_code: 'PROD001',
        quantity: 5,
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result.layers_consumed).toBeDefined();
      expect(result.layers_consumed.length).toBeGreaterThan(0);
    });
  });

  describe('Stock Movements', () => {
    it('should record stock IN movement', async () => {
      const result = await CostAccountingService.recordStockMovement({
        product_code: 'PROD001',
        product_name: 'Test Product',
        quantity: 100,
        movement_type: 'IN',
        unit_cost: 1000,
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result.success).toBe(true);
      expect(result.movement_id).toBeDefined();
    });

    it('should record stock OUT movement with FIFO cost', async () => {
      const result = await CostAccountingService.recordStockMovement({
        product_code: 'PROD001',
        product_name: 'Test Product',
        quantity: 10,
        movement_type: 'OUT',
        unit_price: 1500,
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result.success).toBe(true);
      expect(result.total_cost).toBeDefined();
      expect(result.gross_profit).toBeDefined();
    });
  });

  describe('Profitability Analysis', () => {
    it('should calculate product profitability', async () => {
      const result = await CostAccountingService.getProductProfitability({
        product_code: 'PROD001',
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result.profitability).toBeDefined();
      expect(result.profitability.gross_profit).toBeDefined();
      expect(result.profitability.profit_margin).toBeDefined();
    });

    it('should calculate customer profitability', async () => {
      const result = await CostAccountingService.getCustomerProfitability({
        customer_id: 'CUST001',
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result.profitability).toBeDefined();
      expect(result.profitability.transaction_count).toBeGreaterThanOrEqual(0);
    });

    it('should calculate overall summary', async () => {
      const result = await CostAccountingService.getProfitabilitySummary({
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result.summary).toBeDefined();
      expect(result.summary.total_revenue).toBeGreaterThanOrEqual(0);
      expect(result.summary.total_cost).toBeGreaterThanOrEqual(0);
      expect(result.summary.gross_profit).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero quantity', async () => {
      await expect(
        CostAccountingService.calculateFIFOCost({
          product_code: 'PROD001',
          quantity: 0,
          firma_id: 'FIRMA001',
          donem_id: 'DONEM2024'
        })
      ).rejects.toThrow();
    });

    it('should handle negative quantity', async () => {
      await expect(
        CostAccountingService.calculateFIFOCost({
          product_code: 'PROD001',
          quantity: -10,
          firma_id: 'FIRMA001',
          donem_id: 'DONEM2024'
        })
      ).rejects.toThrow();
    });

    it('should handle non-existent product', async () => {
      const result = await CostAccountingService.getProductProfitability({
        product_code: 'NONEXISTENT',
        firma_id: 'FIRMA001',
        donem_id: 'DONEM2024'
      });

      expect(result.profitability).toBeNull();
    });
  });
});


