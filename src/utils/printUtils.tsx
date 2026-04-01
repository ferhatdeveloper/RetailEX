import { toast } from 'sonner';
import type { Invoice } from '../core/types';
import { CorporateInvoiceTemplate, PrintConfig } from '../components/trading/invoices/CorporateInvoiceTemplate';
import { PostgresConnection, ERP_SETTINGS } from '../services/postgres';
import { getReceiptSettings } from '../services/receiptSettingsService';

export const printInvoice = async (invoice: Invoice, typeLabel: string = 'FATURA') => {
  try {
    // Dynamic import to avoid SSR issues
    const ReactDOMServer = (await import('react-dom/server')).default;

    // Use an iframe instead of window.open to avoid popup blockers
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      toast.error('Yazdırma servisi başlatılamadı.');
      document.body.removeChild(iframe);
      return;
    }

    // Firma bilgisi: önce fiş/firma ayarları (logo, adres vb.), yoksa postgres firm details
    const postgres = PostgresConnection.getInstance();
    const firmDetails = await postgres.getFirmDetails(ERP_SETTINGS.firmNr);
    let receiptSettings: Awaited<ReturnType<typeof getReceiptSettings>> = {};
    try {
      receiptSettings = await getReceiptSettings();
    } catch {
      // Fiş ayarları yoksa firmDetails kullanılır
    }

    const companyConfig: PrintConfig = {
      showLogo: !!receiptSettings.logoDataUrl,
      logoUrl: receiptSettings.logoDataUrl || undefined,
      showQRCode: true,
      companyName: receiptSettings.companyName || firmDetails?.title || firmDetails?.name || 'RetailEX ERP',
      companyAddress: receiptSettings.companyAddress || firmDetails?.address || 'Adres tanımlanmamış.',
      companyPhone: receiptSettings.companyPhone || firmDetails?.phone || '',
      companyTaxNo: receiptSettings.companyTaxNumber || firmDetails?.tax_nr || '',
      companyTaxOffice: receiptSettings.companyTaxOffice || undefined,
      footerText: 'Bizi tercih ettiğiniz için teşekkür ederiz.'
    };

    const htmlContent = ReactDOMServer.renderToStaticMarkup(
      <CorporateInvoiceTemplate
        invoice={invoice}
        config={companyConfig}
        typeLabel={typeLabel}
      />
    );

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${typeLabel} - ${invoice.invoice_no}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { size: A4; margin: 0; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>
            // Wait for tailwind and images
            window.onload = () => {
              setTimeout(() => {
                window.print();
                // Clean up iframe after printing dialog closes (or user cancels)
                setTimeout(() => {
                  window.frameElement.parentNode.removeChild(window.frameElement);
                }, 1000);
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();

  } catch (error) {
    console.error('Printing error:', error);
    toast.error('Yazdrıma işlemi başlatılamadı.');
  }
};


