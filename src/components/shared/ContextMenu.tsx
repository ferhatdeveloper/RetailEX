import { useState, useRef, useEffect, useCallback } from 'react';
import { Edit, Trash2, History, LucideIcon, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: LucideIcon;
    onClick?: () => void;
    variant?: 'default' | 'danger';
    divider?: boolean;
    items?: ContextMenuItem[];
    /** Üst başlık satırı — tıklanamaz */
    header?: boolean;
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
    /** Açık alt menü yolu — aynı anda yalnızca bir dal (üst üste binme önlenir) */
    const [openPath, setOpenPath] = useState<string[]>([]);

    const closeSubmenus = useCallback(() => setOpenPath([]), []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (openPath.length > 0) {
                    closeSubmenus();
                } else {
                    onClose();
                }
            }
        };

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
    }, [x, y, onClose, openPath.length, closeSubmenus]);

    let finalItems: (ContextMenuItem & { color?: string })[] = [];

    if (items) {
        finalItems = items.map(item => ({
            ...item,
            color: item.variant === 'danger' ? 'text-red-600' : 'text-blue-600'
        }));
    } else {
        if (onEdit) finalItems.push({ id: 'edit', label: t.edit, icon: Edit, onClick: onEdit, color: 'text-blue-600' });
        if (onHistory) finalItems.push({ id: 'history', label: t.historyMovements, icon: History, onClick: onHistory, color: 'text-purple-600' });
        if (onDelete) finalItems.push({ id: 'delete', label: t.deleteAction, icon: Trash2, onClick: onDelete, color: 'text-red-600' });
    }

    const isPathOpen = (path: string[]) =>
        path.length === openPath.length && path.every((seg, i) => openPath[i] === seg);

    const MenuList = ({
        menuItems,
        pathPrefix,
        depth,
    }: {
        menuItems: ContextMenuItem[];
        pathPrefix: string[];
        depth: number;
    }) => (
        <>
            {menuItems.map((item, index) => {
                const itemPath = [...pathPrefix, item.id];
                const hasSubmenu = Boolean(item.items && item.items.length > 0);
                const submenuOpen = hasSubmenu && isPathOpen(itemPath);

                return (
                    <div key={item.id + index}>
                        {item.header ? (
                            <div className="px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-500 select-none">
                                {item.label}
                            </div>
                        ) : (
                            <div
                                className="relative"
                                onMouseEnter={() => {
                                    if (hasSubmenu) {
                                        setOpenPath(itemPath);
                                    } else {
                                        setOpenPath(pathPrefix);
                                    }
                                }}
                            >
                                <button
                                    type="button"
                                    onMouseDown={(e) => {
                                        if (e.button !== 0) return;
                                        e.stopPropagation();
                                        e.preventDefault();
                                        if (hasSubmenu) {
                                            setOpenPath(submenuOpen ? pathPrefix : itemPath);
                                        } else {
                                            item.onClick?.();
                                            onClose();
                                        }
                                    }}
                                    className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center justify-between gap-3 transition-colors ${
                                        submenuOpen ? 'bg-gray-50' : ''
                                    } ${item.variant === 'danger' ? 'hover:text-red-700' : ''}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {item.icon ? (
                                            <item.icon
                                                className={`w-4 h-4 shrink-0 ${
                                                    item.variant === 'danger' ? 'text-red-600' : 'text-blue-600'
                                                }`}
                                            />
                                        ) : null}
                                        <span
                                            className={`text-sm truncate ${
                                                item.variant === 'danger' ? 'text-red-600' : 'text-gray-700'
                                            }`}
                                        >
                                            {item.label}
                                        </span>
                                    </div>
                                    {hasSubmenu ? <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" /> : null}
                                </button>

                                {hasSubmenu && submenuOpen ? (
                                    <div
                                        className="absolute left-full top-0 flex"
                                        style={{ zIndex: 10000 + depth + 1 }}
                                        onMouseEnter={() => setOpenPath(itemPath)}
                                    >
                                        {/* Fare geçiş köprüsü — ml boşluğunda menü kapanmasın */}
                                        <div className="w-1.5 shrink-0 self-stretch" aria-hidden />
                                        <div className="min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                                            <MenuList
                                                menuItems={item.items!}
                                                pathPrefix={itemPath}
                                                depth={depth + 1}
                                            />
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                        {item.divider ? <div className="my-1 border-t border-gray-100" /> : null}
                    </div>
                );
            })}
        </>
    );

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[220px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
            style={{ left: x, top: y }}
            onMouseLeave={(e) => {
                const related = e.relatedTarget as Node | null;
                if (!related || !menuRef.current?.contains(related)) {
                    closeSubmenus();
                }
            }}
        >
            <MenuList menuItems={finalItems} pathPrefix={[]} depth={0} />
        </div>
    );
}
