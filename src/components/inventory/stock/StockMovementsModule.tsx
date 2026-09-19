import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    TrendingDown, Plus, Search, Trash2, X, Edit2, Eye,
    Printer, RefreshCw, Check,
    FileMinus, Archive, ChevronDown
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { postgres } from '../../../services/postgres';
import {
    stockMovementAPI,
    StockMovement,
    STOCK_SLIP_TRCODES,
    MATERIAL_SLIP_ADD_MENU,
    labelStockSlipDocumentType,
    type MaterialSlipAddMenuItem,
} from '../../../services/stockMovementAPI';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { DevExDataGrid, DEVEX_GRID_ROW_ID } from '../../shared/DevExDataGrid';
import {
    STOCK_MOVEMENTS_COLUMN_ORDER_KEY,
    buildStockMovementsListColumns,
    loadStockMovementsColumnVisibility,
    saveStockMovementsColumnVisibility,
} from './stockMovementsListColumns';

/** jRetail materialReceiptList + Ekle menü yedek etiketleri (tm boşsa) */
const SLIP_TYPE_FALLBACK: Record<string, string> = {
    slipInterWarehouseTransfer: 'Depolar Arası Transfer Fişi',
    slipWarehouseEntry: 'Depo Giriş Fişi',
    slipWarehouseExit: 'Depo Çıkış Fişi',
    slipCountSurplus: 'Sayım Fazlası Fişi',
    slipCountDeficit: 'Sayım Eksikliği Fişi',
    slipConsumption: 'Sarf Fişi',
    slipWastage: 'Fire Fişi',
    slipProductionEntry: 'Üretimden Giriş Fişi',
};

export interface StockMovementsModuleProps {
    defaultFilter?: 'shortage' | 'surplus' | 'all';
}

type FormState = {
    movement_type: string;
    warehouse_id: string;
    target_warehouse_id: string;
    movement_date: string;
    description: string;
    trcode: number;
};

function defaultFormForFilter(
    defaultFilter: 'shortage' | 'surplus' | 'all',
    warehouseId = '',
): FormState {
    if (defaultFilter === 'shortage') {
        return {
            movement_type: 'out',
            warehouse_id: warehouseId,
            target_warehouse_id: '',
            movement_date: new Date().toISOString().split('T')[0],
            description: '',
            trcode: STOCK_SLIP_TRCODES.SHORTAGE,
        };
    }
    if (defaultFilter === 'surplus') {
        return {
            movement_type: 'in',
            warehouse_id: warehouseId,
            target_warehouse_id: '',
            movement_date: new Date().toISOString().split('T')[0],
            description: '',
            trcode: STOCK_SLIP_TRCODES.SURPLUS,
        };
    }
    return {
        movement_type: 'in',
        warehouse_id: warehouseId,
        target_warehouse_id: '',
        movement_date: new Date().toISOString().split('T')[0],
        description: '',
        trcode: STOCK_SLIP_TRCODES.WAREHOUSE_IN,
    };
}

export function StockMovementsModule({ defaultFilter = 'all' }: StockMovementsModuleProps) {
    const { t, tm } = useLanguage();
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'in' | 'out'>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showSlipTypeModal, setShowSlipTypeModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedSlipLabel, setSelectedSlipLabel] = useState('');

    const [formData, setFormData] = useState<FormState>(() => defaultFormForFilter(defaultFilter));
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
        () => loadStockMovementsColumnVisibility(),
    );

    const slipTypeLabel = (item: MaterialSlipAddMenuItem) =>
        tm(item.labelKey) || SLIP_TYPE_FALLBACK[item.labelKey] || item.labelKey;

    const handleColumnVisibilityChange = useCallback((visibility: Record<string, boolean>) => {
        setColumnVisibility(visibility);
        saveStockMovementsColumnVisibility(visibility);
    }, []);

    useEffect(() => {
        loadMovements();
        loadWarehouses();
    }, [defaultFilter]);

    const loadWarehouses = async () => {
        try {
            const { rows } = await postgres.query('SELECT id, name FROM stores WHERE is_active = true');
            setWarehouses(rows);
            if (rows.length > 0 && !formData.warehouse_id) {
                setFormData((prev) => ({ ...prev, warehouse_id: rows[0].id }));
            }
        } catch (error) {
            console.error('Error loading warehouses:', error);
        }
    };

    const loadMovements = async () => {
        try {
            setLoading(true);
            let data = await stockMovementAPI.getAll();

            if (defaultFilter === 'shortage') {
                data = data.filter((m) => m.trcode === STOCK_SLIP_TRCODES.SHORTAGE);
            } else if (defaultFilter === 'surplus') {
                data = data.filter((m) => m.trcode === STOCK_SLIP_TRCODES.SURPLUS);
            }

            setMovements(data);
        } catch (error) {
            console.error('Error loading movements:', error);
        } finally {
            setLoading(false);
        }
    };

    const openCreateForSlip = (item: MaterialSlipAddMenuItem) => {
        const wh = warehouses[0]?.id || formData.warehouse_id || '';
        setFormData({
            movement_type: item.movement_type,
            warehouse_id: wh,
            target_warehouse_id: '',
            movement_date: new Date().toISOString().split('T')[0],
            description: '',
            trcode: item.trcode,
        });
        setSelectedSlipLabel(slipTypeLabel(item));
        setShowSlipTypeModal(false);
        setShowCreateModal(true);
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setSelectedSlipLabel('');
    };

    const openSlipTypePicker = () => {
        setShowCreateModal(false);
        setShowSlipTypeModal(true);
    };

    const handleCreate = async () => {
        if (!formData.warehouse_id) {
            alert(tm('selectWarehouse'));
            return;
        }
        if (formData.movement_type === 'transfer') {
            if (!formData.target_warehouse_id) {
                alert(tm('selectTargetWarehouse') || 'Hedef depo seçiniz');
                return;
            }
            if (formData.target_warehouse_id === formData.warehouse_id) {
                alert(tm('selectTargetWarehouse') || 'Hedef depo kaynak depodan farklı olmalı');
                return;
            }
        }

        try {
            setLoading(true);
            await stockMovementAPI.create(
                {
                    movement_type: formData.movement_type,
                    warehouse_id: formData.warehouse_id,
                    target_warehouse_id:
                        formData.movement_type === 'transfer' ? formData.target_warehouse_id : undefined,
                    movement_date: formData.movement_date,
                    description: formData.description,
                    trcode: formData.trcode,
                    status: 'completed',
                },
                [],
            );

            closeCreateModal();
            await loadMovements();
            setFormData(defaultFormForFilter(defaultFilter, warehouses[0]?.id || ''));
        } catch (error) {
            console.error('Error creating movement:', error);
            alert(tm('errorOccurred'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = useCallback(async (id: string | null) => {
        const targetId = id || selectedId;
        if (!targetId) return;
        if (String(targetId).startsWith('inv-')) {
            alert('Fatura kaynaklı hareket bu ekrandan silinemez; faturayı düzenleyin veya silin.');
            return;
        }

        if (!confirm(tm('deleteTransactionConfirm'))) return;
        try {
            setLoading(true);
            await stockMovementAPI.delete(targetId);
            await loadMovements();
            setSelectedId(null);
        } catch (error) {
            alert(tm('deleteError'));
        } finally {
            setLoading(false);
        }
    }, [selectedId, tm]);

    const filteredMovements = useMemo(() => {
        return movements.filter((m: StockMovement) => {
            const tabOk =
                activeTab === 'all'
                    ? true
                    : activeTab === 'in'
                      ? m.movement_type === 'in' || m.movement_type === 'transfer'
                      : m.movement_type === 'out';
            const q = searchQuery.trim().toLowerCase();
            if (!q) return tabOk;
            const matchesSearch =
                m.document_no?.toLowerCase().includes(q) ||
                (m as StockMovement & { warehouses?: { name?: string } }).warehouses?.name
                    ?.toLowerCase()
                    .includes(q) ||
                labelStockSlipDocumentType(tm, m.trcode, m.movement_type).toLowerCase().includes(q) ||
                (m.description || '').toLowerCase().includes(q);
            return tabOk && matchesSearch;
        });
    }, [movements, activeTab, searchQuery, tm]);

    const gridRows = useMemo(
        () =>
            filteredMovements.map((m) => ({
                ...m,
                [DEVEX_GRID_ROW_ID]: `${m.source_kind || 'slip'}-${m.id}`,
            })),
        [filteredMovements],
    );

    const columns = useMemo(
        () =>
            buildStockMovementsListColumns({
                tm,
                onDelete: (id) => {
                    void handleDelete(id);
                },
            }),
        [tm, handleDelete],
    );

    const addButtonClass =
        'h-7 px-3 gap-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px] font-bold border-none shadow-sm';

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 flex-shrink-0 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {defaultFilter === 'shortage' ? (
                            <FileMinus className="w-4 h-4" />
                        ) : defaultFilter === 'surplus' ? (
                            <Archive className="w-4 h-4" />
                        ) : (
                            <TrendingDown className="w-4 h-4" />
                        )}
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-medium">
                                {defaultFilter === 'shortage'
                                    ? t.menu.countDeficitSlips
                                    : defaultFilter === 'surplus'
                                      ? t.menu.countSurplusSlips
                                      : tm('materialManagementSlips')}
                            </h2>
                            <span className="text-blue-100 text-[10px]">
                                • {filteredMovements.length} {tm('recordsCounter')}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMovements}
                            className="h-7 px-2 gap-1 text-white hover:bg-white/10 transition-colors text-[10px] border-none"
                        >
                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                            <span>{tm('refresh')}</span>
                        </Button>
                        <div className="w-px h-4 bg-white/20 mx-0.5" />
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={!selectedId}
                            className="h-7 px-2 gap-1 text-white hover:bg-white/10 transition-colors text-[10px] border-none disabled:opacity-30"
                        >
                            <Eye className="w-3 h-3" />
                            <span>{tm('view')}</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={!selectedId}
                            className="h-7 px-2 gap-1 text-white hover:bg-white/10 transition-colors text-[10px] border-none disabled:opacity-30"
                        >
                            <Edit2 className="w-3 h-3" />
                            <span>{tm('edit')}</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(null)}
                            disabled={!selectedId}
                            className="h-7 px-2 gap-1 text-white hover:bg-red-500/20 hover:text-red-200 transition-colors text-[10px] border-none disabled:opacity-30"
                        >
                            <Trash2 className="w-3 h-3" />
                            <span>{tm('delete')}</span>
                        </Button>
                        <div className="w-px h-4 bg-white/20 mx-0.5" />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-white hover:bg-white/10 transition-colors text-[10px] border-none"
                        >
                            <Printer className="w-3 h-3" />
                            <span>{tm('print')}</span>
                        </Button>
                        {defaultFilter === 'all' ? (
                            <Button type="button" onClick={openSlipTypePicker} className={addButtonClass}>
                                <Plus className="w-3 h-3" />
                                {tm('add')}
                                <ChevronDown className="w-3 h-3 opacity-70" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={() => {
                                    const item =
                                        defaultFilter === 'shortage'
                                            ? MATERIAL_SLIP_ADD_MENU.find((x) => x.key === 'shortage')!
                                            : MATERIAL_SLIP_ADD_MENU.find((x) => x.key === 'surplus')!;
                                    openCreateForSlip(item);
                                }}
                                className={addButtonClass}
                            >
                                <Plus className="w-3 h-3" />
                                {tm('add')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Bar — sekme + arama; kolon filtresi DevEx başlığında */}
            <div className="bg-white border-b px-4 py-2 flex items-center justify-between sticky top-0 z-10 shrink-0">
                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                    {(['all', 'in', 'out'] as const).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                                activeTab === tab
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'all' ? tm('all') : tab === 'in' ? tm('in') : tm('out')}
                        </button>
                    ))}
                </div>

                <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input
                        placeholder={`${tm('search')}...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 bg-gray-50 border-gray-200 focus:bg-white text-xs rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                </div>
            </div>

            {/* Data Grid — Malzeme listesi / ReportDataGrid standardı */}
            <div className="flex-1 min-h-0 overflow-hidden p-3">
                {loading && movements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                        <p className="text-sm text-gray-500 font-medium">{tm('loading')}...</p>
                    </div>
                ) : (
                    <div className="h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
                        {filteredMovements.length === 0 ? (
                            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-24">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                    <TrendingDown className="w-8 h-8 text-gray-300" />
                                </div>
                                <p className="text-gray-400 font-medium">{tm('noTransactionSlip')}</p>
                                {defaultFilter === 'all' ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="mt-2 border-dashed"
                                        onClick={openSlipTypePicker}
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        {tm('add')}
                                        <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
                                    </Button>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="mt-2 border-dashed"
                                        onClick={() => {
                                            const item =
                                                defaultFilter === 'shortage'
                                                    ? MATERIAL_SLIP_ADD_MENU.find((x) => x.key === 'shortage')!
                                                    : MATERIAL_SLIP_ADD_MENU.find((x) => x.key === 'surplus')!;
                                            openCreateForSlip(item);
                                        }}
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        {tm('add')}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <DevExDataGrid
                                data={gridRows}
                                columns={columns}
                                pageSize={50}
                                pageSizeOptions={[10, 25, 50, 100, 200]}
                                enableFiltering
                                enablePagination
                                enableSorting
                                enableColumnResizing
                                enableColumnReorder
                                enableColumnVisibility
                                enableExcelExport
                                enableGrouping
                                columnVisibility={columnVisibility}
                                onColumnVisibilityChange={handleColumnVisibilityChange}
                                columnOrderStorageKey={STOCK_MOVEMENTS_COLUMN_ORDER_KEY}
                                onRowClick={(row) =>
                                    setSelectedId(selectedId === row.id ? null : row.id)
                                }
                                height="100%"
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Status Bar */}
            <div className="bg-white border-t px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 font-medium shrink-0">
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
                        <span className="text-gray-900">
                            {filteredMovements.length} / {movements.length} {tm('records')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Fiş türü seçimi — jRetail + Ekle menüsü (portal; toolbar overflow/z-index sorununu aşar) */}
            {showSlipTypeModal && (
                <PercentBodyModal
                    onClose={() => setShowSlipTypeModal(false)}
                    size="list"
                    ariaLabel={tm('documentType') || 'Belge Türü'}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between shrink-0 text-white">
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold truncate">
                                {tm('add')} — {tm('documentType') || 'Belge Türü'}
                            </h2>
                            <p className="text-blue-100 text-sm">
                                {tm('materialManagementSlips') || 'Malzeme Yönetim Fişleri'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowSlipTypeModal(false)}
                            className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                            aria-label={tm('cancel')}
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                    <PercentBodyModalScrollBody className="p-3">
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
                            {MATERIAL_SLIP_ADD_MENU.map((item) => (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        onClick={() => openCreateForSlip(item)}
                                        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-800 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                                    >
                                        {slipTypeLabel(item)}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </PercentBodyModalScrollBody>
                    <div className="border-t bg-slate-50/50 px-6 py-3 flex justify-end shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowSlipTypeModal(false)}
                            className="rounded-2xl"
                        >
                            {tm('cancel')}
                        </Button>
                    </div>
                </PercentBodyModal>
            )}

            {/* Create Modal — PercentBodyModal */}
            {showCreateModal && (
                <PercentBodyModal
                    onClose={closeCreateModal}
                    size="form"
                    ariaLabel={`${tm('add')} - ${selectedSlipLabel || tm('materialTransactionSlips')}`}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between shrink-0 text-white">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shrink-0">
                                <Plus className="w-6 h-6 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold truncate">
                                    {tm('add')} — {selectedSlipLabel || tm('materialTransactionSlips')}
                                </h2>
                                <p className="text-blue-100 text-sm">
                                    {tm('new')} {tm('slipNo')}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeCreateModal}
                            className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>

                    <PercentBodyModalScrollBody className="p-6">
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        {tm('slipNo')} *
                                    </label>
                                    <Input
                                        placeholder="AUTO-GENERATED"
                                        disabled
                                        className="bg-gray-50 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        {tm('date')} *
                                    </label>
                                    <Input
                                        type="date"
                                        value={formData.movement_date}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                movement_date: e.target.value,
                                            }))
                                        }
                                        className="font-medium"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                    {tm('documentType') || 'Belge Türü'} *
                                </label>
                                <Input
                                    value={selectedSlipLabel || labelStockSlipDocumentType(tm, formData.trcode, formData.movement_type)}
                                    disabled
                                    className="bg-slate-50 font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                    {formData.movement_type === 'transfer'
                                        ? `${tm('warehouse')} *`
                                        : `${tm('warehouse')} *`}
                                </label>
                                <div className="relative">
                                    <select
                                        value={formData.warehouse_id}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                warehouse_id: e.target.value,
                                            }))
                                        }
                                        className="w-full px-3 py-2.5 pr-11 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium text-sm appearance-none"
                                    >
                                        {warehouses.map((w) => (
                                            <option key={w.id} value={w.id}>
                                                {w.name}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {formData.movement_type === 'transfer' && (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        {tm('targetWarehouse') || 'Hedef Depo'} *
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={formData.target_warehouse_id}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    target_warehouse_id: e.target.value,
                                                }))
                                            }
                                            className="w-full px-3 py-2.5 pr-11 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium text-sm appearance-none"
                                        >
                                            <option value="">
                                                {tm('selectTargetWarehouse') || 'Hedef depo seçiniz'}
                                            </option>
                                            {warehouses
                                                .filter((w) => w.id !== formData.warehouse_id)
                                                .map((w) => (
                                                    <option key={w.id} value={w.id}>
                                                        {w.name}
                                                    </option>
                                                ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                    {tm('description')}
                                </label>
                                <textarea
                                    rows={3}
                                    value={formData.description}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            description: e.target.value,
                                        }))
                                    }
                                    placeholder={`${tm('enterValue')}...`}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                />
                            </div>

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
                    </PercentBodyModalScrollBody>

                    <div className="border-t bg-slate-50/50 px-6 py-4 flex items-center justify-between shrink-0">
                        <Button variant="outline" onClick={closeCreateModal} className="px-6 rounded-2xl">
                            <X className="w-4 h-4 mr-2" />
                            {tm('cancel')}
                        </Button>
                        <Button
                            className="px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl"
                            onClick={handleCreate}
                            disabled={loading}
                        >
                            <Check className="w-4 h-4 mr-2" />
                            {tm('save')}
                        </Button>
                    </div>
                </PercentBodyModal>
            )}
        </div>
    );
}
