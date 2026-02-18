/**
 * Advanced Report Export Service
 * Professional Excel, PDF, and Email export functionality
 * 
 * @created 2024-12-18
 */

import * as XLSX from 'xlsx';

interface ExportOptions {
  filename: string;
  sheetName?: string;
  styling?: boolean;
  charts?: boolean;
  pivot?: boolean;
}

interface ReportData {
  reportTitle: string;
  reportSubtitle?: string;
  generatedAt: string;
  parameters: Record<string, any>;
  company: {
    name: string;
    address: string;
    phone: string;
    taxNo: string;
  };
  summary: {
    label: string;
    value: any;
    format?: 'currency' | 'number' | 'percent' | 'text';
  }[];
  headers: string[];
  data: any[][];
}

export class AdvancedReportExportService {
  /**
   * Export to Excel with professional formatting
   */
  static exportToExcel(reportData: ReportData, options: ExportOptions = { filename: 'report' }) {
    const workbook = XLSX.utils.book_new();
    const sheetName = options.sheetName || 'Report';

    // Create worksheet data
    const wsData: any[][] = [];

    // Add company header
    wsData.push([reportData.company.name]);
    wsData.push([reportData.company.address]);
    wsData.push([`Tel: ${reportData.company.phone} | Tax: ${reportData.company.taxNo}`]);
    wsData.push([]);

    // Add report title
    wsData.push([reportData.reportTitle]);
    if (reportData.reportSubtitle) {
      wsData.push([reportData.reportSubtitle]);
    }
    wsData.push([]);

    // Add parameters
    wsData.push(['Report Parameters:']);
    Object.entries(reportData.parameters).forEach(([key, value]) => {
      wsData.push([key, value]);
    });
    wsData.push([]);

    // Add summary
    if (reportData.summary && reportData.summary.length > 0) {
      wsData.push(['Summary:']);
      const summaryHeaders = reportData.summary.map(s => s.label);
      const summaryValues = reportData.summary.map(s => this.formatValue(s.value, s.format));
      wsData.push(summaryHeaders);
      wsData.push(summaryValues);
      wsData.push([]);
    }

    // Add data table
    wsData.push(reportData.headers);
    reportData.data.forEach(row => {
      wsData.push(row);
    });

    // Add totals row
    const totalsRow = new Array(reportData.headers.length).fill('');
    totalsRow[0] = 'TOTAL';
    const lastColumnIndex = reportData.headers.length - 1;
    totalsRow[lastColumnIndex] = reportData.data.reduce((sum, row) => {
      const val = row[lastColumnIndex];
      return sum + (typeof val === 'number' ? val : 0);
    }, 0);
    wsData.push(totalsRow);

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(wsData);

    // Apply styling
    if (options.styling !== false) {
      this.applyExcelStyling(worksheet, wsData.length, reportData.headers.length);
    }

    // Set column widths
    const colWidths = reportData.headers.map(header => ({
      wch: Math.max(header.length + 2, 15)
    }));
    worksheet['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Generate and download file
    const excelBuffer = XLSX.write(workbook, { 
      bookType: 'xlsx', 
      type: 'array',
      cellStyles: true 
    });
    
    this.downloadFile(
      new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${options.filename}.xlsx`
    );
  }

  /**
   * Export to CSV
   */
  static exportToCSV(reportData: ReportData, filename: string = 'report') {
    const csvData: string[][] = [];

    // Add headers
    csvData.push(reportData.headers);

    // Add data
    reportData.data.forEach(row => {
      csvData.push(row.map(cell => String(cell)));
    });

    // Convert to CSV string
    const csvContent = csvData.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    // Download
    this.downloadFile(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
      `${filename}.csv`
    );
  }

  /**
   * Export to PDF (using browser print)
   */
  static exportToPDF(reportData: ReportData, filename: string = 'report') {
    // This would typically use a library like jsPDF or pdfmake
    // For now, we'll trigger the print dialog
    window.print();
  }

  /**
   * Send report via email
   */
  static async sendViaEmail(reportData: ReportData, emailConfig: {
    to: string;
    subject: string;
    body?: string;
    format: 'excel' | 'pdf' | 'csv';
  }) {
    // In a real implementation, this would call a backend API
    console.log('Sending report via email...', emailConfig);
    
    // Generate file based on format
    let fileBlob: Blob;
    let fileName: string;

    switch (emailConfig.format) {
      case 'excel':
        // Generate Excel blob
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([
          reportData.headers,
          ...reportData.data
        ]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        fileBlob = new Blob([excelBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        fileName = `${reportData.reportTitle}.xlsx`;
        break;

      case 'csv':
        const csvContent = [
          reportData.headers,
          ...reportData.data
        ].map(row => row.join(',')).join('\n');
        fileBlob = new Blob([csvContent], { type: 'text/csv' });
        fileName = `${reportData.reportTitle}.csv`;
        break;

      default:
        throw new Error(`Unsupported format: ${emailConfig.format}`);
    }

    // Create FormData
    const formData = new FormData();
    formData.append('to', emailConfig.to);
    formData.append('subject', emailConfig.subject);
    formData.append('body', emailConfig.body || '');
    formData.append('attachment', fileBlob, fileName);

    // Send to backend
    try {
      const response = await fetch('/api/reports/send-email', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Schedule recurring report
   */
  static async scheduleReport(schedule: {
    reportId: string;
    parameters: Record<string, any>;
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
    recipients: string[];
    format: 'excel' | 'pdf' | 'csv';
  }) {
    try {
      const response = await fetch('/api/reports/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(schedule)
      });

      if (!response.ok) {
        throw new Error('Failed to schedule report');
      }

      return await response.json();
    } catch (error) {
      console.error('Error scheduling report:', error);
      throw error;
    }
  }

  /**
   * Helper: Apply Excel styling
   */
  private static applyExcelStyling(worksheet: XLSX.WorkSheet, rows: number, cols: number) {
    // In a real implementation with a library that supports styling,
    // you would apply:
    // - Bold headers
    // - Cell borders
    // - Number formatting
    // - Conditional formatting
    // - Cell colors
    
    // Example (pseudo-code):
    /*
    worksheet['A1'].s = {
      font: { bold: true, size: 14 },
      fill: { fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center' }
    };
    */
  }

  /**
   * Helper: Format value based on type
   */
  private static formatValue(value: any, format?: string): any {
    if (format === 'currency') {
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value) + ' IQD';
    }
    if (format === 'number') {
      return new Intl.NumberFormat('tr-TR').format(value);
    }
    if (format === 'percent') {
      return value.toFixed(2) + '%';
    }
    return value;
  }

  /**
   * Helper: Download file
   */
  private static downloadFile(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Generate report data from API
   */
  static async generateReport(reportId: string, parameters: Record<string, any>): Promise<ReportData> {
    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reportId, parameters })
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      return await response.json();
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Export multiple reports as ZIP
   */
  static async exportMultipleReports(reports: Array<{
    reportId: string;
    parameters: Record<string, any>;
    filename: string;
  }>, zipFilename: string = 'reports') {
    // This would require a ZIP library like JSZip
    console.log('Exporting multiple reports...', reports);
    
    // Implementation would:
    // 1. Generate each report
    // 2. Add to ZIP file
    // 3. Download ZIP
  }

  /**
   * Create custom report from template
   */
  static async createCustomReport(template: {
    name: string;
    description: string;
    dataSource: string;
    filters: any[];
    columns: string[];
    groupBy?: string[];
    orderBy?: string[];
    aggregations?: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'>;
  }) {
    try {
      const response = await fetch('/api/reports/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(template)
      });

      if (!response.ok) {
        throw new Error('Failed to create custom report');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating custom report:', error);
      throw error;
    }
  }
}

// Example usage:
/*
// Export to Excel
AdvancedReportExportService.exportToExcel(reportData, {
  filename: 'daily-sales-report',
  sheetName: 'Daily Sales',
  styling: true
});

// Send via email
await AdvancedReportExportService.sendViaEmail(reportData, {
  to: 'manager@company.com',
  subject: 'Daily Sales Report',
  format: 'excel'
});

// Schedule recurring report
await AdvancedReportExportService.scheduleReport({
  reportId: 'daily-sales-summary',
  parameters: { date: 'today' },
  frequency: 'daily',
  time: '08:00',
  recipients: ['manager@company.com', 'owner@company.com'],
  format: 'excel'
});
*/

