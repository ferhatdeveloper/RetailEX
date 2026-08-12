import { useState } from 'react';
import { AlertCircle, Loader2, Download, FileDown, FileText, CheckCircle, Clock } from 'lucide-react';
import { exportInvoicesToLogoXML, downloadXMLFile } from '../../shared/logoXmlExport';

interface PendingInvoice {
  id: string;
  invoiceNo: string;
  type: 'sales' | 'purchase' | 'return';
  date: string;
  total: number;
  customerName: string;
  customerId?: string;
  items: any[];
  status: 'pending' | 'syncing' | 'synced' | 'error';
}

interface LogoGo3IntegrationProps {
  pendingInvoices: PendingInvoice[];
  onInvoicesExported: (invoiceIds: string[]) => void;
}

export function LogoGo3Integration({ pendingInvoices, onInvoicesExported }: LogoGo3IntegrationProps) {
  const [firmNo, setFirmNo] = useState('001');
  const [period, setPeriod] = useState('2025');
  
  const handleExportXML = () => {
    const pendingItems = pendingInvoices.filter(i => i.status === 'pending');
    
    if (pendingItems.length === 0) {
      return;
    }
    
    // Generate XML
    const xml = exportInvoicesToLogoXML(pendingItems as any, firmNo, period);
    
    // Download XML file
    const filename = `logo_faturalar_${new Date().toISOString().slice(0, 10)}.xml`;
    downloadXMLFile(xml, filename);
    
    // Notify parent about exported invoices
    const exportedIds = pendingItems.map(i => i.id);
    onInvoicesExported(exportedIds);
  };
  
  return (
    <div className="space-y-4">
      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm text-blue-900 mb-1">Logo Go3 / SQL&Go için XML Export</h4>
            <p className="text-sm text-blue-800">
              Logo Go3 serisinde REST API olmadığı için offline kesilen faturalar XML dosyası olarak dışa aktarılır.
              Bu XML dosyasını Logo'nun {"'Dosyadan Aktar'"} özelliği ile içe aktarabilirsiniz.
            </p>
          </div>
        </div>
      </div>
      
      {/* Firm Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1.5">Firma No</label>
          <input
            type="text"
            value={firmNo}
            onChange={(e) => setFirmNo(e.target.value)}
            placeholder="001"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        
        <div>
          <label className="block text-sm text-gray-700 mb-1.5">Dönem</label>
          <input
            type="text"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2025"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>
      
      {/* Pending Invoices */}
      {pendingInvoices.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Bekleyen fatura yok</p>
          <p className="text-sm mt-1">Offline kesilen faturalar burada görünecek</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pendingInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                invoice.status === 'synced'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className={`w-5 h-5 ${
                  invoice.status === 'synced' ? 'text-green-600' : 'text-yellow-600'
                }`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900">{invoice.invoiceNo}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      invoice.type === 'sales' ? 'bg-blue-100 text-blue-700' :
                      invoice.type === 'purchase' ? 'bg-purple-100 text-purple-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {invoice.type === 'sales' ? 'Satış' : invoice.type === 'purchase' ? 'Alış' : 'İade'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {invoice.customerName} • {invoice.date} • {invoice.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              
              <div>
                {invoice.status === 'synced' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <Clock className="w-5 h-5 text-yellow-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Export Button */}
      {pendingInvoices.some(i => i.status === 'pending') && (
        <button
          onClick={handleExportXML}
          className="w-full px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
        >
          <FileDown className="w-5 h-5" />
          XML Dosyası İndir ({pendingInvoices.filter(i => i.status === 'pending').length} Fatura)
        </button>
      )}
      
      {/* Instructions */}
      {pendingInvoices.some(i => i.status === 'pending') && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-sm text-gray-900 mb-2">XML Dosyasını Logo'ya Nasıl Aktarırım?</h4>
          <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
            <li>Yukarıdaki butona tıklayarak XML dosyasını indirin</li>
            <li>Logo'yu açın ve {'"Dosya > Aktar > XML Dosyasından"'} menüsüne gidin</li>
            <li>İndirdiğiniz XML dosyasını seçin</li>
            <li>İçe aktarma ayarlarını kontrol edin ve onaylayın</li>
            <li>Faturalar Logo'ya aktarıldıktan sonra burada {'"Senkronize Edildi"'} olarak işaretlenecek</li>
          </ol>
        </div>
      )}
    </div>
  );
}

