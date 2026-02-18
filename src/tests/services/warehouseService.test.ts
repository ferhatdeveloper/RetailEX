/**
 * Warehouse Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WarehouseService } from '../../services/warehouseService';

describe('WarehouseService', () => {
  let service: WarehouseService;

  beforeEach(() => {
    service = new WarehouseService();
  });

  describe('Warehouse Management', () => {
    it('should get all warehouses', () => {
      const warehouses = service.getWarehouses();

      expect(warehouses.length).toBeGreaterThan(0);
      expect(warehouses[0]).toHaveProperty('id');
      expect(warehouses[0]).toHaveProperty('name');
    });

    it('should get warehouse by ID', () => {
      const warehouses = service.getWarehouses();
      const warehouse = service.getWarehouse(warehouses[0].id);

      expect(warehouse).toBeDefined();
      expect(warehouse?.id).toBe(warehouses[0].id);
    });
  });

  describe('Stock Availability', () => {
    it('should check stock availability', () => {
      const result = service.checkAvailability('wh-001', 'prod-1', 10);

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('current');
    });
  });

  describe('Transfer Creation', () => {
    it('should create transfer successfully', async () => {
      const result = await service.createTransfer(
        'wh-001',
        'wh-002',
        [
          {
            product_id: 'prod-1',
            product_code: 'P001',
            product_name: 'Ürün 1',
            quantity: 10,
            unit_price: 100,
            line_total: 1000
          }
        ],
        'user-1',
        'Test transfer'
      );

      expect(result.success).toBe(true);
      expect(result.transfer).toBeDefined();
      expect(result.transfer?.items).toHaveLength(1);
    });

    it('should fail if warehouse not found', async () => {
      const result = await service.createTransfer(
        'invalid-wh',
        'wh-002',
        [],
        'user-1'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Geçersiz depo');
    });
  });

  describe('Transfer Status Management', () => {
    it('should approve transfer', async () => {
      // Create transfer first
      const createResult = await service.createTransfer(
        'wh-001',
        'wh-002',
        [
          {
            product_id: 'prod-1',
            product_code: 'P001',
            product_name: 'Ürün 1',
            quantity: 5,
            unit_price: 100,
            line_total: 500
          }
        ],
        'user-1'
      );

      if (createResult.transfer?.status === 'PENDING_APPROVAL') {
        const result = await service.approveTransfer(createResult.transfer.id, 'manager-1');

        expect(result.success).toBe(true);
      }
    });

    it('should process transfer', async () => {
      const createResult = await service.createTransfer(
        'wh-001',
        'wh-002',
        [
          {
            product_id: 'prod-1',
            product_code: 'P001',
            product_name: 'Ürün 1',
            quantity: 3,
            unit_price: 100,
            line_total: 300
          }
        ],
        'user-1'
      );

      if (createResult.transfer) {
        const result = await service.processTransfer(createResult.transfer.id);

        expect(result.success).toBe(true);
      }
    });
  });

  describe('Transfer State', () => {
    it('should get correct state info', () => {
      const draftState = service.getTransferStateInfo('DRAFT');

      expect(draftState.canEdit).toBe(true);
      expect(draftState.canApprove).toBe(true);

      const completedState = service.getTransferStateInfo('COMPLETED');

      expect(completedState.canEdit).toBe(false);
      expect(completedState.canCancel).toBe(false);
    });
  });

  describe('Stock Adjustment', () => {
    it('should adjust stock', async () => {
      const result = await service.adjustStock(
        'wh-001',
        'prod-1',
        10,
        'Inventory correction',
        'user-1'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Stock Movements', () => {
    it('should get stock movements', () => {
      const movements = service.getMovements();

      expect(Array.isArray(movements)).toBe(true);
    });

    it('should filter movements by warehouse', () => {
      const movements = service.getMovements('wh-001');

      movements.forEach(m => {
        expect(m.warehouse_id).toBe('wh-001');
      });
    });
  });
});

