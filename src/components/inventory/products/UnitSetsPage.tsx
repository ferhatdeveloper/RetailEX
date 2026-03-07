import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, RefreshCw, Layers, Check, X, Scale } from 'lucide-react';
import { unitSetAPI, UnitSet, UnitSetLine } from '../../../services/unitSetAPI';
import { BaseModal } from '../../shared/BaseModal';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';

const COMMON_UNITS = [
    // --- Sayım / Adet ---
    { code: 'ADET', name: 'Adet' },
    { code: 'UNIT', name: 'Unit' },
    { code: 'PCS', name: 'Pieces' },
    { code: 'KOLI', name: 'Koli' },
    { code: 'BOX', name: 'Box' },
    { code: 'CASE', name: 'Case' },
    { code: 'PAKET', name: 'Paket' },
    { code: 'PKT', name: 'Package' },
    { code: 'SET', name: 'Set' },
    { code: 'DUZINE', name: 'Düzine' },
    { code: 'DOZ', name: 'Dozen' },
    { code: 'TOP', name: 'Top / Roll' },
    { code: 'PALET', name: 'Palet' },
    { code: 'PLT', name: 'Pallet' },
    { code: 'BAG', name: 'Bag' },
    { code: 'BIN', name: 'Bin' },
    { code: 'CTR', name: 'Container' },

    // --- Ağırlık / Kütle (Metric) ---
    { code: 'KG', name: 'Kilogram' },
    { code: 'GR', name: 'Gram' },
    { code: 'MG', name: 'Miligram' },
    { code: 'TON', name: 'Ton' },
    { code: 'MTN', name: 'Metric Ton' },

    // --- Ağırlık (Imperial/US) ---
    { code: 'LB', name: 'Pound' },
    { code: 'OZ', name: 'Ounce' },
    { code: 'ST', name: 'Stone' },

    // --- Hacim (Metric) ---
    { code: 'LT', name: 'Litre' },
    { code: 'ML', name: 'Mililitre' },
    { code: 'CL', name: 'Santilitre' },
    { code: 'DL', name: 'Desilitre' },
    { code: 'M3', name: 'Metreküp (CBM)' },
    { code: 'CM3', name: 'Santimetreküp' },

    // --- Hacim (Imperial/US) ---
    { code: 'GAL', name: 'Gallon' },
    { code: 'QT', name: 'Quart' },
    { code: 'PT', name: 'Pint' },
    { code: 'FLOZ', name: 'Fluid Ounce' },
    { code: 'BBL', name: 'Barrel' },

    // --- Uzunluk (Metric) ---
    { code: 'M', name: 'Metre' },
    { code: 'CM', name: 'Santimetre' },
    { code: 'MM', name: 'Milimetre' },
    { code: 'KM', name: 'Kilometre' },

    // --- Uzunluk (Imperial/US) ---
    { code: 'IN', name: 'Inch' },
    { code: 'FT', name: 'Foot / Feet' },
    { code: 'YD', name: 'Yard' },
    { code: 'MI', name: 'Mile' },

    // --- Alan ---
    { code: 'M2', name: 'Metrekare' },
    { code: 'CM2', name: 'Santimetrekare' },
    { code: 'FT2', name: 'Square Feet' },
    { code: 'AC', name: 'Acre' },
    { code: 'HA', name: 'Hectare' },

    // --- Zaman ---
    { code: 'SAAT', name: 'Saat' },
    { code: 'HR', name: 'Hour' },
    { code: 'DAK', name: 'Dakika' },
    { code: 'MIN', name: 'Minute' },
    { code: 'GUN', name: 'Gün' },
    { code: 'DAY', name: 'Day' },

    // --- Diğer ---
    { code: 'KW', name: 'Kilowatt' },
    { code: 'KWH', name: 'Kilowatt-hour' },
    { code: 'V', name: 'Volt' },
    { code: 'A', name: 'Ampere' }
];

export default function UnitSetsPage() {
    const { t, tm } = useLanguage();
    const [items, setItems] = useState<UnitSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<UnitSet | null>(null);

    // Form States
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        is_active: true
    });
    const [lines, setLines] = useState<UnitSetLine[]>([]);

    const loadItems = useCallback(async () => {
        try {
            setLoading(true);
            const data = await unitSetAPI.getAll();
            setItems(data);
        } catch (error) {
            console.error('Error loading unit sets:', error);
            toast.error(tm('unitSetsLoadError'));
        } finally {
            setLoading(false);
        }
    }, [tm]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const resetForm = () => {
        setFormData({ code: '', name: '', is_active: true });
        setLines([
            { code: 'ADET', name: 'Adet', main_unit: true, conv_fact1: 1, conv_fact2: 1 }
        ]);
        setEditingItem(null);
    };

    const openEditModal = (item: UnitSet) => {
        setEditingItem(item);
        setFormData({
            code: item.code,
            name: item.name,
            is_active: item.is_active
        });
        setLines(item.lines || []);
        setShowModal(true);
    };

    const handleAddLine = () => {
        setLines([...lines, {
            code: '',
            name: '',
            main_unit: false,
            conv_fact1: 1,
            conv_fact2: 1
        }]);
    };

    const handleRemoveLine = (index: number) => {
        if (lines[index].main_unit) {
            toast.error(tm('mainUnitCannotDelete'));
            return;
        }
        setLines(lines.filter((_, i) => i !== index));
    };

    const updateLine = (index: number, field: keyof UnitSetLine, value: any) => {
        const newLines = [...lines];

        if (field === 'main_unit' && value === true) {
            // Only one main unit allowed
            newLines.forEach((l, i) => l.main_unit = i === index);
        } else if (field === 'code') {
            const upperValue = value.toUpperCase();
            newLines[index].code = upperValue;

            // Eğer seçilen kod ortak birimlerde varsa ismini otomatik doldur
            const common = COMMON_UNITS.find(u => u.code === upperValue);
            if (common) {
                newLines[index].name = common.name;
            }
        } else {
            (newLines[index] as any)[field] = value;
        }

        setLines(newLines);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.code || !formData.name) {
            toast.error(tm('codeAndNameRequired'));
            return;
        }

        if (lines.length === 0) {
            toast.error(tm('atLeastOneUnit'));
            return;
        }

        if (!lines.some(l => l.main_unit)) {
            toast.error(tm('mainUnitRequired'));
            return;
        }

        try {
            await unitSetAPI.save({ ...formData, id: editingItem?.id }, lines);
            setShowModal(false);
            resetForm();
            loadItems();
            toast.success(tm(editingItem ? 'unitSetUpdated' : 'unitSetCreated'));
        } catch (error: any) {
            console.error('Error saving unit set:', error);
            toast.error(tm('saveError'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(tm('confirmDeleteUnitSet'))) return;
        try {
            await unitSetAPI.delete(id);
            loadItems();
            toast.success(tm('unitSetDeleted'));
        } catch (error) {
            console.error('Error deleting:', error);
            toast.error(tm('deleteError'));
        }
    };

    const filteredItems = useMemo(() => {
        return items.filter(item =>
            item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [items, searchQuery]);

    const columnHelper = createColumnHelper<UnitSet>();
    const gridColumns = [
        columnHelper.accessor('code', { header: tm('code').toUpperCase(), size: 120 }),
        columnHelper.accessor('name', { header: tm('unitSetName').toUpperCase(), size: 250 }),
        columnHelper.accessor('lines', {
            header: tm('units').toUpperCase(),
            cell: info => info.getValue()?.map(l => l.code).join(', '),
            size: 300
        }),
        columnHelper.accessor('is_active', {
            header: tm('status').toUpperCase(),
            cell: info => (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${info.getValue() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {info.getValue() ? tm('active').toUpperCase() : tm('passive').toUpperCase()}
                </span>
            ),
            size: 100
        }),
        columnHelper.display({
            id: 'actions',
            header: tm('actions').toUpperCase(),
            cell: info => (
                <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEditModal(info.row.original)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                        <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(info.row.original.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
            size: 100
        })
    ];

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 shadow-md z-10 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1 bg-white/10 rounded">
                            <Layers className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-tight">{tm('unitSets')}</h2>
                            <p className="text-[10px] text-blue-100 leading-none opacity-80">{tm('unitAndMultiplierMgmt')} • {items.length} {tm('records')}</p>
                        </div>
                    </div>

                    <div className="flex gap-1.5">
                        <button onClick={loadItems} className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] rounded backdrop-blur-sm">
                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{tm('refresh')}</span>
                        </button>
                        <button
                            onClick={() => {
                                resetForm();
                                setShowModal(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px] font-bold rounded shadow-sm"
                        >
                            <Plus className="w-3 h-3" />
                            <span>{tm('addNew')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="p-3 flex-shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder={tm('searchUnitSetPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-200 rounded focus:ring-2 focus:ring-blue-500/20"
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 px-3 pb-3 overflow-hidden">
                <div className="h-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <DevExDataGrid
                        data={filteredItems}
                        columns={gridColumns}
                        onRowDoubleClick={openEditModal}
                        pageSize={20}
                        height="100%"
                    />
                </div>
            </div>

            {/* Master-Detail Modal */}
            <BaseModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={editingItem ? tm('editUnitSet') : tm('newUnitSetTitle')}
                maxWidth="max-w-4xl"
            >
                <div className="space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">{tm('code')}</label>
                            <input
                                type="text"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm font-bold"
                                placeholder="Örn: 식품_BIRIM"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">{tm('unitSetName')}</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
                                placeholder="Örn: Gıda Birim Seti"
                            />
                        </div>
                    </div>

                    {/* Lines (Master-Detail) */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-600 uppercase">{tm('unitDefinitions')}</span>
                            <button
                                onClick={handleAddLine}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700"
                            >
                                <Plus className="w-3 h-3" /> {tm('add')}
                            </button>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            <datalist id="common-units">
                                {COMMON_UNITS.map(u => (
                                    <option key={u.code} value={u.code}>{u.name}</option>
                                ))}
                            </datalist>
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr className="border-b border-gray-200">
                                        <th className="px-3 py-2 text-left w-20">{tm('mainUnitLabel').toUpperCase()}</th>
                                        <th className="px-3 py-2 text-left">{tm('unitCodeLabel').toUpperCase()}</th>
                                        <th className="px-3 py-2 text-left">{tm('unitNameLabel').toUpperCase()}</th>
                                        <th className="px-3 py-2 text-center w-24">{tm('multiplier1').toUpperCase()}</th>
                                        <th className="px-3 py-2 text-center w-24">{tm('multiplier2').toUpperCase()}</th>
                                        <th className="px-3 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((line, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50/30">
                                            <td className="px-3 py-1">
                                                <input
                                                    type="radio"
                                                    checked={line.main_unit}
                                                    onChange={() => updateLine(idx, 'main_unit', true)}
                                                    className="w-4 h-4 text-blue-600 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-3 py-1">
                                                <input
                                                    type="text"
                                                    list="common-units"
                                                    value={line.code}
                                                    onChange={e => updateLine(idx, 'code', e.target.value)}
                                                    className="w-full bg-white border border-gray-100 rounded px-2 py-1 focus:border-blue-500 focus:ring-0 transition-all font-bold text-gray-800"
                                                    placeholder="Kod (Örn: KOLİ)"
                                                />
                                            </td>
                                            <td className="px-3 py-1">
                                                <input
                                                    type="text"
                                                    value={line.name}
                                                    onChange={e => updateLine(idx, 'name', e.target.value)}
                                                    className="w-full bg-white border border-gray-100 rounded px-2 py-1 focus:border-blue-500 focus:ring-0 transition-all text-gray-700"
                                                    placeholder="Ad (Örn: Koli)"
                                                />
                                            </td>
                                            <td className="px-3 py-1">
                                                <input
                                                    type="number"
                                                    value={line.conv_fact1}
                                                    onChange={e => updateLine(idx, 'conv_fact1', parseFloat(e.target.value))}
                                                    className="w-full bg-white border border-gray-100 rounded px-2 py-1 focus:border-blue-500 focus:ring-0 transition-all text-center font-bold text-blue-600"
                                                    disabled={line.main_unit}
                                                />
                                            </td>
                                            <td className="px-3 py-1">
                                                <input
                                                    type="number"
                                                    value={line.conv_fact2}
                                                    onChange={e => updateLine(idx, 'conv_fact2', parseFloat(e.target.value))}
                                                    className="w-full bg-white border border-gray-100 rounded px-2 py-1 focus:border-blue-500 focus:ring-0 transition-all text-center font-bold text-blue-600"
                                                    disabled={line.main_unit}
                                                />
                                            </td>
                                            <td className="px-3 py-1">
                                                {!line.main_unit && (
                                                    <button onClick={() => handleRemoveLine(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Explanation */}
                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3">
                        <Scale className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        <div className="text-[11px] text-blue-800">
                            <p className="font-bold mb-1">{tm('howCalculated')}</p>
                            <p>{tm('multiplierLogicDesc')}</p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded"
                        >
                            {tm('cancel')}
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="flex items-center gap-1.5 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            {tm(editingItem ? 'update' : 'save')}
                        </button>
                    </div>
                </div>
            </BaseModal>
        </div>
    );
}


