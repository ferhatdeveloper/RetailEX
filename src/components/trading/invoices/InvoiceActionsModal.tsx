import { useState } from 'react';
import { 
  X, Copy, Edit, Eye, Printer, Download, 
  MessageSquare, Send, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';

interface Invoice {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name?: string;
  supplier_name?: string;
  total_amount: number;
  status: string;
  invoice_type?: number;
  invoice_category?: string;
}

interface InvoiceActionsModalProps {
  invoice: Invoice;
  onClose: () => void;
  onCopy?: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoice: Invoice) => void;
  onPrint?: (invoice: Invoice) => void;
  onView?: (invoice: Invoice) => void;
}

export function InvoiceActionsModal({
  invoice,
  onClose,
  onCopy,
  onEdit,
  onDelete,
  onPrint,
  onView
}: InvoiceActionsModalProps) {
  const { tm } = useLanguage();
  const [loading, setLoading] = useState<string | null>(null);

  const formatMoney = (amount: number): string => {
    return amount.toLocaleString('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const handleAction = async (action: string) => {
    setLoading(action);
    
    try {
      switch (action) {
        case 'copy':
          if (onCopy) {
            onCopy(invoice);
            toast.success(tm('invoiceCopying'), {
              description: tm('newInvoiceCreating'),
              duration: 2000
            });
          }
          break;
          
        case 'edit':
          if (onEdit) {
            onEdit(invoice);
            onClose();
          }
          break;
          
        case 'view':
          if (onView) {
            onView(invoice);
          }
          break;
          
        case 'print':
          if (onPrint) {
            await onPrint(invoice);
          } else {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
              printWindow.document.write(`
                <html>
                  <head><title>${tm('invoiceNo')} ${invoice.invoice_no}</title></head>
                  <body style="font-family: Arial; padding: 20px;">
                    <h2>${tm('invoiceDetailsTitle')}</h2>
                    <p><strong>${tm('invoiceNo')}:</strong> ${invoice.invoice_no}</p>
                    <p><strong>${tm('date')}:</strong> ${formatDate(invoice.invoice_date)}</p>
                    ${invoice.customer_name ? `<p><strong>${tm('customer')}:</strong> ${invoice.customer_name}</p>` : ''}
                    ${invoice.supplier_name ? `<p><strong>${tm('supplier')}:</strong> ${invoice.supplier_name}</p>` : ''}
                    <p><strong>${tm('amountLabel')}:</strong> ${formatMoney(invoice.total_amount)} IQD</p>
                    <p><strong>${tm('status')}:</strong> ${invoice.status}</p>
                  </body>
                </html>
              `);
              printWindow.document.close();
              printWindow.print();
            }
          }
          toast.success(tm('invoicePrinting'));
          break;
          
        case 'pdf':
          toast.info(tm('pdfCreating'), {
            description: tm('pdfDownloadSoon'),
            duration: 3000
          });
          break;
          
        case 'whatsapp': {
          const message = `${tm('invoiceNo')}: ${invoice.invoice_no}\n${tm('date')}: ${formatDate(invoice.invoice_date)}\n${tm('amountLabel')}: ${formatMoney(invoice.total_amount)} IQD`;
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
          window.open(whatsappUrl, '_blank');
          toast.success(tm('whatsappOpening'));
          break;
        }
          
        case 'email':
          toast.info(tm('emailSendingSoon'));
          break;
          
        case 'delete':
          if (confirm(tm('confirmDeleteInvoiceShort'))) {
            if (onDelete) {
              onDelete(invoice);
              toast.success(tm('invoiceDeletedShort'));
              onClose();
            }
          }
          break;
          
        default:
          break;
      }
    } catch (error: any) {
      toast.error(tm('operationFailed'), {
        description: error.message || tm('errorOccurred'),
        duration: 3000
      });
    } finally {
      setLoading(null);
    }
  };

  const actionButtons = [
    {
      id: 'view',
      label: tm('review'),
      icon: Eye,
      color: 'text-blue-600 hover:bg-blue-50',
      onClick: () => handleAction('view')
    },
    {
      id: 'edit',
      label: tm('edit'),
      icon: Edit,
      color: 'text-green-600 hover:bg-green-50',
      onClick: () => handleAction('edit')
    },
    {
      id: 'copy',
      label: tm('copy'),
      icon: Copy,
      color: 'text-purple-600 hover:bg-purple-50',
      onClick: () => handleAction('copy')
    },
    {
      id: 'print',
      label: tm('print'),
      icon: Printer,
      color: 'text-gray-600 hover:bg-gray-50',
      onClick: () => handleAction('print')
    },
    {
      id: 'pdf',
      label: tm('pdfDownload'),
      icon: Download,
      color: 'text-indigo-600 hover:bg-indigo-50',
      onClick: () => handleAction('pdf')
    },
    {
      id: 'whatsapp',
      label: tm('sendViaWhatsapp'),
      icon: MessageSquare,
      color: 'text-green-600 hover:bg-green-50',
      onClick: () => handleAction('whatsapp')
    },
    {
      id: 'email',
      label: tm('sendEmail'),
      icon: Send,
      color: 'text-blue-600 hover:bg-blue-50',
      onClick: () => handleAction('email')
    },
    {
      id: 'delete',
      label: tm('delete'),
      icon: Trash2,
      color: 'text-red-600 hover:bg-red-50',
      onClick: () => handleAction('delete'),
      destructive: true
    }
  ];

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('invoiceActions')}>
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-white">{tm('invoiceActions')}</h3>
            <p className="text-sm text-blue-100 mt-1">
              {invoice.invoice_no} - {formatDate(invoice.invoice_date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/10 p-2 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Info */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 shrink-0">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">{tm('amountLabel')}:</span>
              <span className="ml-2 font-semibold text-gray-900">
                {formatMoney(invoice.total_amount)} IQD
              </span>
            </div>
            <div>
              <span className="text-gray-600">{tm('status')}:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                invoice.status === 'Onaylandı' ? 'bg-green-100 text-green-700' :
                invoice.status === 'Beklemede' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {invoice.status}
              </span>
            </div>
            {invoice.customer_name && (
              <div>
                <span className="text-gray-600">{tm('customer')}:</span>
                <span className="ml-2 font-medium text-gray-900">{invoice.customer_name}</span>
              </div>
            )}
            {invoice.supplier_name && (
              <div>
                <span className="text-gray-600">{tm('supplier')}:</span>
                <span className="ml-2 font-medium text-gray-900">{invoice.supplier_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <PercentBodyModalScrollBody className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {actionButtons.map((action) => {
              const Icon = action.icon;
              const isLoading = loading === action.id;
              
              return (
                <button
                  key={action.id}
                  onClick={action.onClick}
                  disabled={isLoading}
                  className={`
                    flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2
                    transition-all hover:shadow-md
                    ${action.color}
                    ${action.destructive ? 'border-red-200' : 'border-gray-200'}
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <Icon className={`w-6 h-6 ${isLoading ? 'animate-pulse' : ''}`} />
                  <span className="text-sm font-medium">{action.label}</span>
                </button>
              );
            })}
          </div>
        </PercentBodyModalScrollBody>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            {tm('close')}
          </button>
        </div>
    </PercentBodyModal>
  );
}
