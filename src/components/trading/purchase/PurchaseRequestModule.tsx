import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Search, Eye, Check, X, Clock, Package, ShoppingBag, Trash2, ClipboardList } from 'lucide-react';
import { PurchaseRequestCreatePage } from './PurchaseRequestCreatePage';
import type { Product } from '../../../App';
import { purchaseRequestAPI, PurchaseRequest } from '../../../services/purchaseRequestAPI';
import { toast } from 'sonner';

interface PurchaseRequestModuleProps {
    products: Product[];
}

export function PurchaseRequestModule({ products }: PurchaseRequestModuleProps) {
    const [showNewRequestPage, setShowNewRequestPage] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'processed'>('all');
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async () => {
        try {
            setLoading(true);
            const data = await purchaseRequestAPI.getAll();
            setRequests(data);
        } catch (error) {
            console.error('Error loading requests:', error);
            toast.error('Talepler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id: string, status: string) => {
        try {
            await purchaseRequestAPI.updateStatus(id, status);
            toast.success('Talep durumu güncellendi');
            loadRequests();
        } catch (error) {
            toast.error('Durum güncellenemedi');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu talebi silmek istediğinizden emin misiniz?')) return;
        try {
            await purchaseRequestAPI.delete(id);
            toast.success('Talep silindi');
            loadRequests();
        } catch (error) {
            toast.error('Talep silinemedi');
        }
    };

    const filteredRequests = requests.filter((req: PurchaseRequest) => {
        const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
        const matchesSearch =
            req.request_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (req.requester?.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesStatus && matchesSearch;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return { label: 'Beklemede', color: 'bg-yellow-100 text-yellow-700' };
            case 'approved':
                return { label: 'Onaylandı', color: 'bg-blue-100 text-blue-700' };
            case 'processed':
                return { label: 'İşlendi', color: 'bg-green-100 text-green-700' };
            case 'rejected':
                return { label: 'Reddedildi', color: 'bg-red-100 text-red-700' };
            default:
                return { label: status, color: 'bg-gray-100 text-gray-700' };
        }
    };

    // Yeni Talep Sayfası açıksa, onu göster
    if (showNewRequestPage) {
        return (
            <PurchaseRequestCreatePage
                products={products}
                onBack={() => setShowNewRequestPage(false)}
                onSuccess={() => {
                    setShowNewRequestPage(false);
                    loadRequests();
                }}
            />
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header - Minimal */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" />
                        <h2 className="text-sm">Satın Alma Talepleri</h2>
                    </div>
                    <button
                        onClick={() => setShowNewRequestPage(true)}
                        className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
                    >
                        <Plus className="w-3 h-3" />
                        Yeni Talep Oluştur
                    </button>
                </div>
            </div>

            {/* Filters & Search - Kompakt */}
            <div className="bg-white border-b px-3 py-2">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
                        <input
                            type="text"
                            placeholder="Talep no, talep eden..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-7 pr-2 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-600">Durum:</span>
                        <div className="flex gap-1">
                            {[
                                { value: 'all', label: 'Tümü' },
                                { value: 'pending', label: 'Beklemede' },
                                { value: 'approved', label: 'Onaylı' },
                                { value: 'processed', label: 'İşlendi' }
                            ].map(status => (
                                <button
                                    key={status.value}
                                    onClick={() => setStatusFilter(status.value as any)}
                                    className={`px-2 py-0.5 rounded text-[9px] transition-colors ${statusFilter === status.value
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {status.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
                {/* Kurumsal Özet Panel */}
                <div className="bg-white border border-gray-300 rounded mb-3">
                    <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
                        <h3 className="text-[11px] text-gray-700">Talep Özeti</h3>
                    </div>
                    <div className="grid grid-cols-4 divide-x divide-gray-200">
                        <div className="p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-4 h-4 text-yellow-600" />
                                <span className="text-[10px] text-gray-600">Bekleyen</span>
                            </div>
                            <div className="text-base text-gray-900">{requests.filter((r) => r.status === 'pending').length}</div>
                        </div>
                        <div className="p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Check className="w-4 h-4 text-blue-600" />
                                <span className="text-[10px] text-gray-600">Onaylanan</span>
                            </div>
                            <div className="text-base text-gray-900">{requests.filter((r) => r.status === 'approved').length}</div>
                        </div>
                        <div className="p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Package className="w-4 h-4 text-green-600" />
                                <span className="text-[10px] text-gray-600">İşlendi</span>
                            </div>
                            <div className="text-base text-gray-900">{requests.filter((r) => r.status === 'processed').length}</div>
                        </div>
                        <div className="p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <ClipboardList className="w-4 h-4 text-purple-600" />
                                <span className="text-[10px] text-gray-600">Toplam Talep</span>
                            </div>
                            <div className="text-base text-purple-600">
                                {requests.length}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tablo - Minimal */}
                <div className="bg-white border border-gray-300">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-[#E3F2FD] border-b border-gray-300">
                                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TALEP NO</th>
                                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TARİH</th>
                                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TALEP EDEN</th>
                                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">PROJE</th>
                                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">DURUM</th>
                                <th className="px-2 py-1 text-center text-[10px] text-gray-700">İŞLEMLER</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-4 text-[10px]">Yükleniyor...</td></tr>
                            ) : filteredRequests.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-4 text-[10px]">Talep bulunamadı</td></tr>
                            ) : filteredRequests.map((req) => {
                                const statusBadge = getStatusBadge(req.status);
                                return (
                                    <tr key={req.id} className="border-b border-gray-200 hover:bg-gray-50">
                                        <td className="px-2 py-0.5 text-[10px] font-mono border-r border-gray-200">{req.request_no}</td>
                                        <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">
                                            {new Date(req.request_date).toLocaleDateString('tr-TR')}
                                        </td>
                                        <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{req.requester || '-'}</td>
                                        <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{req.project_code || '-'}</td>
                                        <td className="px-2 py-0.5 text-center border-r border-gray-200">
                                            <span className={`px-2 py-0.5 rounded text-[9px] ${statusBadge.color}`}>
                                                {statusBadge.label}
                                            </span>
                                        </td>
                                        <td className="px-2 py-0.5 text-center">
                                            <div className="flex items-center justify-center gap-0.5">
                                                <button className="p-0.5 text-blue-600 hover:bg-blue-50 rounded" title="Görüntüle">
                                                    <Eye className="w-3 h-3" />
                                                </button>
                                                {req.status === 'pending' && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(req.id, 'approved')}
                                                        className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                                                        title="Onayla"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                )}
                                                {['pending', 'approved'].includes(req.status) && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(req.id, 'rejected')}
                                                        className="p-0.5 text-orange-600 hover:bg-orange-50 rounded"
                                                        title="Reddet"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(req.id)}
                                                    className="p-0.5 text-red-600 hover:bg-red-50 rounded"
                                                    title="Sil"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
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

