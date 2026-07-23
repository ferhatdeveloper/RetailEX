import { X, Search, Database, Check, Plus } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import {
  createMasterDataQuickAddItem,
  suggestQuickAddCode,
  type MasterDataQuickAddVariant,
} from '../../utils/masterDataQuickAdd';

export interface MasterDataItem {
    id: string;
    code: string;
    name: string;
    description?: string;
}

interface MasterDataSelectionModalProps {
    title: string;
    items: MasterDataItem[];
    currentValue: string | string[];
    onSelect: (item: MasterDataItem | MasterDataItem[]) => void;
    onClose: () => void;
    isMulti?: boolean;
    /** Tanım tablosu — verilirse hızlı ekleme gösterilir */
    definitionTableName?: string;
    parentId?: string | null;
    quickAddVariant?: MasterDataQuickAddVariant;
    quickAddExtra?: Record<string, unknown>;
    /** Özel oluşturma (depo vb.) — tanım API yerine */
    onQuickAdd?: (input: { code: string; name: string }) => Promise<MasterDataItem | null>;
    onItemsChanged?: () => void;
    /** false ise ekleme gizlenir */
    enableQuickAdd?: boolean;
}

export function MasterDataSelectionModal({
    title,
    items,
    currentValue,
    onSelect,
    onClose,
    isMulti = false,
    definitionTableName,
    parentId = null,
    quickAddVariant = 'default',
    quickAddExtra,
    onQuickAdd,
    onItemsChanged,
    enableQuickAdd = true,
}: MasterDataSelectionModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [quickCode, setQuickCode] = useState('');
    const [quickName, setQuickName] = useState('');
    const [quickSaving, setQuickSaving] = useState(false);
    const [localItems, setLocalItems] = useState(items);
    const [selectedItems, setSelectedItems] = useState<MasterDataItem[]>(() => {
        if (isMulti && Array.isArray(currentValue)) {
            return items.filter(item =>
                (currentValue as string[]).includes(item.name) ||
                (currentValue as string[]).includes(item.code)
            );
        }
        return [];
    });

    const canQuickAdd = enableQuickAdd && Boolean(definitionTableName || onQuickAdd);

    useEffect(() => {
        setLocalItems(items);
    }, [items]);

    const filteredItems = useMemo(() => {
        const source = localItems.length ? localItems : items;
        if (!searchTerm.trim()) return source;
        const term = searchTerm.toLowerCase();
        return source.filter(
            (item: MasterDataItem) =>
                item.code.toLowerCase().includes(term) ||
                item.name.toLowerCase().includes(term) ||
                item.description?.toLowerCase().includes(term)
        );
    }, [searchTerm, items, localItems]);

    const openQuickAdd = (prefillName = '') => {
        const name = prefillName.trim();
        setQuickName(name);
        setQuickCode(quickAddVariant === 'taxRate' ? '' : name ? suggestQuickAddCode(name) : '');
        setShowQuickAdd(true);
    };

    const handleQuickAdd = async () => {
        if (quickAddVariant !== 'taxRate' && (!quickCode.trim() || !quickName.trim())) {
            toast.error('Kod ve ad zorunludur.');
            return;
        }
        if (quickAddVariant === 'taxRate' && !quickCode.trim()) {
            toast.error('Vergi oranı zorunludur.');
            return;
        }
        setQuickSaving(true);
        try {
            let mapped: MasterDataItem | null = null;
            if (onQuickAdd) {
                mapped = await onQuickAdd({ code: quickCode.trim(), name: quickName.trim() });
            } else if (definitionTableName) {
                mapped = await createMasterDataQuickAddItem({
                    tableName: definitionTableName,
                    code: quickCode.trim(),
                    name: quickName.trim(),
                    parentId,
                    variant: quickAddVariant,
                    extra: quickAddExtra,
                });
            }
            if (!mapped) throw new Error('Kayıt oluşturulamadı');
            setLocalItems((prev) => [...prev, mapped]);
            onItemsChanged?.();
            setQuickCode('');
            setQuickName('');
            setShowQuickAdd(false);
            if (!isMulti) onSelect(mapped);
            toast.success('Kayıt eklendi');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setQuickSaving(false);
        }
    };

    const handleItemClick = (item: MasterDataItem) => {
        if (isMulti) {
            const isSelected = selectedItems.find(i => i.id === item.id);
            if (isSelected) {
                setSelectedItems(selectedItems.filter(i => i.id !== item.id));
            } else {
                setSelectedItems([...selectedItems, item]);
            }
        } else {
            onSelect(item);
        }
    };

    const handleConfirm = () => {
        if (isMulti) {
            onSelect(selectedItems);
        }
    };

    const isItemSelected = (item: MasterDataItem) => {
        if (isMulti) {
            return selectedItems.some(i => i.id === item.id);
        }
        if (Array.isArray(currentValue)) {
            return (currentValue as string[]).includes(item.name) || (currentValue as string[]).includes(item.code);
        }
        return currentValue === item.name || currentValue === item.code;
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[10001] p-4">
            <div className="bg-white w-full max-w-lg shadow-2xl rounded-lg flex flex-col max-h-[85vh]">
                <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-[var(--asin-primary,#0E2433)] rounded-t-lg">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        {title} {isMulti && <span className="text-[10px] font-normal bg-white/20 px-1.5 py-0.5 rounded ml-1">Çoklu Seçim</span>}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white/10 p-1 rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-3 border-b border-gray-200 bg-gray-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Ara..."
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)]/20 focus:border-[var(--asin-accent,#1FA8A0)] transition-all"
                            autoFocus
                        />
                    </div>
                </div>

                {canQuickAdd && (
                    <div className="px-4 py-2 border-b border-gray-100 bg-white">
                        {!showQuickAdd ? (
                            <button
                                type="button"
                                onClick={() => openQuickAdd(searchTerm)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--asin-accent,#1FA8A0)] hover:text-[var(--asin-primary,#0E2433)]"
                            >
                                <Plus className="w-3 h-3" />
                                Yeni ekle
                            </button>
                        ) : (
                            <div className="flex flex-wrap items-end gap-2">
                                <input
                                    value={quickCode}
                                    onChange={(e) => setQuickCode(e.target.value)}
                                    placeholder={quickAddVariant === 'taxRate' ? 'Oran (%)' : 'Kod'}
                                    className="flex-1 min-w-[80px] px-2 py-1.5 border rounded text-xs"
                                />
                                <input
                                    value={quickName}
                                    onChange={(e) => setQuickName(e.target.value)}
                                    placeholder={quickAddVariant === 'taxRate' ? 'Açıklama' : 'Ad'}
                                    className="flex-[2] min-w-[120px] px-2 py-1.5 border rounded text-xs"
                                />
                                <button
                                    type="button"
                                    disabled={quickSaving}
                                    onClick={() => void handleQuickAdd()}
                                    className="px-3 py-1.5 bg-[var(--asin-accent,#1FA8A0)] text-white text-xs rounded disabled:opacity-50"
                                >
                                    Kaydet
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowQuickAdd(false)}
                                    className="px-2 py-1.5 text-xs text-gray-600"
                                >
                                    İptal
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-auto p-2">
                    {filteredItems.length === 0 ? (
                        <div className="text-center py-10">
                            <Database className="w-12 h-12 mx-auto mb-2 text-gray-200" />
                            <p className="text-sm text-gray-500 italic">Kayıt bulunamadı</p>
                            {canQuickAdd && searchTerm.trim() && !showQuickAdd && (
                                <button
                                    type="button"
                                    onClick={() => openQuickAdd(searchTerm)}
                                    className="mt-4 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[var(--asin-accent,#1FA8A0)] border border-[var(--asin-accent-muted,#D5F0EE)] rounded-md hover:bg-[var(--asin-accent-muted,#D5F0EE)]"
                                >
                                    <Plus className="w-3 h-3" />
                                    &quot;{searchTerm.trim()}&quot; olarak ekle
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-1">
                            {filteredItems.map((item: MasterDataItem) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleItemClick(item)}
                                    className={`w-full group px-3 py-2 rounded-md border text-left transition-all flex items-center justify-between ${isItemSelected(item)
                                        ? 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]'
                                        : 'border-transparent hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        {isMulti && (
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isItemSelected(item) ? 'bg-[var(--asin-accent,#1FA8A0)] border-[var(--asin-accent,#1FA8A0)]' : 'bg-white border-gray-300'}`}>
                                                {isItemSelected(item) && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-900 text-xs">
                                                    {item.code}
                                                </span>
                                                <span className="text-gray-300 text-xs">|</span>
                                                <span className="text-gray-800 text-xs">
                                                    {item.name}
                                                </span>
                                            </div>
                                            {item.description && (
                                                <p className="text-[10px] text-gray-500 mt-1 line-clamp-1">
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {!isMulti && isItemSelected(item) && (
                                        <div className="w-4 h-4 rounded-full bg-[var(--asin-accent,#1FA8A0)] flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        {isMulti ? 'İptal' : 'Kapat'}
                    </button>
                    {isMulti && (
                        <button
                            onClick={handleConfirm}
                            className="px-4 py-2 text-xs font-medium bg-[var(--asin-accent,#1FA8A0)] text-white rounded-md hover:bg-[#178f88] transition-colors shadow-sm flex items-center gap-1"
                        >
                            <Check className="w-3 h-3" />
                            Tamam ({selectedItems.length})
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
