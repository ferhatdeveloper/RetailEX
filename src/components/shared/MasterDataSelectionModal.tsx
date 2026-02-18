import { X, Search, Database, Check } from 'lucide-react';
import { useState, useMemo } from 'react';

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
}

export function MasterDataSelectionModal({
    title,
    items,
    currentValue,
    onSelect,
    onClose,
    isMulti = false
}: MasterDataSelectionModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItems, setSelectedItems] = useState<MasterDataItem[]>(() => {
        if (isMulti && Array.isArray(currentValue)) {
            return items.filter(item =>
                (currentValue as string[]).includes(item.name) ||
                (currentValue as string[]).includes(item.code)
            );
        }
        return [];
    });

    const filteredItems = useMemo(() => {
        if (!searchTerm.trim()) return items;
        const term = searchTerm.toLowerCase();
        return items.filter(
            (item: MasterDataItem) =>
                item.code.toLowerCase().includes(term) ||
                item.name.toLowerCase().includes(term) ||
                item.description?.toLowerCase().includes(term)
        );
    }, [searchTerm, items]);

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
                {/* Header */}
                <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-800 rounded-t-lg">
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

                {/* Search */}
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Ara..."
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-auto p-2">
                    {filteredItems.length === 0 ? (
                        <div className="text-center py-10">
                            <Database className="w-12 h-12 mx-auto mb-2 text-gray-200" />
                            <p className="text-sm text-gray-500 italic">Kayıt bulunamadı</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-1">
                            {filteredItems.map((item: MasterDataItem) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleItemClick(item)}
                                    className={`w-full group px-3 py-2 rounded-md border text-left transition-all flex items-center justify-between ${isItemSelected(item)
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-transparent hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        {isMulti && (
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isItemSelected(item) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
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
                                        <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
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
                            className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1"
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

