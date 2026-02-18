import { toast } from 'sonner';
import type { Invoice } from '../core/types';
import { CorporateInvoiceTemplate, PrintConfig } from '../components/trading/invoices/CorporateInvoiceTemplate';

export const printInvoice = async (invoice: Invoice, typeLabel: string = 'FATURA') => {
    try {
        // Dynamic import to avoid SSR issues
        const ReactDOMServer = (await import('react-dom/server')).default;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Pop-up engelleyiciyi kapatınız.');
            return;
        }

        // Default company config - in a real app this should come from detailed settings or context
        const companyConfig: PrintConfig = {
            showLogo: true,
            showQRCode: true,
            companyName: 'CIHAN GROUP 2026',
            companyAddress: 'Bağdat Caddesi No: 123, İstanbul',
            companyPhone: '+90 212 555 0000',
            companyTaxNo: '1234567890',
            footerText: 'Bizi tercih ettiğiniz için teşekkür ederiz.'
        };

        const htmlContent = ReactDOMServer.renderToStaticMarkup(
            <CorporateInvoiceTemplate
                invoice={invoice}
                config={companyConfig}
                typeLabel={typeLabel}
            />
        );

        printWindow.document.write(`
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
                window.onafterprint = () => window.close();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
        printWindow.document.close();

    } catch (error) {
        console.error('Printing error:', error);
        toast.error('Yazdrıma işlemi başlatılamadı.');
    }
};
