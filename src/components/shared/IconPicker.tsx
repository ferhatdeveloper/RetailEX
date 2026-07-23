import React from 'react';
import * as Icons from 'lucide-react';
import { Search, X } from 'lucide-react';

interface IconPickerProps {
    value: string;
    onChange: (iconName: string) => void;
}

const POPULAR_ICONS = [
    'Package', 'ShoppingBag', 'Utensils', 'Pizza', 'Coffee', 'Beer', 'Wine', 'IceCream',
    'Cake', 'Apple', 'Flame', 'Fish', 'Beef', 'Soup', 'ChefHat', 'Store',
    'Tag', 'Layers', 'Boxes', 'FileText', 'Settings', 'Home', 'Users', 'Heart',
    'Star', 'Zap', 'Bell', 'Camera', 'Music', 'MapPin', 'Calendar', 'Clock'
];

export function IconPicker({ value, onChange }: IconPickerProps) {
    const [search, setSearch] = React.useState('');
    const [showPicker, setShowPicker] = React.useState(false);

    const SelectedIcon = (Icons as any)[value] || Icons.HelpCircle;

    const filteredIcons = POPULAR_ICONS.filter(name =>
        name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative">
            <div
                onClick={() => setShowPicker(!showPicker)}
                className="flex items-center gap-3 p-2 bg-gray-50 border border-gray-300 rounded cursor-pointer hover:border-blue-400 transition-all"
            >
                <div className="w-8 h-8 bg-white rounded border border-gray-100 flex items-center justify-center text-blue-600 shadow-sm">
                    <SelectedIcon className="w-5 h-5" />
                </div>
                <span className="text-sm text-gray-700 font-medium">{value || 'İkon Seçiniz'}</span>
                <Icons.ChevronDown className="w-4 h-4 ml-auto text-gray-400" />
            </div>

            {showPicker && (
                <div className="absolute z-[100] top-full mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-xl p-3 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase">İkon Seç</span>
                        <button onClick={() => setShowPicker(false)}>
                            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                        </button>
                    </div>

                    <div className="relative mb-3">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Ara..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar">
                        {filteredIcons.map(name => {
                            const IconComp = (Icons as any)[name];
                            return (
                                <button
                                    key={name}
                                    onClick={() => {
                                        onChange(name);
                                        setShowPicker(false);
                                    }}
                                    className={`p-2 rounded flex flex-col items-center justify-center gap-1 hover:bg-blue-50 transition-colors ${value === name ? 'bg-blue-100 ring-1 ring-blue-500' : ''}`}
                                    title={name}
                                >
                                    <IconComp className={`w-5 h-5 ${value === name ? 'text-blue-600' : 'text-gray-600'}`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
