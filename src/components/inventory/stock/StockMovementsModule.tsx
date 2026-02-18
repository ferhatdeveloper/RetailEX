import React, { useState, useEffect } from 'react';
import {
    TrendingDown, Plus, Search, Trash2, X, Edit2, Eye,
    Printer, RefreshCw, Filter, ChevronLeft, ChevronRight,
    MoreHorizontal, FileText, Download, Share2, Check
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { stockMovementAPI, StockMovement } from '../../../services/stockMovementAPI';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

export function StockMovementsModule() {
    const { t, tm } = useLanguage();
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'in' | 'out'>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        loadMovements();
    }, []);

    const loadMovements = async () => {
        try {
            setLoading(true);
            const data = await stockMovementAPI.getAll();
            setMovements(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string | null) => {
        const targetId = id || selectedId;
        if (!targetId) return;

        if (!confirm(tm('deleteTransactionConfirm'))) return;
        try {
            await stockMovementAPI.delete(targetId);
            loadMovements();
            setSelectedId(null);
        } catch (error) {
            alert(tm('deleteError'));
        }
    };

    const filteredMovements = movements.filter((m: StockMovement) => {
        const matchesTab = activeTab === 'all' || m.movement_type === activeTab;
        const matchesSearch = m.document_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m as any).warehouses?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesTab && matchesSearch;
    });

    return (
        <div className="h-full flex flex-col bg-[#f8f9fa]">
            {/* Header Section */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center border border-orange-100 shadow-sm">
                        <TrendingDown className="w-7 h-7 text-orange-500" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 leading-tight">{tm('materialTransactionSlips')}</h1>
                        <p className="text-sm text-gray-500">{tm('viewStockMovements')}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder={`${tm('search')}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-64 h-10 bg-gray-50 border-gray-200 focus:bg-white transition-all rounded-lg"
                        />
                    </div>
                </div>
            </div>

            {/* Logo Style Toolbar */}
            <div className="bg-white border-b px-4 py-1.5 flex items-center justify-between shadow-sm sticky top-0 z-10 transition-all">
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCreateModal(true)}
                        className="h-9 px-3 gap-2 text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-medium">{tm('add')}</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={!selectedId}
                        className="h-9 px-3 gap-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-40"
                    >
                        <Edit2 className="w-4 h-4" />
                        <span className="text-sm font-medium">{tm('edit')}</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={!selectedId}
                        className="h-9 px-3 gap-2 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-40"
                    >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm font-medium">{tm('view')}</span>
                    </Button>
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(null)}
                        disabled={!selectedId}
                        className="h-9 px-3 gap-2 text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm font-medium">{tm('delete')}</span>
                    </Button>
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-3 gap-2 text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        <span className="text-sm font-medium">{tm('print')}</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadMovements}
                        className="h-9 px-3 gap-2 text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span className="text-sm font-medium">{tm('refresh')}</span>
                    </Button>
                </div>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-gray-600 hover:bg-gray-100 transition-colors">
                        <Filter className="w-4 h-4" />
                        <span className="text-sm font-medium">{tm('filter')}</span>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 transition-colors">
                                <MoreHorizontal className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem className="gap-2">
                                <Download className="w-4 h-4" />
                                {tm('export')} Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                                <FileText className="w-4 h-4" />
                                {tm('export')} PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                                <Share2 className="w-4 h-4" />
                                {tm('share')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="bg-white border-b px-6 flex items-center justify-between">
                <div className="flex">
                    {['all', 'in', 'out'].map((tab: string) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-5 py-3.5 text-sm font-semibold transition-all relative ${activeTab === tab
                                ? 'text-orange-600 bg-orange-50/50'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            {tab === 'all' ? tm('all') : tab === 'in' ? tm('in') : tm('out')}
                            {activeTab === tab && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600" />
                            )}
                        </button>
                    ))}
                </div>
                <div className="text-xs font-medium text-gray-400 italic">
                    {filteredMovements.length} {tm('recordsCounter')}
                </div>
            </div>

            {/* Data Grid Section */}
            <div className="flex-1 overflow-auto p-4">
                {loading && movements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
                        <p className="text-sm text-gray-500 font-medium">{tm('loading')}...</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/80 border-b border-gray-200 sticky top-0 z-20">
                                        <th className="px-4 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] border-r border-gray-100">{tm('slipNo')}</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] border-r border-gray-100">{tm('date')}</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] border-r border-gray-100">{tm('type')}</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] border-r border-gray-100">{tm('warehouse')}</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] border-r border-gray-100">{tm('status')}</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600 uppercase tracking-wider text-[11px] text-center">{tm('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredMovements.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-24 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                                        <TrendingDown className="w-8 h-8 text-gray-300" />
                                                    </div>
                                                    <p className="text-gray-400 font-medium">{tm('noTransactionSlip')}</p>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="mt-2 border-dashed"
                                                        onClick={() => setShowCreateModal(true)}
                                                    >
                                                        <Plus className="w-4 h-4 mr-2" />
                                                        {tm('add')}
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredMovements.map((m: StockMovement) => {
                                            const isSelected = selectedId === m.id;
                                            return (
                                                <tr
                                                    key={m.id}
                                                    onClick={() => setSelectedId(isSelected ? null : m.id)}
                                                    className={`group transition-all cursor-pointer border-l-4 ${isSelected
                                                        ? 'bg-orange-50/40 border-l-orange-500'
                                                        : 'hover:bg-gray-50 border-l-transparent'
                                                        }`}
                                                >
                                                    <td className="px-4 py-2.5 font-mono font-medium text-gray-700 border-r border-gray-50 whitespace-nowrap">{m.document_no}</td>
                                                    <td className="px-4 py-2.5 text-gray-600 border-r border-gray-50 whitespace-nowrap">{new Date(m.movement_date).toLocaleDateString('tr-TR')}</td>
                                                    <td className="px-4 py-2.5 border-r border-gray-50">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${m.movement_type === 'in'
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {m.movement_type === 'in' ? tm('in') : tm('out')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-gray-600 border-r border-gray-50">{(m as any).warehouses?.name || '-'}</td>
                                                    <td className="px-4 py-2.5 border-r border-gray-50">
                                                        <span className="flex items-center gap-1.5">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${m.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-gray-400'}`} />
                                                            <span className="text-gray-700 font-medium capitalize">{m.status}</span>
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                                                                onClick={(e: React.MouseEvent) => {
                                                                    e.stopPropagation();
                                                                    handleDelete(m.id);
                                                                }}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Status Bar */}
            <div className="bg-white border-t px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 font-medium">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 uppercase tracking-tighter">{tm('status')}:</span>
                        <span className="text-green-600 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            {tm('systemActive')}
                        </span>
                    </div>
                    <div className="w-px h-3 bg-gray-200" />
                    <div>
                        <span className="text-gray-400 mr-2 uppercase tracking-tighter">{tm('total')}:</span>
                        <span className="text-gray-900">{movements.length} {tm('records')}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-30" disabled>
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 rounded border border-gray-100">
                        <span className="text-gray-900 font-bold">1</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-500">1</span>
                    </div>
                    <button className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-30" disabled>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                    <Plus className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">{tm('add')} - {tm('materialTransactionSlips')}</h2>
                                    <p className="text-orange-100 text-sm">{tm('new')} {tm('slipNo')}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
                            >
                                <X className="w-5 h-5 text-white" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-6">
                                {/* Document Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            {tm('slipNo')} *
                                        </label>
                                        <Input
                                            placeholder="AUTO-GENERATED"
                                            disabled
                                            className="bg-gray-50 font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            {tm('date')} *
                                        </label>
                                        <Input
                                            type="date"
                                            defaultValue={new Date().toISOString().split('T')[0]}
                                            className="font-medium"
                                        />
                                    </div>
                                </div>

                                {/* Movement Type */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        {tm('type')} *
                                    </label>
                                    <div className="flex gap-3">
                                        <button className="flex-1 px-4 py-3 rounded-lg border-2 border-green-200 bg-green-50 text-green-700 font-semibold hover:bg-green-100 transition-colors">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                                {tm('in')}
                                            </div>
                                        </button>
                                        <button className="flex-1 px-4 py-3 rounded-lg border-2 border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-2 h-2 bg-red-500 rounded-full" />
                                                {tm('out')}
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* Warehouse */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        {tm('warehouse')} *
                                    </label>
                                    <Input
                                        placeholder={`${tm('selectWarehouse')}...`}
                                        className="font-medium"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        {tm('description')}
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder={`${tm('enterValue')}...`}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                                    />
                                </div>

                                {/* Info Box */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex gap-3">
                                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-white text-xs font-bold">i</span>
                                        </div>
                                        <div className="text-sm text-blue-800">
                                            <p className="font-semibold mb-1">{tm('information')}</p>
                                            <p className="text-blue-700">{tm('slipAutoGenerateInfo')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-between">
                            <Button
                                variant="outline"
                                onClick={() => setShowCreateModal(false)}
                                className="px-6"
                            >
                                <X className="w-4 h-4 mr-2" />
                                {tm('cancel')}
                            </Button>
                            <Button
                                className="px-6 bg-orange-500 hover:bg-orange-600 text-white"
                                onClick={() => {
                                    // TODO: Implement save logic
                                    setShowCreateModal(false);
                                    loadMovements();
                                }}
                            >
                                <Check className="w-4 h-4 mr-2" />
                                {tm('save')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
