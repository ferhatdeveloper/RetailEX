import { useState } from 'react';
import { Eye, EyeOff, Settings } from 'lucide-react';

interface Column {
    id: string;
    label: string;
    visible: boolean;
}

interface ColumnVisibilityMenuProps {
    columns: Column[];
    onToggle: (columnId: string) => void;
    onShowAll: () => void;
    onHideAll: () => void;
}

export function ColumnVisibilityMenu({ columns, onToggle, onShowAll, onHideAll }: ColumnVisibilityMenuProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm"
                title="Kolon Ayarları"
            >
                <Settings className="w-4 h-4" />
                <span>Kolonlar</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                    <div className="p-3 border-b border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">Kolon Görünürlüğü</span>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                ×
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    onShowAll();
                                }}
                                className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                            >
                                Tümünü Göster
                            </button>
                            <button
                                onClick={() => {
                                    onHideAll();
                                }}
                                className="flex-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                            >
                                Tümünü Gizle
                            </button>
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto p-2">
                        {columns.map((column) => (
                            <label
                                key={column.id}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={column.visible}
                                    onChange={() => onToggle(column.id)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700 flex-1">{column.label}</span>
                                {column.visible ? (
                                    <Eye className="w-4 h-4 text-green-600" />
                                ) : (
                                    <EyeOff className="w-4 h-4 text-gray-400" />
                                )}
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

