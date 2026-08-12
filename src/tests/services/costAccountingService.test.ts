/**
 * CostAccountingService — mevcut public API ile uyumlu duman testleri
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CostAccountingService } from '../../services/costAccountingService';

describe('CostAccountingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordStockMovement çağrısı tanımlı alanlarla sonuç nesnesi döner', async () => {
    const result = await CostAccountingService.recordStockMovement({
      firma_id: '1',
      donem_id: '1',
      product_id: 'p1',
      product_code: 'PROD001',
      product_name: 'Test',
      quantity: 1,
      movement_type: 'IN',
      unit_cost: 10,
      total_cost: 10,
      document_no: 'DOC-1',
      movement_date: new Date().toISOString().slice(0, 10),
      document_type: 'STOCK_ADJUSTMENT',
    });
    expect(result).toHaveProperty('success');
  });
});
