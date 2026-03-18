import { Send, CheckCircle, XCircle, Clock, Download, Maximize2, Minimize2, Upload, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { eTransformService, type EDocument, type EInvoiceData } from '../../services/eTransformService';
import { toast } from 'sonner';

export function ETransformModule() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [documents, setDocuments] = useState<EDocument[]>([
    { id: 'EFAT-2025-0001', type: 'E-Fatura', customer: 'Mohammed Hassan A.Ş.', date: '2025-12-04', amount: 14750.00, taxAmount: 2655, status: 'Gönderildi', uuid: 'a1b2c3d4-e5f6-7890', createdAt: '2025-12-04T10:00:00Z' },
    { id: 'EARS-2025-0001', type: 'E-Arşiv', customer: 'Layla Hassan', date: '2025-12-03', amount: 10325.59, taxAmount: 1858.6, status: 'Onaylandı', uuid: 'b2c3d4e5-f6g7-8901', createdAt: '2025-12-03T10:00:00Z' },
    { id: 'EFAT-2025-0002', type: 'E-Fatura', customer: 'Kareem Al-Basri Tic.', date: '2025-11-30', amount: 4956.00, taxAmount: 892, status: 'Beklemede', uuid: 'c3d4e5f6-g7h8-9012', createdAt: '2025-11-30T10:00:00Z' },
    { id: 'EIRS-2025-0001', type: 'E-İrsaliye', customer: 'Bashar Al-Mosuli A.Ş.', date: '2025-12-01', amount: 21476.00, taxAmount: 3865, status: 'Gönderildi', uuid: 'd4e5f6g7-h8i9-0123', createdAt: '2025-12-01T10:00:00Z' },
    { id: 'EFAT-2025-0003', type: 'E-Fatura', customer: 'Esra Yıldız', date: '2025-11-29', amount: 11623.00, taxAmount: 2092, status: 'Reddedildi', uuid: 'e5f6g7h8-i9j0-1234', createdAt: '2025-11-29T10:00:00Z' },
  ]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Test e-Invoice oluştur
  const handleTestInvoice = async () => {
    setLoading(true);
    toast.info('Test e-Fatura oluşturuluyor...');

    const testData: EInvoiceData = {
      invoiceNumber: `EFAT-2025-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      seller: {
        name: 'ExRetailOS Iraq LLC',
        taxNumber: '1234567890',
        taxOffice: 'Baghdad',
        address: 'Baghdad, Iraq'
      },
      buyer: {
        name: 'Test Müşteri Ltd.',
        taxNumber: '0987654321',
        taxOffice: 'Erbil',
        address: 'Erbil, Kurdistan'
      },
      items: [
        { name: 'Ürün 1', quantity: 2, unitPrice: 100, taxRate: 18, amount: 200 },
        { name: 'Ürün 2', quantity: 1, unitPrice: 150, taxRate: 18, amount: 150 }
      ],
      totalAmount: 350,
      totalTax: 63,
      grandTotal: 413
    };

    try {
      const result = await eTransformService.createAndSendEInvoice(testData);
      setDocuments(prev => [result, ...prev]);
      
      if (result.status === 'Gönderildi') {
        toast.success(`e-Fatura başarıyla gönderildi: ${result.id}`);
      } else {
        toast.error(`e-Fatura reddedildi: ${result.errorMessage}`);
      }
    } catch (error) {
      toast.error('e-Fatura oluşturma hatası');
    } finally {
      setLoading(false);
    }
  };

  // Durum sorgula
  const handleCheckStatus = async (uuid: string) => {
    toast.info('Durum sorgulanıyor...');
    
    try {
      const response = await eTransformService.checkDocumentStatus(uuid);
      
      if (response.success) {
        setDocuments(prev => prev.map(doc => 
          doc.uuid === uuid 
            ? { ...doc, status: response.message as any, gibResponse: response }
            : doc
        ));
        toast.success(`Durum: ${response.message}`);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('Durum sorgulanamadı');
    }
  };

  // Belge iptal et
  const handleCancelDocument = async (uuid: string) => {
    if (!confirm('Bu belgeyi iptal etmek istediğinizden emin misiniz?')) return;
    
    toast.info('Belge iptal ediliyor...');
    
    try {
      const response = await eTransformService.cancelDocument(uuid, 'Müşteri talebi');
      
      if (response.success) {
        setDocuments(prev => prev.map(doc => 
          doc.uuid === uuid 
            ? { ...doc, status: 'İptal' }
            : doc
        ));
        toast.success('Belge başarıyla iptal edildi');
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('İptal işlemi başarısız');
    }
  };

  // XML indir
  const handleDownloadXML = (doc: EDocument) => {
    if (!doc.xmlContent) {
      toast.error('XML içeriği bulunamadı');
      return;
    }

    const blob = eTransformService.exportToXML(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.id}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('XML indirildi');
  };

  // Toplu gönder
  const handleBulkSend = async () => {
    const pendingDocs = documents.filter(d => d.status === 'Taslak');
    
    if (pendingDocs.length === 0) {
      toast.warning('Gönderilecek taslak belge yok');
      return;
    }

    setLoading(true);
    toast.info(`${pendingDocs.length} belge gönderiliyor...`);

    // Mock bulk send (gerçekte createAndSendEInvoice çağrılır)
    setTimeout(() => {
      setDocuments(prev => prev.map(doc => 
        doc.status === 'Taslak' 
          ? { ...doc, status: 'Gönderildi', sentAt: new Date().toISOString() }
          : doc
      ));
      setLoading(false);
      toast.success(`${pendingDocs.length} belge başarıyla gönderildi`);
    }, 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Gönderildi':
        return { icon: Send, color: 'bg-blue-100 text-blue-700' };
      case 'Onaylandı':
        return { icon: CheckCircle, color: 'bg-green-100 text-green-700' };
      case 'Reddedildi':
        return { icon: XCircle, color: 'bg-red-100 text-red-700' };
      case 'Beklemede':
        return { icon: Clock, color: 'bg-yellow-100 text-yellow-700' };
      default:
        return { icon: Clock, color: 'bg-gray-100 text-gray-700' };
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'E-Fatura': return 'bg-indigo-100 text-indigo-700';
      case 'E-Arşiv': return 'bg-cyan-100 text-cyan-700';
      case 'E-İrsaliye': return 'bg-purple-100 text-purple-700';
      case 'E-Defter': return 'bg-pink-100 text-pink-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-full'} flex flex-col`}>
      {/* Header - Minimal */}
      <div className="bg-purple-600 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4" />
          <h2 className="text-sm">E-Dönüşüm Merkezi</h2>
          <span className="text-purple-200 text-[10px] ml-2">• E-Fatura, E-Arşiv, E-İrsaliye, E-Defter</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2 py-1 bg-purple-700 hover:bg-purple-800 text-[10px] border border-purple-500">
            <Download className="w-3 h-3" />
            Toplu İndir
          </button>
          <button className="flex items-center gap-1 px-2 py-1 bg-white text-purple-700 hover:bg-purple-50 text-[10px]">
            <Send className="w-3 h-3" />
            Toplu Gönder
          </button>
          <div className="w-px h-4 bg-purple-400"></div>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 hover:bg-purple-700 rounded"
            title={isFullscreen ? 'Küçült' : 'Tam Ekran'}
          >
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 bg-gray-50">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">E-Belge Özeti</h3>
          </div>
          <div className="grid grid-cols-5 divide-x divide-gray-200">
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">E-Fatura</div>
              <div className="text-base text-indigo-600">{documents.filter(d => d.type === 'E-Fatura').length}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">E-Arşiv</div>
              <div className="text-base text-cyan-600">{documents.filter(d => d.type === 'E-Arşiv').length}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">E-İrsaliye</div>
              <div className="text-base text-purple-600">{documents.filter(d => d.type === 'E-İrsaliye').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Onaylanan</span>
              </div>
              <div className="text-base text-green-600">{documents.filter(d => d.status === 'Onaylandı').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Bekleyen</span>
              </div>
              <div className="text-base text-blue-600">{documents.filter(d => d.status === 'Beklemede').length}</div>
            </div>
          </div>
        </div>

        {/* Tablo - Minimal */}
        <div className="bg-white border border-gray-300">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">BELGE NO</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">TİP</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">MÜŞTERİ/CARİ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TARİH</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">TUTAR</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">DURUM</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">UUID</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">İŞLEM</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => {
                const statusBadge = getStatusBadge(doc.status);
                const StatusIcon = statusBadge.icon;
                
                return (
                  <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-2 py-0.5 text-[10px] font-mono border-r border-gray-200">{doc.id}</td>
                    <td className="px-2 py-0.5 text-center border-r border-gray-200">
                      <span className={`px-2 py-0.5 rounded text-[9px] ${getTypeColor(doc.type)}`}>
                        {doc.type}
                      </span>
                    </td>
                    <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{doc.customer}</td>
                    <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(doc.date).toLocaleDateString('tr-TR')}</td>
                    <td className="px-2 py-0.5 text-right text-[10px] text-blue-600 border-r border-gray-200">{doc.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-0.5 text-center border-r border-gray-200">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] ${statusBadge.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-2 py-0.5 text-[9px] font-mono text-gray-500 border-r border-gray-200">{doc.uuid}</td>
                    <td className="px-2 py-0.5 text-center">
                      <button className="p-0.5 text-blue-600 hover:bg-blue-50 rounded" title="İndir">
                        <Download className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
