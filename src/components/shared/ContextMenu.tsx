import { useState, useRef, useEffect } from 'react';
import { Edit, Trash2, History, LucideIcon, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export interface ContextMenuItem {
    id: string;
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
    variant?: 'default' | 'danger';
    divider?: boolean;
    items?: ContextMenuItem[];
}

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    items?: ContextMenuItem[];
    // Backward compatibility props
    onEdit?: () => void;
    onDelete?: () => void;
    onHistory?: () => void;
}

export function ContextMenu({ x, y, onClose, items, onEdit, onDelete, onHistory }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const { t } = useLanguage();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        // Adjust position if menu goes off screen
        if (menuRef.current) {
            const menu = menuRef.current;
            const rect = menu.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            if (x + rect.width > winWidth) {
                menu.style.left = `${winWidth - rect.width - 5}px`;
            }
            if (y + rect.height > winHeight) {
                menu.style.top = `${winHeight - rect.height - 5}px`;
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [x, y, onClose]);

    // Build final menu items list
    let finalItems: (ContextMenuItem & { color?: string })[] = [];

    if (items) {
        finalItems = items.map(item => ({
            ...item,
            color: item.variant === 'danger' ? 'text-red-600' : 'text-blue-600'
        }));
    } else {
        // Fallback to legacy props
        if (onEdit) finalItems.push({ id: 'edit', label: t.edit, icon: Edit, onClick: onEdit, color: 'text-blue-600' });
        if (onHistory) finalItems.push({ id: 'history', label: t.historyMovements, icon: History, onClick: onHistory, color: 'text-purple-600' });
        if (onDelete) finalItems.push({ id: 'delete', label: t.deleteAction, icon: Trash2, onClick: onDelete, color: 'text-red-600' });
    }

    // Recursive component for menu items
    const MenuList = ({ items, parentId }: { items: ContextMenuItem[], parentId: string }) => {
        const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);

        return (
            <>
                {items.map((item, index) => (
                    <div
                        key={item.id + index}
                        className="relative group"
                        onMouseEnter={() => setActiveSubMenu(item.id)}
                        onMouseLeave={() => setActiveSubMenu(null)}
                    >
                        <button
                            onMouseDown={(e) => {
                                if (e.button !== 0) return; // Sadece sol tıklama
                                e.stopPropagation();
                                e.preventDefault(); // Focus kaybını önle
                                if (item.items && item.items.length > 0) {
                                    // Mobile/Touch: Toggle submenu
                                    setActiveSubMenu(activeSubMenu === item.id ? null : item.id);
                                } else {
                                    item.onClick?.();
                                    onClose();
                                }
                            }}
                            className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center justify-between gap-3 transition-colors ${item.variant === 'danger' ? 'hover:text-red-700' : ''
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon className={`w-4 h-4 ${item.variant === 'danger' ? 'text-red-600' : 'text-blue-600'}`} />
                                <span className={`text-sm ${item.variant === 'danger' ? 'text-red-600' : 'text-gray-700'}`}>
                                    {item.label}
                                </span>
                            </div>
                            {item.items && item.items.length > 0 && (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                        </button>
                        {item.divider && <div className="border-t border-gray-100 my-1" />}

                        {/* Submenu */}
                        {item.items && item.items.length > 0 && activeSubMenu === item.id && (
                            <div
                                className="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px] z-[10000]"
                            >
                                <MenuList items={item.items} parentId={item.id} />
                            </div>
                        )}
                    </div>
                ))}
            </>
        );
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[220px]"
            style={{ left: x, top: y }}
        >
            <MenuList items={finalItems} parentId="root" />
        </div>
    );
}

