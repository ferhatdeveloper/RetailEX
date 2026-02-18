// Logo XML Export - Logo Go3/SQL&Go için fatura XML export

import type { PendingInvoice } from './invoiceQueue';

export function exportInvoicesToLogoXML(invoices: PendingInvoice[], firmNo: string, period: string): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<LOGO>\n';
  xml += '  <HEADER>\n';
  xml += `    <TYPE>Import</TYPE>\n`;
  xml += `    <VERSION>1.0</VERSION>\n`;
  xml += `    <FIRM_NO>${firmNo}</FIRM_NO>\n`;
  xml += `    <PERIOD>${period}</PERIOD>\n`;
  xml += `    <DATE>${dateStr}</DATE>\n`;
  xml += `    <TIME>${timeStr}</TIME>\n`;
  xml += `    <SOURCE>RetailOS</SOURCE>\n`;
  xml += '  </HEADER>\n';
  xml += '  <TRANSACTIONS>\n';
  
  invoices.forEach((invoice, index) => {
    const invoiceDate = new Date(invoice.date);
    const invDateStr = invoiceDate.toISOString().split('T')[0];
    
    // Transaction type: 1=Satış, 2=Alış, 3=İade
    const trType = invoice.type === 'sales' ? '1' : invoice.type === 'purchase' ? '2' : '3';
    
    xml += '    <INVOICE>\n';
    xml += `      <INTERNAL_REFERENCE>${index + 1}</INTERNAL_REFERENCE>\n`;
    xml += `      <TYPE>${trType}</TYPE>\n`;
    xml += `      <NUMBER>${invoice.invoiceNo}</NUMBER>\n`;
    xml += `      <DATE>${invDateStr}</DATE>\n`;
    xml += `      <TIME>${invoiceDate.toTimeString().split(' ')[0]}</TIME>\n`;
    xml += `      <ARP_CODE>${invoice.customerId || 'WALK-IN'}</ARP_CODE>\n`;
    xml += `      <SOURCEINDEX>9</SOURCEINDEX>\n`; // 9 = POS
    xml += `      <SOURCE_WH>1</SOURCE_WH>\n`; // Warehouse 1
    xml += '      <TRANSACTIONS>\n';
    
    // Items
    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach((item: any, itemIndex: number) => {
        xml += '        <TRANSACTION>\n';
        xml += `          <INTERNAL_REFERENCE>${itemIndex + 1}</INTERNAL_REFERENCE>\n`;
        xml += `          <TYPE>0</TYPE>\n`; // 0 = Stok
        xml += `          <MASTER_CODE>${item.productId || item.id || ''}</MASTER_CODE>\n`;
        xml += `          <CODE>${item.barcode || item.productId || ''}</CODE>\n`;
        xml += `          <NAME>${escapeXML(item.productName || item.name || '')}</NAME>\n`;
        xml += `          <QUANTITY>${item.quantity || 1}</QUANTITY>\n`;
        xml += `          <PRICE>${(item.price || 0).toFixed(4)}</PRICE>\n`;
        xml += `          <TOTAL>${(item.total || 0).toFixed(2)}</TOTAL>\n`;
        xml += `          <VAT_RATE>${item.vat || 20}</VAT_RATE>\n`;
        xml += `          <UNIT_CODE>AD</UNIT_CODE>\n`;
        xml += `          <UNIT_CONV>1</UNIT_CONV>\n`;
        xml += '        </TRANSACTION>\n';
      });
    }
    
    xml += '      </TRANSACTIONS>\n';
    xml += '      <TOTALS>\n';
    xml += `        <GROSSTOTAL>${invoice.total.toFixed(2)}</GROSSTOTAL>\n`;
    xml += `        <NETTOTAL>${invoice.total.toFixed(2)}</NETTOTAL>\n`;
    xml += '      </TOTALS>\n';
    xml += '    </INVOICE>\n';
  });
  
  xml += '  </TRANSACTIONS>\n';
  xml += '</LOGO>';
  
  return xml;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadXMLFile(xml: string, filename: string = 'logo_invoices.xml'): void {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

