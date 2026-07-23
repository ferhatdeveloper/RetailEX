import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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
    onEdit?: () => void;
    onDelete?: () => void;
    onHistory?: () => void;
}

const SUBMENU_GAP = 4;
const MENU_Z = 2147483640;

function pathKey(path: string[]): string {
    return path.join('›');
}

function findSubmenuItems(items: ContextMenuItem[], path: string[]): ContextMenuItem[] | null {
    if (path.length === 0) return null;
    const [head, ...rest] = path;
    const node = items.find(i => i.id === head);
    if (!node?.items?.length) return null;
    if (rest.length === 0) return node.items;
    return findSubmenuItems(node.items, rest);
}

type SubmenuAnchor = {
    path: string[];
    left: number;
    top: number;
};

export function ContextMenu({ x, y, onClose, items, onEdit, onDelete, onHistory }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const submenuRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { t } = useLanguage();

    const [menuPos, setMenuPos] = useState({ left: x, top: y });
    const [openPath, setOpenPath] = useState<string[]>([]);
    const [submenuAnchor, setSubmenuAnchor] = useState<SubmenuAnchor | null>(null);

    const clearCloseTimer = useCallback(() => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    const scheduleCloseSubmenu = useCallback(() => {
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => {
            setOpenPath([]);
            setSubmenuAnchor(null);
        }, 160);
    }, [clearCloseTimer]);

    const openSubmenuForPath = useCallback((path: string[]) => {
        clearCloseTimer();
        setOpenPath(path);
        const btn = itemRefs.current.get(pathKey(path));
        if (!btn) {
            setSubmenuAnchor(null);
            return;
        }
        const rect = btn.getBoundingClientRect();
        const submenuWidth = 220;
        const fitsRight = rect.right + SUBMENU_GAP + submenuWidth <= window.innerWidth - 8;
        setSubmenuAnchor({
            path,
            left: fitsRight ? rect.right + SUBMENU_GAP : rect.left - SUBMENU_GAP - submenuWidth,
            top: rect.top,
        });
    }, [clearCloseTimer]);

    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!menu) {
            setMenuPos({ left: x, top: y });
            return;
        }
        const rect = menu.getBoundingClientRect();
        let left = x;
        let top = y;
        if (left + rect.width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - rect.width - 8);
        }
        if (top + rect.height > window.innerHeight - 8) {
            top = Math.max(8, window.innerHeight - rect.height - 8);
        }
        setMenuPos({ left, top });
    }, [x, y, items, onEdit, onDelete, onHistory]);

    useLayoutEffect(() => {
        if (openPath.length === 0) return;
        openSubmenuForPath(openPath);
    }, [openPath, openSubmenuForPath]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target)) return;
            if (submenuRef.current?.contains(target)) return;
            onClose();
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (openPath.length > 0) {
                    setOpenPath([]);
                    setSubmenuAnchor(null);
                } else {
                    onClose();
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
            clearCloseTimer();
        };
    }, [onClose, openPath.length, clearCloseTimer]);

    let finalItems: (ContextMenuItem & { color?: string })[] = [];
    if (items) {
        finalItems = items.map(item => ({
            ...item,
            color: item.variant === 'danger' ? 'text-red-600' : 'text-[var(--asin-accent,#1FA8A0)]',
        }));
    } else {
        if (onEdit) finalItems.push({ id: 'edit', label: t.edit, icon: Edit, onClick: onEdit, color: 'text-[var(--asin-accent,#1FA8A0)]' });
        if (onHistory) finalItems.push({ id: 'history', label: t.historyMovements, icon: History, onClick: onHistory, color: 'text-[var(--asin-accent,#1FA8A0)]' });
        if (onDelete) finalItems.push({ id: 'delete', label: t.deleteAction, icon: Trash2, onClick: onDelete, color: 'text-red-600' });
    }

    const isPathOpen = (path: string[]) =>
        path.length === openPath.length && path.every((seg, i) => openPath[i] === seg);

    const MenuList = ({
        menuItems,
        pathPrefix,
    }: {
        menuItems: ContextMenuItem[];
        pathPrefix: string[];
    }) => (
        <>
            {menuItems.map((item, index) => {
                const itemPath = [...pathPrefix, item.id];
                const hasSubmenu = Boolean(item.items && item.items.length > 0);
                const submenuOpen = hasSubmenu && isPathOpen(itemPath);
                const key = pathKey(itemPath);

                return (
                    <div key={item.id + index}>
                        {item.header ? (
                            <div className="px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-500 select-none">
                                {item.label}
                            </div>
                        ) : (
                            <button
                                type="button"
                                ref={(el) => {
                                    if (el) itemRefs.current.set(key, el);
                                    else itemRefs.current.delete(key);
                                }}
                                onMouseEnter={() => {
                                    clearCloseTimer();
                                    if (hasSubmenu) {
                                        openSubmenuForPath(itemPath);
                                    } else if (pathPrefix.length > 0) {
                                        openSubmenuForPath(pathPrefix);
                                    }
                                }}
                                onMouseLeave={() => {
                                    if (hasSubmenu) scheduleCloseSubmenu();
                                }}
                                onMouseDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (hasSubmenu) {
                                        openSubmenuForPath(submenuOpen ? pathPrefix : itemPath);
                                    } else {
                                        item.onClick?.();
                                        onClose();
                                    }
                                }}
                                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-gray-100 ${
                                    submenuOpen ? 'bg-gray-50' : ''
                                } ${item.variant === 'danger' ? 'hover:text-red-700' : ''}`}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    {item.icon ? (
                                        <item.icon
                                            className={`h-4 w-4 shrink-0 ${
                                                item.variant === 'danger' ? 'text-red-600' : 'text-[var(--asin-accent,#1FA8A0)]'
                                            }`}
                                        />
                                    ) : null}
                                    <span
                                        className={`truncate text-sm ${
                                            item.variant === 'danger' ? 'text-red-600' : 'text-gray-700'
                                        }`}
                                    >
                                        {item.label}
                                    </span>
                                </div>
                                {hasSubmenu ? <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" /> : null}
                            </button>
                        )}
                        {item.divider ? <div className="my-1 border-t border-gray-100" /> : null}
                    </div>
                );
            })}
        </>
    );

    const submenuItems =
        submenuAnchor && openPath.length > 0
            ? findSubmenuItems(finalItems, openPath)
            : null;

    const menuShell = (
        <>
            <div
                ref={menuRef}
                className="fixed min-w-[220px] overflow-visible rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
                style={{ left: menuPos.left, top: menuPos.top, zIndex: MENU_Z }}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && submenuRef.current?.contains(related)) return;
                    if (openPath.length > 0) scheduleCloseSubmenu();
                }}
            >
                <MenuList menuItems={finalItems} pathPrefix={[]} />
            </div>

            {submenuAnchor && submenuItems && submenuItems.length > 0
                ? createPortal(
                    <div
                        ref={submenuRef}
                        className="fixed min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
                        style={{
                            left: submenuAnchor.left,
                            top: submenuAnchor.top,
                            zIndex: MENU_Z + 1,
                        }}
                        onMouseEnter={clearCloseTimer}
                        onMouseLeave={(e) => {
                            const related = e.relatedTarget as Node | null;
                            if (related && menuRef.current?.contains(related)) return;
                            scheduleCloseSubmenu();
                        }}
                    >
                        <MenuList menuItems={submenuItems} pathPrefix={openPath} />
                    </div>,
                    document.body,
                )
                : null}
        </>
    );

    if (typeof document === 'undefined') return menuShell;
    return createPortal(menuShell, document.body);
}
