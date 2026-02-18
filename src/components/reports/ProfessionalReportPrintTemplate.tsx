/**
 * Professional Report Print Template
 * Crystal Reports style professional layouts
 * 
 * @created 2024-12-18
 */

import { useRef } from 'react';
import { Download, Printer, Mail } from 'lucide-react';

interface ReportData {
  reportTitle: string;
  reportSubtitle?: string;
  generatedAt: string;
  parameters: Record<string, any>;
  company: {
    name: string;
    logo?: string;
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
  footer?: string;
  pageBreaks?: number[];  // Row indexes where to add page break
}

export default function ProfessionalReportPrintTemplate({ data }: { data: ReportData }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = printRef.current?.innerHTML || '';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${data.reportTitle}</title>
        <style>
          @media print {
            @page {
              size: A4;
              margin: 1.5cm;
            }
            
            body {
              margin: 0;
              padding: 0;
              font-family: 'Segoe UI', Arial, sans-serif;
              font-size: 10pt;
              line-height: 1.4;
            }
            
            .page-break {
              page-break-after: always;
            }
            
            .no-break {
              page-break-inside: avoid;
            }
            
            thead {
              display: table-header-group;
            }
            
            tfoot {
              display: table-footer-group;
            }
          }
          
          * {
            box-sizing: border-box;
          }
          
          body {
            background: white;
            color: #000;
          }
          
          .report-container {
            max-width: 210mm;
            margin: 0 auto;
            background: white;
            padding: 20mm;
          }
          
          /* Header Styles */
          .report-header {
            border-bottom: 3px solid #2563eb;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          
          .company-info {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 15px;
          }
          
          .company-logo {
            max-width: 150px;
            max-height: 60px;
          }
          
          .company-details {
            text-align: right;
            font-size: 9pt;
            color: #666;
          }
          
          .report-title {
            font-size: 18pt;
            font-weight: bold;
            color: #1e40af;
            margin-bottom: 5px;
          }
          
          .report-subtitle {
            font-size: 11pt;
            color: #666;
          }
          
          /* Meta Info */
          .meta-info {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 20px;
            font-size: 9pt;
          }
          
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          
          .meta-item {
            display: flex;
            flex-direction: column;
          }
          
          .meta-label {
            font-weight: 600;
            color: #475569;
            margin-bottom: 2px;
          }
          
          .meta-value {
            color: #1e293b;
          }
          
          /* Summary Section */
          .summary-section {
            margin-bottom: 20px;
            border: 2px solid #e2e8f0;
            border-radius: 6px;
            overflow: hidden;
          }
          
          .summary-header {
            background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
            color: white;
            padding: 10px 15px;
            font-weight: bold;
            font-size: 11pt;
          }
          
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0;
          }
          
          .summary-item {
            border-right: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            padding: 12px;
            text-align: center;
          }
          
          .summary-item:nth-child(4n) {
            border-right: none;
          }
          
          .summary-item:nth-last-child(-n+4) {
            border-bottom: none;
          }
          
          .summary-label {
            font-size: 8pt;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          
          .summary-value {
            font-size: 14pt;
            font-weight: bold;
            color: #1e293b;
          }
          
          .summary-value.currency {
            color: #16a34a;
          }
          
          .summary-value.percent {
            color: #2563eb;
          }
          
          /* Data Table */
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 9pt;
          }
          
          .data-table thead {
            background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
            color: white;
          }
          
          .data-table th {
            padding: 10px 8px;
            text-align: left;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 8pt;
            letter-spacing: 0.5px;
            border-right: 1px solid #475569;
          }
          
          .data-table th:last-child {
            border-right: none;
          }
          
          .data-table tbody tr {
            border-bottom: 1px solid #e2e8f0;
          }
          
          .data-table tbody tr:nth-child(odd) {
            background: #f8fafc;
          }
          
          .data-table tbody tr:hover {
            background: #f1f5f9;
          }
          
          .data-table td {
            padding: 8px;
            color: #1e293b;
          }
          
          .data-table td.number {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          
          .data-table td.currency {
            text-align: right;
            font-weight: 500;
            color: #16a34a;
          }
          
          .data-table tfoot {
            background: #f8fafc;
            font-weight: bold;
            border-top: 2px solid #334155;
          }
          
          .data-table tfoot td {
            padding: 10px 8px;
          }
          
          /* Footer */
          .report-footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 2px solid #e2e8f0;
            font-size: 8pt;
            color: #64748b;
          }
          
          .footer-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
          }
          
          .footer-section h4 {
            font-size: 9pt;
            font-weight: 600;
            color: #475569;
            margin-bottom: 5px;
          }
          
          /* Page Numbers */
          @media print {
            .report-footer::after {
              content: "Sayfa " counter(page) " / " counter(pages);
              position: absolute;
              bottom: 1cm;
              right: 1.5cm;
            }
          }
          
          /* Watermark (optional) */
          .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 72pt;
            color: rgba(0, 0, 0, 0.05);
            z-index: -1;
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
  };

  const formatValue = (value: any, format?: string) => {
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
  };

  return (
    <div className="bg-white">
      {/* Print/Export Actions */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 print:hidden">
        <h3 className="font-semibold">Rapor Önizleme</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Yazdır
          </button>
          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <Download className="w-4 h-4" />
            PDF İndir
          </button>
          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            E-posta Gönder
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div ref={printRef} className="report-container p-8">
        {/* Optional Watermark */}
        {/* <div className="watermark">DRAFT</div> */}

        {/* Header */}
        <div className="report-header no-break">
          <div className="company-info">
            <div>
              {data.company.logo && (
                <img src={data.company.logo} alt="Company Logo" className="company-logo mb-2" />
              )}
              <div className="text-lg font-bold">{data.company.name}</div>
            </div>
            <div className="company-details">
              <div>{data.company.address}</div>
              <div>Tel: {data.company.phone}</div>
              <div>Vergi No: {data.company.taxNo}</div>
            </div>
          </div>
          
          <div className="report-title">{data.reportTitle}</div>
          {data.reportSubtitle && (
            <div className="report-subtitle">{data.reportSubtitle}</div>
          )}
        </div>

        {/* Meta Information */}
        <div className="meta-info no-break">
          <div className="meta-grid">
            <div className="meta-item">
              <div className="meta-label">Rapor Tarihi</div>
              <div className="meta-value">{new Date(data.generatedAt).toLocaleString('tr-TR')}</div>
            </div>
            {Object.entries(data.parameters).map(([key, value]) => (
              <div key={key} className="meta-item">
                <div className="meta-label">{key}</div>
                <div className="meta-value">{String(value)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Section */}
        {data.summary && data.summary.length > 0 && (
          <div className="summary-section no-break">
            <div className="summary-header">Özet Bilgiler</div>
            <div className="summary-grid">
              {data.summary.map((item, idx) => (
                <div key={idx} className="summary-item">
                  <div className="summary-label">{item.label}</div>
                  <div className={`summary-value ${item.format || ''}`}>
                    {formatValue(item.value, item.format)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Table */}
        <table className="data-table">
          <thead>
            <tr>
              {data.headers.map((header, idx) => (
                <th key={idx}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((row, rowIdx) => (
              <>
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td 
                      key={cellIdx}
                      className={typeof cell === 'number' ? 'number' : ''}
                    >
                      {typeof cell === 'number' ? formatValue(cell, 'number') : cell}
                    </td>
                  ))}
                </tr>
                {data.pageBreaks?.includes(rowIdx) && (
                  <tr className="page-break"></tr>
                )}
              </>
            ))}
          </tbody>
          {/* Optional totals row */}
          <tfoot>
            <tr>
              <td colSpan={data.headers.length - 1}>TOPLAM</td>
              <td className="currency">
                {formatValue(
                  data.data.reduce((sum, row) => sum + (typeof row[row.length - 1] === 'number' ? row[row.length - 1] : 0), 0),
                  'currency'
                )}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Footer */}
        <div className="report-footer">
          <div className="footer-grid">
            <div className="footer-section">
              <h4>Hazırlayan</h4>
              <div>ExRetailOS v1.0</div>
              <div>Otomatik Rapor Sistemi</div>
            </div>
            <div className="footer-section">
              <h4>İletişim</h4>
              <div>{data.company.phone}</div>
              <div>destek@exretailos.com</div>
            </div>
            <div className="footer-section">
              <h4>Yasal Uyarı</h4>
              <div>Bu rapor gizlidir</div>
              <div>Yetkisiz kullanım yasaktır</div>
            </div>
          </div>
          {data.footer && (
            <div className="mt-3 text-center">{data.footer}</div>
          )}
        </div>
      </div>
    </div>
  );
}

