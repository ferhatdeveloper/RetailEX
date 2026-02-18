import { useState } from 'react';
import { 
  X, Copy, Edit, Eye, FileText, Printer, Download, Share2, 
  MessageSquare, Send, MoreVertical, Trash2, Archive, RefreshCw 
} from 'lucide-react';
import { toast } from 'sonner';

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
            toast.success('✅ Fatura kopyalanıyor...', {
              description: 'Yeni fatura oluşturuluyor',
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
            // Default print
            const printWindow = window.open('', '_blank');
            if (printWindow) {
              printWindow.document.write(`
                <html>
                  <head><title>Fatura ${invoice.invoice_no}</title></head>
                  <body style="font-family: Arial; padding: 20px;">
                    <h2>Fatura Detayları</h2>
                    <p><strong>Fatura No:</strong> ${invoice.invoice_no}</p>
                    <p><strong>Tarih:</strong> ${formatDate(invoice.invoice_date)}</p>
                    ${invoice.customer_name ? `<p><strong>Müşteri:</strong> ${invoice.customer_name}</p>` : ''}
                    ${invoice.supplier_name ? `<p><strong>Tedarikçi:</strong> ${invoice.supplier_name}</p>` : ''}
                    <p><strong>Tutar:</strong> ${formatMoney(invoice.total_amount)} IQD</p>
                    <p><strong>Durum:</strong> ${invoice.status}</p>
                  </body>
                </html>
              `);
              printWindow.document.close();
              printWindow.print();
            }
          }
          toast.success('ğŸ–¨ï¸ Fatura yazdırılıyor...');
          break;
          
        case 'pdf':
          // PDF oluşturma (ileride PDF.js veya jsPDF kullanılabilir)
          toast.info('ğŸ“„ PDF oluşturuluyor...', {
            description: 'PDF indirme yakında eklenecek',
            duration: 3000
          });
          break;
          
        case 'whatsapp':
          // WhatsApp'tan gönder
          const message = `Fatura No: ${invoice.invoice_no}\nTarih: ${formatDate(invoice.invoice_date)}\nTutar: ${formatMoney(invoice.total_amount)} IQD`;
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
          window.open(whatsappUrl, '_blank');
          toast.success('ğŸ’¬ WhatsApp açılıyor...');
          break;
          
        case 'email':
          // Email gönder (ileride)
          toast.info('ğŸ“§ Email gönderimi yakında eklenecek');
          break;
          
        case 'delete':
          if (confirm('Bu faturayı silmek istediğinizden emin misiniz?')) {
            if (onDelete) {
              onDelete(invoice);
              toast.success('ğŸ—‘ï¸ Fatura silindi');
              onClose();
            }
          }
          break;
          
        default:
          break;
      }
    } catch (error: any) {
      toast.error('❌ İşlem başarısız', {
        description: error.message || 'Bir hata oluştu',
        duration: 3000
      });
    } finally {
      setLoading(null);
    }
  };

  const actionButtons = [
    {
      id: 'view',
      label: 'İncele',
      icon: Eye,
      color: 'text-blue-600 hover:bg-blue-50',
      onClick: () => handleAction('view')
    },
    {
      id: 'edit',
      label: 'Düzenle',
      icon: Edit,
      color: 'text-green-600 hover:bg-green-50',
      onClick: () => handleAction('edit')
    },
    {
      id: 'copy',
      label: 'Kopyala',
      icon: Copy,
      color: 'text-purple-600 hover:bg-purple-50',
      onClick: () => handleAction('copy')
    },
    {
      id: 'print',
      label: 'Yazdır',
      icon: Printer,
      color: 'text-gray-600 hover:bg-gray-50',
      onClick: () => handleAction('print')
    },
    {
      id: 'pdf',
      label: 'PDF İndir',
      icon: Download,
      color: 'text-indigo-600 hover:bg-indigo-50',
      onClick: () => handleAction('pdf')
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp\'tan Gönder',
      icon: MessageSquare,
      color: 'text-green-600 hover:bg-green-50',
      onClick: () => handleAction('whatsapp')
    },
    {
      id: 'email',
      label: 'E-posta Gönder',
      icon: Send,
      color: 'text-blue-600 hover:bg-blue-50',
      onClick: () => handleAction('email')
    },
    {
      id: 'delete',
      label: 'Sil',
      icon: Trash2,
      color: 'text-red-600 hover:bg-red-50',
      onClick: () => handleAction('delete'),
      destructive: true
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Fatura İşlemleri</h3>
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
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Tutar:</span>
              <span className="ml-2 font-semibold text-gray-900">
                {formatMoney(invoice.total_amount)} IQD
              </span>
            </div>
            <div>
              <span className="text-gray-600">Durum:</span>
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
                <span className="text-gray-600">Müşteri:</span>
                <span className="ml-2 font-medium text-gray-900">{invoice.customer_name}</span>
              </div>
            )}
            {invoice.supplier_name && (
              <div>
                <span className="text-gray-600">Tedarikçi:</span>
                <span className="ml-2 font-medium text-gray-900">{invoice.supplier_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-1 overflow-auto p-6">
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}




