/**
 * Export Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExportService, ChartDataService } from '../../services/exportService';
import { Sale, Product } from '../../App';

describe('ExportService', () => {
  let service: ExportService;
  let mockSales: Sale[];
  let mockProducts: Product[];

  beforeEach(() => {
    service = new ExportService();

    mockSales = [
      {
        id: 'sale-1',
        receiptNo: 'REC-001',
        date: new Date().toISOString(),
        items: [{ id: 'p1', name: 'Ürün 1', price: 100, quantity: 2, barcode: '123', taxRate: 18 }],
        subtotal: 200,
        discount: 0,
        tax: 36,
        total: 236,
        paymentMethod: 'cash',
        customerName: 'Test Customer',
        customerId: 'cust-1'
      }
    ];

    mockProducts = [
      {
        id: 'prod-1',
        code: 'P001',
        barcode: '1234567890',
        name: 'Ürün 1',
        category: 'Kategori 1',
        price: 100,
        stock: 50,
        taxRate: 18
      }
    ];
  });

  describe('Export Strategies', () => {
    it('should export sales to Excel format', async () => {
      await expect(
        service.exportSalesReport(mockSales, 'excel')
      ).resolves.not.toThrow();
    });

    it('should export products to PDF format', async () => {
      await expect(
        service.exportProductReport(mockProducts, 'pdf')
      ).resolves.not.toThrow();
    });

    it('should export to CSV format', async () => {
      await expect(
        service.exportCustom('Test', mockProducts, 'csv')
      ).resolves.not.toThrow();
    });
  });
});

describe('ChartDataService', () => {
  let service: ChartDataService;
  let mockSales: Sale[];
  let mockProducts: Product[];

  beforeEach(() => {
    service = new ChartDataService();

    mockSales = [
      {
        id: 'sale-1',
        receiptNo: 'REC-001',
        date: new Date().toISOString(),
        items: [{ id: 'p1', name: 'Ürün 1', price: 100, quantity: 2, barcode: '123', taxRate: 18 }],
        subtotal: 200,
        discount: 0,
        tax: 36,
        total: 236,
        paymentMethod: 'cash'
      },
      {
        id: 'sale-2',
        receiptNo: 'REC-002',
        date: new Date().toISOString(),
        items: [{ id: 'p2', name: 'Ürün 2', price: 50, quantity: 1, barcode: '456', taxRate: 18 }],
        subtotal: 50,
        discount: 0,
        tax: 9,
        total: 59,
        paymentMethod: 'credit'
      }
    ];

    mockProducts = [
      { id: 'p1', code: 'P001', barcode: '123', name: 'Ürün 1', category: 'Kategori A', price: 100, stock: 50, taxRate: 18 },
      { id: 'p2', code: 'P002', barcode: '456', name: 'Ürün 2', category: 'Kategori A', price: 50, stock: 30, taxRate: 18 },
      { id: 'p3', code: 'P003', barcode: '789', name: 'Ürün 3', category: 'Kategori B', price: 75, stock: 20, taxRate: 18 }
    ];
  });

  describe('Sales Trend Data', () => {
    it('should generate sales trend for 7 days', () => {
      const data = service.getSalesTrendData(mockSales, 7);

      expect(data).toHaveLength(7);
      expect(data[0]).toHaveProperty('date');
      expect(data[0]).toHaveProperty('total');
      expect(data[0]).toHaveProperty('count');
    });
  });

  describe('Category Distribution', () => {
    it('should calculate category distribution', () => {
      const data = service.getCategoryData(mockProducts);

      expect(data).toHaveLength(2);
      expect(data.find(d => d.name === 'Kategori A')?.value).toBe(2);
      expect(data.find(d => d.name === 'Kategori B')?.value).toBe(1);
    });
  });

  describe('Payment Method Distribution', () => {
    it('should calculate payment method distribution', () => {
      const data = service.getPaymentMethodData(mockSales);

      expect(data.length).toBeGreaterThan(0);
      expect(data.find(d => d.name === 'Nakit')?.value).toBe(1);
      expect(data.find(d => d.name === 'Kredi Kartı')?.value).toBe(1);
    });
  });

  describe('Top Products', () => {
    it('should return top selling products', () => {
      const data = service.getTopProducts(mockSales, 10);

      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('quantity');
      expect(data[0]).toHaveProperty('revenue');
    });
  });

  describe('Hourly Sales', () => {
    it('should generate hourly sales data', () => {
      const data = service.getHourlySalesData(mockSales);

      expect(data).toHaveLength(24);
      expect(data[0].hour).toBe('00:00');
      expect(data[23].hour).toBe('23:00');
    });
  });

  describe('Stock Status', () => {
    it('should categorize stock status', () => {
      const products: Product[] = [
        { ...mockProducts[0], stock: 50 },   // In stock
        { ...mockProducts[1], stock: 10 },   // Low stock
        { ...mockProducts[2], stock: 0 }     // Out of stock
      ];

      const data = service.getStockStatusData(products);

      expect(data).toHaveLength(3);
      expect(data.find(d => d.name === 'Stokta')).toBeDefined();
      expect(data.find(d => d.name === 'Düşük Stok')).toBeDefined();
      expect(data.find(d => d.name === 'Tükendi')).toBeDefined();
    });
  });
});

