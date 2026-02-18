/**
 * Export Service
 * Excel ve PDF export işlemleri
 * Pattern: Strategy Pattern
 */

import { Sale, Product } from '../App';

// Export types
export type ExportFormat = 'excel' | 'pdf' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  fileName: string;
  title: string;
  data: any[];
  columns?: string[];
  includeHeader?: boolean;
  includeFooter?: boolean;
}

/**
 * Export Strategy Interface
 */
export interface ExportStrategy {
  export(options: ExportOptions): Promise<Blob>;
}

/**
 * Excel Export Strategy
 * Uses XLSX library pattern
 */
class ExcelExportStrategy implements ExportStrategy {
  async export(options: ExportOptions): Promise<Blob> {
    const { data, title, fileName } = options;

    // Create workbook
    const workbook = this.createWorkbook(data, title);

    // Convert to blob
    const blob = new Blob([workbook], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    return blob;
  }

  private createWorkbook(data: any[], title: string): string {
    // Simple Excel XML format (için gerçek projede xlsx kütüphanesi kullanılmalı)
    let xml = '<?xml version="1.0"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">\n';
    xml += `<Worksheet ss:Name="${title}">\n`;
    xml += '<Table>\n';

    if (data.length > 0) {
      // Header row
      const headers = Object.keys(data[0]);
      xml += '<Row>\n';
      headers.forEach(header => {
        xml += `<Cell><Data ss:Type="String">${this.escapeXml(header)}</Data></Cell>\n`;
      });
      xml += '</Row>\n';

      // Data rows
      data.forEach(row => {
        xml += '<Row>\n';
        headers.forEach(header => {
          const value = row[header];
          const type = typeof value === 'number' ? 'Number' : 'String';
          xml += `<Cell><Data ss:Type="${type}">${this.escapeXml(String(value))}</Data></Cell>\n`;
        });
        xml += '</Row>\n';
      });
    }

    xml += '</Table>\n';
    xml += '</Worksheet>\n';
    xml += '</Workbook>';

    return xml;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * PDF Export Strategy
 * Uses canvas/html2pdf pattern
 */
class PDFExportStrategy implements ExportStrategy {
  async export(options: ExportOptions): Promise<Blob> {
    const { data, title } = options;

    // Create HTML content
    const html = this.createHTML(data, title);

    // For production, use jsPDF or html2pdf library
    // Mock PDF generation
    const blob = new Blob([html], { type: 'application/pdf' });

    return blob;
  }

  private createHTML(data: any[], title: string): string {
    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; border-bottom: 2px solid #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background-color: #f0f0f0; padding: 10px; text-align: left; border: 1px solid #ddd; }
    td { padding: 8px; border: 1px solid #ddd; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Oluşturma Tarihi: ${new Date().toLocaleDateString('tr-TR')}</p>
  <table>
    <thead>
      <tr>
`;

    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      headers.forEach(header => {
        html += `        <th>${header}</th>\n`;
      });
      html += '      </tr>\n    </thead>\n    <tbody>\n';

      data.forEach(row => {
        html += '      <tr>\n';
        headers.forEach(header => {
          html += `        <td>${row[header]}</td>\n`;
        });
        html += '      </tr>\n';
      });
    }

    html += `
    </tbody>
  </table>
  <div class="footer">
    <p>RetailOS - Mağaza Yönetim Sistemi</p>
    <p>© 2025 Tüm hakları saklıdır.</p>
  </div>
</body>
</html>`;

    return html;
  }
}

/**
 * CSV Export Strategy
 */
class CSVExportStrategy implements ExportStrategy {
  async export(options: ExportOptions): Promise<Blob> {
    const { data } = options;

    let csv = '';

    if (data.length > 0) {
      // Header
      const headers = Object.keys(data[0]);
      csv += headers.join(',') + '\n';

      // Data
      data.forEach(row => {
        const values = headers.map(header => {
          let value = row[header];
          if (typeof value === 'string' && value.includes(',')) {
            value = `"${value}"`;
          }
          return value;
        });
        csv += values.join(',') + '\n';
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    return blob;
  }
}

/**
 * Export Service Facade
 */
export class ExportService {
  private strategies: Map<ExportFormat, ExportStrategy>;

  constructor() {
    this.strategies = new Map([
      ['excel', new ExcelExportStrategy()],
      ['pdf', new PDFExportStrategy()],
      ['csv', new CSVExportStrategy()]
    ]);
  }

  /**
   * Export data
   */
  async export(options: ExportOptions): Promise<void> {
    const strategy = this.strategies.get(options.format);

    if (!strategy) {
      throw new Error(`Unsupported export format: ${options.format}`);
    }

    const blob = await strategy.export(options);
    this.downloadBlob(blob, options.fileName, options.format);
  }

  /**
   * Download blob as file
   */
  private downloadBlob(blob: Blob, fileName: string, format: ExportFormat): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.${format === 'excel' ? 'xls' : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export sales report
   */
  async exportSalesReport(sales: Sale[], format: ExportFormat = 'excel'): Promise<void> {
    const data = sales.map(sale => ({
      'Fiş No': sale.id,
      'Tarih': new Date(sale.date).toLocaleDateString('tr-TR'),
      'Müşteri': sale.customerName || 'Misafir',
      'Ürün Sayısı': sale.items.length,
      'Toplam': `${sale.total.toFixed(2)} TL`,
      'Ödeme': sale.paymentMethod,
      'Durum': sale.status || 'Tamamlandı'
    }));

    await this.export({
      format,
      fileName: `Satış_Raporu_${new Date().toISOString().split('T')[0]}`,
      title: 'Satış Raporu',
      data
    });
  }

  /**
   * Export product report
   */
  async exportProductReport(products: Product[], format: ExportFormat = 'excel'): Promise<void> {
    const data = products.map(product => ({
      'Ürün Kodu': product.id,
      'Barkod': product.barcode,
      'Ürün Adı': product.name,
      'Kategori': product.category,
      'Fiyat': `${product.price.toFixed(2)} TL`,
      'Stok': product.stock,
      'Durum': product.stock > 0 ? 'Stokta' : 'Tükendi'
    }));

    await this.export({
      format,
      fileName: `Ürün_Listesi_${new Date().toISOString().split('T')[0]}`,
      title: 'Ürün Listesi',
      data
    });
  }

  /**
   * Export custom data
   */
  async exportCustom(title: string, data: any[], format: ExportFormat = 'excel'): Promise<void> {
    await this.export({
      format,
      fileName: `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
      title,
      data
    });
  }
}

/**
 * Chart Data Service
 * Recharts için veri hazırlama
 */
export class ChartDataService {
  /**
   * Sales trend data (günlük)
   */
  getSalesTrendData(sales: Sale[], days: number = 7): Array<{ date: string; total: number; count: number }> {
    const now = new Date();
    const data: Array<{ date: string; total: number; count: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const daySales = sales.filter(s => s.date.split('T')[0] === dateStr);
      const total = daySales.reduce((sum, s) => sum + s.total, 0);

      data.push({
        date: date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
        total: parseFloat(total.toFixed(2)),
        count: daySales.length
      });
    }

    return data;
  }

  /**
   * Category distribution
   */
  getCategoryData(products: Product[]): Array<{ name: string; value: number }> {
    const categories = new Map<string, number>();

    products.forEach(product => {
      const count = categories.get(product.category) || 0;
      categories.set(product.category, count + 1);
    });

    return Array.from(categories.entries()).map(([name, value]) => ({
      name,
      value
    }));
  }

  /**
   * Top selling products
   */
  getTopProducts(sales: Sale[], limit: number = 10): Array<{ name: string; quantity: number; revenue: number }> {
    const productMap = new Map<string, { quantity: number; revenue: number }>();

    sales.forEach(sale => {
      sale.items.forEach(item => {
        const existing = productMap.get(item.name) || { quantity: 0, revenue: 0 };
        productMap.set(item.name, {
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + (item.price * item.quantity)
        });
      });
    });

    return Array.from(productMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  /**
   * Payment method distribution
   */
  getPaymentMethodData(sales: Sale[]): Array<{ name: string; value: number }> {
    const methods = new Map<string, number>();

    sales.forEach(sale => {
      const count = methods.get(sale.paymentMethod) || 0;
      methods.set(sale.paymentMethod, count + 1);
    });

    return Array.from(methods.entries()).map(([name, value]) => ({
      name: name === 'cash' ? 'Nakit' :
            name === 'credit' ? 'Kredi Kartı' :
            name === 'debit' ? 'Banka Kartı' :
            name === 'mobile' ? 'Mobil' : name,
      value
    }));
  }

  /**
   * Hourly sales distribution
   */
  getHourlySalesData(sales: Sale[]): Array<{ hour: string; count: number; total: number }> {
    const hourly = new Map<number, { count: number; total: number }>();

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourly.set(i, { count: 0, total: 0 });
    }

    // Fill with sales data
    sales.forEach(sale => {
      const hour = new Date(sale.date).getHours();
      const existing = hourly.get(hour)!;
      hourly.set(hour, {
        count: existing.count + 1,
        total: existing.total + sale.total
      });
    });

    return Array.from(hourly.entries()).map(([hour, data]) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      count: data.count,
      total: parseFloat(data.total.toFixed(2))
    }));
  }

  /**
   * Stock status data
   */
  getStockStatusData(products: Product[]): Array<{ name: string; value: number }> {
    const inStock = products.filter(p => p.stock > 30).length;
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= 30).length;
    const outOfStock = products.filter(p => p.stock === 0).length;

    return [
      { name: 'Stokta', value: inStock },
      { name: 'Düşük Stok', value: lowStock },
      { name: 'Tükendi', value: outOfStock }
    ];
  }
}

// Singleton instances
export const exportService = new ExportService();
export const chartDataService = new ChartDataService();

