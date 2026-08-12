import { Send, CheckCircle, XCircle, Clock, Download, Maximize2, Minimize2, FileText, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { eTransformService, type EDocument, type EInvoiceData } from '../../services/eTransformService';
import { getEInvoiceResolvedConfig, type EInvoiceResolvedConfig } from '../../config/eInvoice.config';
import { listGibQueueAsDocuments, sendAllDrafts, persistManualTestDocument } from '../../services/gibEdocumentQueueService';
import { toast } from 'sonner';

export function ETransformModule() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [invCfg, setInvCfg] = useState<EInvoiceResolvedConfig | null>(null);
  const [documents, setDocuments] = useState<EDocument[]>([]);

  const reloadQueue = useCallback(async () => {
    try {
      const docs = await listGibQueueAsDocuments();
      setDocuments(docs);
    } catch (e) {
      console.warn('[ETransform] kuyruk okunamadı', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      eTransformService.resetConfigCache();
      const c = await getEInvoiceResolvedConfig();
      if (!cancelled) {
        setInvCfg(c);
        if (c.eInvoiceFeaturesEnabled) {
          await reloadQueue();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadQueue]);
  const [loading, setLoading] = useState(false);

  // Test e-Invoice oluştur
  const handleTestInvoice = async () => {
    setLoading(true);
    toast.info('Test e-Fatura oluşturuluyor...');

    const testData: EInvoiceData = {
      invoiceNumber: `EFAT-2025-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      seller: {
        name: 'RetailEX Demo A.Ş.',
        taxNumber: '1234567890',
        taxOffice: 'Kadıköy',
        address: 'İstanbul'
      },
      buyer: {
        name: 'Test Alıcı Ltd.',
        taxNumber: '0987654321',
        taxOffice: 'Beşiktaş',
        address: 'İstanbul'
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
      try {
        await persistManualTestDocument(result, testData);
      } catch (persistErr) {
        console.warn('[ETransform] test kaydı yazılamadı', persistErr);
      }
      await reloadQueue();

      if (result.status === 'Gönderildi') {
        toast.success(`Mock GİB: e-Fatura kaydedildi (${result.id})`);
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

  const handleBulkSend = async () => {
    const pendingDocs = documents.filter(d => d.status === 'Taslak');
    if (pendingDocs.length === 0) {
      toast.warning('Gönderilecek taslak yok (fatura listesinden kuyruğa ekleyin)');
      return;
    }
    setLoading(true);
    toast.info(`${pendingDocs.length} taslak mock GİB ile gönderiliyor...`);
    try {
      await sendAllDrafts();
      await reloadQueue();
      toast.success('Taslaklar işlendi (mock GİB yanıtı veritabanına yazıldı)');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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

  if (!invCfg) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 text-sm text-gray-600">
        e-Dönüşüm yapılandırması yükleniyor…
      </div>
    );
  }

  if (!invCfg.eInvoiceFeaturesEnabled) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-8 text-center max-w-lg mx-auto">
        <FileText className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-lg font-semibold text-gray-800 mb-2">e-Dönüşüm bu kurulumda kapalı</h2>
        <p className="text-sm text-gray-600">
          Aktif firma için <strong>İşletme bölgesi</strong> <strong>TR</strong> değil. Bunu{' '}
          <strong>Sistem Yönetimi → Firma / Dönem / Şube</strong> ekranında ilgili <strong>firma kartı</strong>ndan
          &quot;Mevzuat / e-Belge&quot; alanında <strong>Türkiye (TR)</strong> yapıp kaydedin (veritabanı:
          <code className="text-xs bg-gray-200 px-1 rounded">firms.regulatory_region</code>).
          Yedek olarak masaüstü kurulumda veya <code className="text-xs bg-gray-200 px-1 rounded">VITE_REGULATORY_REGION=TR</code> kullanılabilir.
        </p>
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-full'} flex flex-col`}>
      {/* Header - Minimal */}
      <div className="bg-purple-600 text-white px-4 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Send className="w-4 h-4" />
          <h2 className="text-sm">E-Dönüşüm Merkezi</h2>
          <span className="text-purple-200 text-[10px] ml-2">• Kuyruk: PostgreSQL · GİB yanıtı mock</span>
          <span
            className="text-[10px] bg-purple-800/80 px-2 py-0.5 rounded border border-purple-400/40"
            title={`${invCfg.environmentLabel} — kaynak: ${invCfg.source === 'database' ? 'Veritabanı (firma)' : invCfg.source === 'tauri' ? 'config.db (kurulum)' : 'Vite env'}`}
          >
            {invCfg.environmentLabel}
            {invCfg.source === 'database' ? ' · DB' : invCfg.source === 'tauri' ? ' · cfg' : ' · env'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleTestInvoice()}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-purple-950 text-[10px] font-semibold rounded border border-amber-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Test e-Fatura (mock)
          </button>
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
                const rowKey = doc.queueRecordId || `${doc.id}-${doc.uuid}`;

                return (
                  <tr key={rowKey} className="border-b border-gray-200 hover:bg-gray-50">
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
                      <button
                        type="button"
                        className="p-0.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40"
                        title="XML indir"
                        disabled={!doc.xmlContent}
                        onClick={() => {
                          if (doc.xmlContent) handleDownloadXML(doc);
                          else toast.warning('Önce gönderim yapın veya XML üretilmemiş');
                        }}
                      >
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
