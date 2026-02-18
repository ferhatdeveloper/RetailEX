import { useState, useEffect, useRef } from 'react';
import {
    FileText, X, Save, Calendar, User, ClipboardList,
    Package, Search, Plus, Trash2, CheckCircle2,
    Building, Info, Clock, ChevronDown, ChevronRight, MoreVertical,
    Briefcase, Truck, CreditCard, LayoutGrid, Settings, History, MoreHorizontal
} from 'lucide-react';
import { APP_VERSION } from '../../../core/version';
import type { Product, PurchaseRequestItem } from '../../../core/types/models';
import { supplierAPI, Supplier } from '../../../services/api/suppliers';
import { toast } from 'sonner';
import { ProductSearchModal } from './ProductSearchModal';
import { SupplierHistoryModal } from '../contacts/SupplierHistoryModal';

interface PurchaseRequestCreatePageProps {
    products: Product[];
    onBack: () => void;
    onSuccess: () => void;
    initialData?: any; // PurchaseRequest type
}

interface RequestItem extends PurchaseRequestItem {
    id: string;
    supplierId?: string;
    variantCode?: string;
    paymentPlan?: string;
    price?: number;
    total?: number;
    projectCode?: string;
    costCenter?: string;
}

export function PurchaseRequestCreatePage({
    products,
    onBack,
    onSuccess,
    initialData
}: PurchaseRequestCreatePageProps) {
    const [activeTab, setActiveTab] = useState<'talep' | 'detaylar' | 'ekler'>('talep');
    const [isFormExpanded, setIsFormExpanded] = useState(true);
    const [loading, setLoading] = useState(false);

    // Header States - Expert Fields
    const [requestNo, setRequestNo] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    const [documentNo, setDocumentNo] = useState('');
    const [projectCode, setProjectCode] = useState('');

    // Location Info
    const [workplace, setWorkplace] = useState('000, Merkez');
    const [department, setDepartment] = useState('000, Genel');
    const [factory, setFactory] = useState('000, Merkez Fabrika');
    const [warehouse, setWarehouse] = useState('000, Merkez Depo');

    // Authority & Status
    const [specialCode, setSpecialCode] = useState('');
    const [authCode, setAuthCode] = useState('');
    const [status, setStatus] = useState('Öneri');
    const [requester, setRequester] = useState('LOGO');

    // Data
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    // Items State
    const [items, setItems] = useState<RequestItem[]>([
        {
            id: '1',
            productCode: '',
            productName: '',
            variantCode: '',
            quantity: 1,
            unit: 'Adet',
            price: 0,
            total: 0,
            supplierId: '',
            paymentPlan: '',
            requestedDeliveryDate: new Date().toISOString().split('T')[0],
            projectCode: '',
            costCenter: '',
            status: 'draft',
        }
    ]);
    const [showProductSearchModal, setShowProductSearchModal] = useState(false);
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [searchingRowIndex, setSearchingRowIndex] = useState(-1);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);

    // Supplier History State
    const [showSupplierHistory, setShowSupplierHistory] = useState(false);
    const [selectedSupplierHistory, setSelectedSupplierHistory] = useState<{ name: string, id: string } | null>(null);

    // Column Visibility State
    const [columnVisibility, setColumnVisibility] = useState({
        type: true,
        code: true,
        description: true,
        variant: true,
        quantity: true,
        unit: true,
        price: true,
        total: true,
        supplier: true,
        paymentPlan: true,
        deliveryDate: true,
        projectCode: false,
        costCenter: false,
        brand: false,
        description2: false,
    });

    // Dynamic Height Calculation for Grid
    const [gridHeight, setGridHeight] = useState('calc(100vh - 380px)');

    useEffect(() => {
        loadSuppliers();
        if (initialData) {
            setRequestNo(initialData.requestNo);
            setDate(initialData.date);
            // ... (rest of mapping)
        } else {
            const random = Math.floor(1000 + Math.random() * 9000);
            setRequestNo(`TR-${random}`);
        }
    }, [initialData]);

    // Update grid height based on form expansion
    useEffect(() => {
        setGridHeight(isFormExpanded ? 'calc(100vh - 380px)' : 'calc(100vh - 180px)');
    }, [isFormExpanded]);

    const loadSuppliers = async () => {
        try {
            const data = await supplierAPI.getAll();
            setSuppliers(data);
        } catch (error) {
            console.error('Error loading suppliers:', error);
            toast.error('Tedarikçiler yüklenirken hata oluştu');
        }
    };

    const handleAddItem = () => {
        setItems([
            ...items,
            {
                id: Date.now().toString(),
                productCode: '',
                productName: '',
                variantCode: '',
                quantity: 1,
                unit: 'Adet',
                price: 0,
                total: 0,
                supplierId: '',
                paymentPlan: '',
                requestedDeliveryDate: new Date().toISOString().split('T')[0],
                projectCode: '',
                costCenter: '',
                status: 'draft',
            }
        ]);
    };

    const removeItem = (id: string) => {
        if (items.length === 1) return;
        setItems(items.filter(item => item.id !== id));
    };

    const updateItem = (id: string, field: string, value: any) => {
        setItems(items.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };
                // Auto-calc total
                if (field === 'quantity' || field === 'price') {
                    updatedItem.total = (updatedItem.quantity || 0) * (updatedItem.price || 0);
                }
                return updatedItem;
            }
            return item;
        }));
    };

    const handleProductSelect = (product: Product) => {
        if (searchingRowIndex >= 0) {
            // Update existing row
            setItems(items.map((item, index) => {
                if (index === searchingRowIndex) {
                    return {
                        ...item,
                        productId: product.id,
                        productCode: product.code || '',
                        productName: product.name,
                        unit: product.unit || 'Adet',
                        price: product.price || 0,
                        total: (product.price || 0) * (item.quantity || 1)
                    };
                }
                return item;
            }));
        } else {
            // Add new row (fallback)
            setItems([
                ...items,
                {
                    id: Date.now().toString(),
                    productId: product.id,
                    productCode: product.code || '',
                    productName: product.name,
                    variantCode: '',
                    quantity: 1,
                    unit: product.unit || 'Adet',
                    price: product.price || 0,
                    total: (product.price || 0),
                    supplierId: '',
                    paymentPlan: '',
                    requestedDeliveryDate: new Date().toISOString().split('T')[0],
                    projectCode: '',
                    costCenter: '',
                    status: 'draft',
                }
            ]);
        }
        setShowProductSearchModal(false);
        setProductSearchTerm('');
        setSearchingRowIndex(-1);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
        (p.code && p.code.toLowerCase().includes(productSearchTerm.toLowerCase()))
    );

    const handleSave = async (status: 'draft' | 'pending' = 'draft') => {
        setLoading(true);
        setTimeout(() => {
            toast.success('Talep Fişi Kaydedildi');
            onSuccess();
            setLoading(false);
        }, 500);
    };

    return (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-gray-100 font-sans">
            {/* 1. Top Header Bar - Universal Style */}
            <div className="bg-blue-600 text-white flex-shrink-0 shadow-md h-12">
                <div className="h-full px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-1.5 rounded-lg">
                            <ClipboardList className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-sm font-bold tracking-wide uppercase leading-none">Satın Alma Talebi</h2>
                            <span className="text-[10px] text-blue-100 opacity-90 leading-tight mt-0.5">Yeni Talep Oluştur</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Universal Action Buttons */}
                        <div className="flex bg-blue-700/50 rounded-lg p-0.5 border border-blue-500/30 relative">
                            <button
                                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                                className="px-3 py-1.5 flex items-center gap-1.5 hover:bg-white/10 rounded-md transition-all text-xs font-medium"
                            >
                                <Settings className="w-3.5 h-3.5" />
                                <span>Ayarlar</span>
                            </button>

                            {/* Settings Dropdown */}
                            {showSettingsMenu && (
                                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-[100] p-2">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">Kolon Görünümü</div>
                                    <div className="space-y-0.5">
                                        {[
                                            { id: 'type', label: 'Tür' },
                                            { id: 'code', label: 'Kod' },
                                            { id: 'description', label: 'Açıklama' },
                                            { id: 'variant', label: 'Varyant' },
                                            { id: 'supplier', label: 'Tedarikçi' },
                                            { id: 'paymentPlan', label: 'Ödeme Planı' },
                                            { id: 'deliveryDate', label: 'Teslim Tarihi' },
                                            { id: 'projectCode', label: 'Proje Kodu' },
                                            { id: 'costCenter', label: 'Masraf Merkezi' },
                                            { id: 'brand', label: 'Marka' },
                                            { id: 'description2', label: 'Açıklama 2' },
                                        ].map(col => (
                                            <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={columnVisibility[col.id as keyof typeof columnVisibility]}
                                                    onChange={(e) => setColumnVisibility(prev => ({ ...prev, [col.id]: e.target.checked }))}
                                                    className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                />
                                                <span className="text-xs text-gray-700">{col.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="h-6 w-px bg-blue-500/50 mx-1"></div>
                        <button onClick={() => handleSave('draft')} className="bg-white text-blue-600 hover:bg-blue-50 px-4 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-2">
                            <Save className="w-3.5 h-3.5" />
                            Kaydet
                        </button>
                        <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Tabs Bar */}
            <div className="bg-white border-b border-gray-200 px-4 flex items-end gap-1 h-9 shadow-sm">
                <button
                    onClick={() => setActiveTab('talep')}
                    className={`px-4 py-2 text-xs font-semibold border-t-2 transition-all relative top-[1px] ${activeTab === 'talep'
                        ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-sm border-x border-gray-200'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" />
                        Talep Bilgileri
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('detaylar')}
                    className={`px-4 py-2 text-xs font-semibold border-t-2 transition-all relative top-[1px] ${activeTab === 'detaylar'
                        ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-sm border-x border-gray-200'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Info className="w-3.5 h-3.5" />
                        Detaylar
                    </div>
                </button>
            </div>

            {/* 3. Main Content Area */}
            <div className="flex-1 overflow-hidden p-3 flex flex-col gap-3">
                {/* Form Section - Collapsible */}
                <div className={`bg-white rounded-lg border border-gray-200 shadow-sm transition-all duration-300 ease-in-out ${isFormExpanded ? 'flex-shrink-0' : 'h-10 overflow-hidden'}`}>
                    <div
                        className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => setIsFormExpanded(!isFormExpanded)}
                    >
                        <div className="flex items-center gap-2">
                            {isFormExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                            <span className="text-xs font-bold text-gray-700">Fiş Başlık Bilgileri</span>
                        </div>
                        {!isFormExpanded && (
                            <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                <span><span className="font-semibold">{requestNo}</span></span>
                                <span><span className="font-semibold">{date}</span></span>
                            </div>
                        )}
                    </div>

                    {isFormExpanded && (
                        <div className="p-4 bg-white">
                            {/* Universal Form Layout Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

                                {/* Group 1: Document ID */}
                                <div className="space-y-2.5">
                                    <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-1 mb-2">
                                        <FileText className="w-3 h-3" />
                                        Belge Künyesi
                                    </h4>

                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Fiş No</label>
                                        <div className="relative">
                                            <input type="text" value={requestNo} readOnly className="w-full h-7 px-2 text-xs font-bold text-gray-800 bg-yellow-50/50 border border-gray-300 rounded-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Tarih / Saat</label>
                                        <div className="flex gap-1">
                                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="flex-1 h-7 px-2 text-xs border border-gray-300 rounded-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                                            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-20 h-7 px-2 text-xs border border-gray-300 rounded-sm focus:border-blue-500" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Belge No</label>
                                        <input type="text" value={documentNo} onChange={e => setDocumentNo(e.target.value)} className="w-full h-7 px-2 text-xs border border-gray-300 rounded-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="İsteğe bağlı..." />
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Proje Kodu</label>
                                        <div className="flex">
                                            <input type="text" value={projectCode} onChange={e => setProjectCode(e.target.value)} className="flex-1 h-7 px-2 text-xs border border-gray-300 rounded-l-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300" placeholder="PRJ..." />
                                            <button className="h-7 px-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-sm hover:bg-gray-200 text-gray-500">
                                                <Briefcase className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Group 2: Organizational Unit */}
                                <div className="space-y-2.5">
                                    <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 uppercase tracking-wider border-b border-orange-100 pb-1 mb-2">
                                        <Building className="w-3 h-3" />
                                        Organizasyon
                                    </h4>

                                    <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">İşyeri</label>
                                        <select value={workplace} onChange={e => setWorkplace(e.target.value)} className="w-full h-7 px-1 text-xs border border-gray-300 rounded-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                            <option value="000, Merkez">000, Merkez İşyeri</option>
                                            <option value="001, Şube 1">001, Şube 1</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Bölüm</label>
                                        <select value={department} onChange={e => setDepartment(e.target.value)} className="w-full h-7 px-1 text-xs border border-gray-300 rounded-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                            <option value="000, Genel">000, Genel Müdürlük</option>
                                            <option value="001, Satınalma">001, Satınalma Dept.</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Ambar</label>
                                        <div className="flex">
                                            <select value={warehouse} onChange={e => setWarehouse(e.target.value)} className="flex-1 h-7 px-1 text-xs border border-gray-300 rounded-l-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                                <option value="000, Merkez Depo">000, Merkez Depo</option>
                                                <option value="001, Hammadde">001, Hammadde Depo</option>
                                            </select>
                                            <button className="h-7 px-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-sm hover:bg-gray-200 text-gray-500">
                                                <Search className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Group 3: Status & Auth */}
                                <div className="space-y-2.5">
                                    <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-purple-600 uppercase tracking-wider border-b border-purple-100 pb-1 mb-2">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Durum & Yetki
                                    </h4>

                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Özel Kod</label>
                                        <input type="text" value={specialCode} onChange={e => setSpecialCode(e.target.value)} className="w-full h-7 px-2 text-xs border border-gray-300 rounded-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Yetki Kodu</label>
                                        <input type="text" value={authCode} onChange={e => setAuthCode(e.target.value)} className="w-full h-7 px-2 text-xs border border-gray-300 rounded-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Talep Eden</label>
                                        <div className="flex">
                                            <input type="text" value={requester} onChange={e => setRequester(e.target.value)} className="flex-1 h-7 px-2 text-xs border border-gray-300 rounded-l-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                                            <button className="h-7 px-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-sm hover:bg-gray-200 text-gray-500">
                                                <User className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                                        <label className="text-[11px] font-medium text-gray-600">Durumu</label>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                            {status}
                                        </span>
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}
                </div>

                {/* Grid Section - Universal Style */}
                <div className="flex-1 bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col overflow-hidden">
                    {/* Items Toolbar */}
                    <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-gray-700 uppercase">Talep Satırları</h3>
                            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium">{items.length} Kalem</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleAddItem}
                                className="px-2 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded text-[11px] font-medium flex items-center gap-1 transition-colors shadow-sm"
                            >
                                <Plus className="w-3.5 h-3.5 text-green-600" />
                                Satır Ekle
                            </button>
                            <button className="p-1 hover:bg-gray-200 rounded text-gray-500">
                                <Settings className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="flex-1 overflow-auto" style={{ height: gridHeight }}>
                        <table className="w-full border-collapse">
                            <thead className="sticky top-0 z-[1]">
                                <tr className="bg-[#E3F2FD] border-b border-blue-200 shadow-sm">
                                    <th className="w-8 px-1 py-1.5 text-center text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">#</th>
                                    {columnVisibility.type && <th className="w-20 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">TÜR</th>}
                                    {columnVisibility.code && <th className="w-32 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">KOD</th>}
                                    {columnVisibility.description && <th className="min-w-[200px] px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">AÇIKLAMA</th>}
                                    {columnVisibility.description2 && <th className="min-w-[150px] px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">AÇIKLAMA 2</th>}
                                    {columnVisibility.brand && <th className="w-24 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">MARKA</th>}
                                    {columnVisibility.variant && <th className="w-24 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">VARYANT</th>}
                                    {columnVisibility.projectCode && <th className="w-24 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">PROJE KODU</th>}
                                    {columnVisibility.costCenter && <th className="w-24 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">MASRAF MERKEZİ</th>}
                                    <th className="w-20 px-2 py-1.5 text-right text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">MİKTAR</th>
                                    <th className="w-16 px-2 py-1.5 text-center text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">BİRİM</th>
                                    <th className="w-24 px-2 py-1.5 text-right text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">BİRİM FİYAT</th>
                                    <th className="w-24 px-2 py-1.5 text-right text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">TUTAR</th>
                                    {columnVisibility.supplier && <th className="w-40 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">TEDARİKÇİ</th>}
                                    {columnVisibility.paymentPlan && <th className="w-24 px-2 py-1.5 text-left text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">ÖDEME PLANI</th>}
                                    {columnVisibility.deliveryDate && <th className="w-24 px-2 py-1.5 text-center text-[10px] font-bold text-[#1e293b] border-r border-blue-200/60">TESLİM TARİHİ</th>}
                                    <th className="w-8 px-1 py-1.5 text-center text-[10px] font-bold text-[#1e293b]">s</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {items.map((item, index) => (
                                    <tr key={item.id} className="group hover:bg-blue-50/40 transition-colors">
                                        <td className="px-1 py-0.5 text-center text-[10px] text-gray-500 border-r border-gray-100 bg-gray-50/30 font-mono">
                                            {index + 1}
                                        </td>
                                        {columnVisibility.type && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <select className="w-full text-[10px] bg-transparent border-none focus:ring-0 text-gray-700 p-0 font-medium">
                                                    <option>Malzeme</option>
                                                    <option>Hizmet</option>
                                                </select>
                                            </td>
                                        )}
                                        {columnVisibility.code && (
                                            <td className="px-1 py-0.5 border-r border-gray-100 p-0">
                                                <div className="flex items-center group-focus-within:bg-white rounded-sm">
                                                    <input
                                                        type="text"
                                                        value={item.productCode}
                                                        onChange={e => updateItem(item.id, 'productCode', e.target.value)}
                                                        className="w-full text-[10px] border-none focus:ring-1 focus:ring-blue-400 p-1 bg-transparent font-medium text-blue-700"
                                                        placeholder="Kodu..."
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            setSearchingRowIndex(index);
                                                            setShowProductSearchModal(true);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded text-gray-500 transition-opacity"
                                                    >
                                                        <MoreHorizontal className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                        {columnVisibility.description && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <input
                                                    type="text"
                                                    value={item.productName}
                                                    onChange={e => updateItem(item.id, 'productName', e.target.value)}
                                                    className="w-full text-[10px] border-none focus:ring-1 focus:ring-blue-400 p-1 bg-transparent"
                                                />
                                            </td>
                                        )}

                                        {columnVisibility.description2 && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <input
                                                    type="text"
                                                    className="w-full text-[10px] border-none focus:ring-1 focus:ring-blue-400 p-1 bg-transparent"
                                                />
                                            </td>
                                        )}
                                        {columnVisibility.brand && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <input
                                                    type="text"
                                                    className="w-full text-[10px] border-none focus:ring-1 focus:ring-blue-400 p-1 bg-transparent"
                                                />
                                            </td>
                                        )}
                                        {columnVisibility.variant && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <input
                                                    type="text"
                                                    value={item.variantCode || ''}
                                                    onChange={e => updateItem(item.id, 'variantCode', e.target.value)}
                                                    className="w-full text-[10px] border-none focus:ring-1 focus:ring-blue-400 p-1 bg-transparent"
                                                    placeholder="Siyah, XL..."
                                                />
                                            </td>
                                        )}
                                        <td className="px-1 py-0.5 border-r border-gray-100">
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))}
                                                className="w-full text-[10px] text-right border-none focus:ring-1 focus:ring-blue-400 p-1 bg-transparent font-bold text-gray-800"
                                            />
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-gray-100 text-center">
                                            <span className="text-[10px] text-gray-600">{item.unit}</span>
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-gray-100">
                                            <input
                                                type="number"
                                                value={item.price}
                                                onChange={e => updateItem(item.id, 'price', Number(e.target.value))}
                                                className="w-full text-[10px] text-right border-none focus:ring-1 focus:ring-blue-400 p-1 bg-transparent"
                                            />
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-gray-100">
                                            <div className="text-[10px] text-right font-medium text-gray-700 p-1">
                                                {(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                        </td>
                                        {columnVisibility.supplier && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <div className="flex items-center gap-1 group/supplier">
                                                    <select
                                                        value={item.supplierId || ''}
                                                        onChange={e => updateItem(item.id, 'supplierId', e.target.value)}
                                                        className="w-full text-[10px] border-none focus:ring-0 bg-transparent p-0 text-gray-600 truncate appearance-none"
                                                    >
                                                        <option value="">Seçiniz...</option>
                                                        {suppliers.map(sup => (
                                                            <option key={sup.id} value={sup.id}>{sup.name}</option>
                                                        ))}
                                                    </select>

                                                    {item.supplierId && (
                                                        <button
                                                            onClick={() => {
                                                                const supplier = suppliers.find(s => s.id === item.supplierId);
                                                                if (supplier) {
                                                                    setSelectedSupplierHistory({ id: supplier.id, name: supplier.name });
                                                                    setShowSupplierHistory(true);
                                                                }
                                                            }}
                                                            title="Tedarikçi Geçmişi"
                                                            className="p-0.5 hover:bg-blue-100 text-blue-600 rounded transition-all ml-1 flex-shrink-0"
                                                        >
                                                            <History className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        {columnVisibility.paymentPlan && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <select
                                                    value={item.paymentPlan || ''}
                                                    onChange={e => updateItem(item.id, 'paymentPlan', e.target.value)}
                                                    className="w-full text-[10px] border-none focus:ring-0 bg-transparent p-0 text-gray-600"
                                                >
                                                    <option value="">Peşin</option>
                                                    <option value="30">30 Gün</option>
                                                    <option value="60">60 Gün</option>
                                                </select>
                                            </td>
                                        )}
                                        {columnVisibility.deliveryDate && (
                                            <td className="px-1 py-0.5 border-r border-gray-100">
                                                <input
                                                    type="date"
                                                    value={item.requestedDeliveryDate}
                                                    onChange={e => updateItem(item.id, 'requestedDeliveryDate', e.target.value)}
                                                    className="w-full text-[10px] text-center border-none focus:ring-1 focus:ring-blue-400 p-0 bg-transparent text-gray-500"
                                                />
                                            </td>
                                        )}
                                        <td className="px-1 py-0.5 text-center">
                                            <button
                                                onClick={() => removeItem(item.id)}
                                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Footer Summary - Universal Style */}
                    <div className="bg-gray-50 border-t border-gray-200 p-2 text-right">
                        <div className="inline-flex items-center gap-4 text-xs">
                            <span className="text-gray-500">Toplam Miktar: <strong className="text-gray-800">{items.reduce((acc, i) => acc + (i.quantity || 0), 0)}</strong></span>
                            <div className="h-4 w-px bg-gray-300"></div>
                            <span className="text-gray-600 font-medium">Genel Toplam:</span>
                            <span className="text-lg font-bold text-blue-700">
                                {items.reduce((acc, i) => acc + (i.total || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} TL
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Product Search Modal */}
            {
                showProductSearchModal && (
                    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4 backdrop-blur-md">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[500px] flex flex-col">
                            <div className="p-3 border-b flex items-center justify-between bg-gray-50 rounded-t-lg">
                                <h3 className="font-semibold text-gray-800">Ürün Seçimi</h3>
                                <button onClick={() => setShowProductSearchModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
                            </div>
                            <div className="p-3 border-b bg-white">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Ürün adı, kodu veya barkodu ile ara..."
                                        className="w-full pl-9 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        value={productSearchTerm}
                                        onChange={(e) => setProductSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto p-2">
                                <div className="grid gap-2">
                                    {filteredProducts.map((product) => (
                                        <button
                                            key={product.id}
                                            onClick={() => handleProductSelect(product)}
                                            className="flex items-center justify-between p-3 hover:bg-blue-50 border rounded-md group text-left transition-all"
                                        >
                                            <div>
                                                <div className="font-medium text-gray-900 group-hover:text-blue-700">{product.name}</div>
                                                <div className="text-sm text-gray-500 flex gap-2">
                                                    <span>Kod: {product.code || '-'}</span>
                                                    <span>•</span>
                                                    <span>Stok: {product.stock || 0} {product.unit}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-gray-900 group-hover:text-blue-700">
                                                    {product.price?.toLocaleString()} ₺
                                                </div>
                                                <div className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full inline-block mt-1">
                                                    Seç
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    {filteredProducts.length === 0 && (
                                        <div className="text-center py-8 text-gray-500">Ürün bulunamadı</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* Supplier History Modal */}
            <SupplierHistoryModal
                isOpen={showSupplierHistory}
                onClose={() => setShowSupplierHistory(false)}
                supplierName={selectedSupplierHistory?.name || ''}
                onAddItems={(historyItems) => {
                    const newItems = historyItems.map(hItem => ({
                        id: Date.now().toString() + Math.random().toString().slice(2, 5),
                        productCode: '', // Mock data doesn't have code yet
                        productName: hItem.product,
                        variantCode: '',
                        quantity: hItem.quantity,
                        unit: hItem.unit,
                        price: hItem.price,
                        total: hItem.total,
                        supplierId: selectedSupplierHistory?.id || '',
                        paymentPlan: '',
                        requestedDeliveryDate: new Date().toISOString().split('T')[0],
                        projectCode: '',
                        costCenter: '',
                        status: 'draft',
                    }));
                    setItems([...items, ...newItems]);
                }}
            />
        </div>
    );
}

