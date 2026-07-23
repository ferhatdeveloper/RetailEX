import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Database, ChevronRight, ChevronDown, Folder, FolderOpen, Check, Package, Plus } from 'lucide-react';
import { createMasterDataQuickAddItem, suggestQuickAddCode } from '../../utils/masterDataQuickAdd';
import { toast } from 'sonner';

export interface TreeDataItem {
    id: string;
    code: string;
    name: string;
    parent_id?: string | null;
    description?: string;
}

interface TreeSelectionModalProps {
    title: string;
    items: TreeDataItem[];
    currentValue: string;
    onSelect: (item: TreeDataItem) => void;
    onClose: () => void;
    /** Tanım tablosu adı — verilirse hızlı ekleme gösterilir (categories, product_groups) */
    definitionTableName?: string;
    /** Alt grup için üst grup id */
    parentId?: string | null;
    quickAddExtra?: Record<string, unknown>;
    onItemsChanged?: () => void;
}

interface InternalTreeNode extends TreeDataItem {
    children: InternalTreeNode[];
}

export function TreeSelectionModal({
    title,
    items,
    currentValue,
    onSelect,
    onClose,
    definitionTableName,
    parentId = null,
    quickAddExtra,
    onItemsChanged,
}: TreeSelectionModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [localItems, setLocalItems] = useState<TreeDataItem[]>(items);
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [quickCode, setQuickCode] = useState('');
    const [quickName, setQuickName] = useState('');
    const [quickSaving, setQuickSaving] = useState(false);

    useEffect(() => {
        setLocalItems(items);
    }, [items]);

    const sourceItems = localItems.length ? localItems : items;

    // Transform flat list to tree structure
    const treeData = useMemo(() => {
        const itemMap: Record<string, InternalTreeNode> = {};
        const roots: InternalTreeNode[] = [];

        sourceItems.forEach(item => {
            itemMap[item.id] = { ...item, children: [] };
        });

        sourceItems.forEach(item => {
            const node = itemMap[item.id];
            if (item.parent_id && itemMap[item.parent_id]) {
                itemMap[item.parent_id].children.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    }, [sourceItems]);

    // Handle search and filtering
    const filteredTree = useMemo(() => {
        if (!searchTerm.trim()) return treeData;

        const term = searchTerm.toLowerCase();
        const expandIds = new Set<string>();

        const filterNode = (node: InternalTreeNode): InternalTreeNode | null => {
            const matches =
                node.name.toLowerCase().includes(term) ||
                node.code.toLowerCase().includes(term) ||
                (node.description?.toLowerCase().includes(term));

            const filteredChildren = node.children
                .map(child => filterNode(child))
                .filter((child): child is InternalTreeNode => child !== null);

            if (matches || filteredChildren.length > 0) {
                expandIds.add(node.id);
                return { ...node, children: filteredChildren };
            }
            return null;
        };

        const result = treeData.map(node => filterNode(node)).filter((node): node is InternalTreeNode => node !== null);
        if (expandIds.size > 0) {
            setExpandedNodes(prev => {
                const next = new Set(prev);
                expandIds.forEach(id => next.add(id));
                return next;
            });
        }
        return result;
    }, [searchTerm, treeData]);

    const suggestCodeFromName = (name: string) => suggestQuickAddCode(name);

    const openQuickAdd = (prefillName = '') => {
        const name = prefillName.trim();
        setQuickName(name);
        setQuickCode(name ? suggestCodeFromName(name) : '');
        setShowQuickAdd(true);
    };

    const handleQuickAdd = async () => {
        if (!definitionTableName || !quickCode.trim() || !quickName.trim()) {
            toast.error('Kod ve ad zorunludur.');
            return;
        }
        setQuickSaving(true);
        try {
            const mapped = await createMasterDataQuickAddItem({
                tableName: definitionTableName,
                code: quickCode.trim(),
                name: quickName.trim(),
                parentId,
                extra: quickAddExtra,
            });
            const treeItem: TreeDataItem = {
                ...mapped,
                parent_id: parentId ?? null,
            };
            setLocalItems((prev) => [...prev, treeItem]);
            if (treeItem.parent_id) {
                setExpandedNodes((prev) => {
                    const next = new Set(prev);
                    next.add(treeItem.parent_id!);
                    return next;
                });
            }
            onItemsChanged?.();
            setQuickCode('');
            setQuickName('');
            setShowQuickAdd(false);
            onSelect(treeItem);
            toast.success('Kayıt eklendi');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setQuickSaving(false);
        }
    };

    const toggleNode = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const renderNode = (node: InternalTreeNode, depth: number = 0) => {
        const isExpanded = expandedNodes.has(node.id);
        const hasChildren = node.children.length > 0;
        const isSelected = currentValue === node.name || currentValue === node.code || currentValue === node.id;

        return (
            <div key={node.id} className="flex flex-col">
                <div
                    onClick={() => onSelect(node)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all hover:bg-[var(--asin-accent-muted,#D5F0EE)] group ${isSelected ? 'bg-[var(--asin-accent-muted,#D5F0EE)] border-l-4 border-[var(--asin-accent,#1FA8A0)]' : ''}`}
                    style={{ paddingLeft: `${(depth * 16) + 12}px` }}
                >
                    <div className="flex items-center gap-1 min-w-[20px]">
                        {hasChildren ? (
                            <button
                                onClick={(e) => toggleNode(node.id, e)}
                                className="p-0.5 hover:bg-[var(--asin-accent-muted,#D5F0EE)] rounded transition-colors"
                            >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                            </button>
                        ) : (
                            <div className="w-4" />
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {hasChildren ? (
                            isExpanded ? <FolderOpen className="w-4 h-4 text-[var(--asin-accent,#1FA8A0)] flex-shrink-0" /> : <Folder className="w-4 h-4 text-[var(--asin-accent,#1FA8A0)] flex-shrink-0" />
                        ) : (
                            <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}

                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold truncate ${isSelected ? 'text-[var(--asin-accent,#1FA8A0)]' : 'text-gray-700'}`}>
                                    {node.code}
                                </span>
                                <span className="text-gray-300 text-[10px]">|</span>
                                <span className={`text-xs truncate ${isSelected ? 'text-[var(--asin-primary,#0E2433)] font-medium' : 'text-gray-900'}`}>
                                    {node.name}
                                </span>
                            </div>
                            {node.description && (
                                <span className="text-[10px] text-gray-500 truncate">{node.description}</span>
                            )}
                        </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-[var(--asin-accent,#1FA8A0)] flex-shrink-0" />}
                </div>

                {hasChildren && isExpanded && (
                    <div className="flex flex-col">
                        {node.children.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[10001] p-4">
            <div className="bg-white w-full max-w-lg shadow-2xl rounded-lg flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-[var(--asin-primary,#0E2433)] rounded-t-lg">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        {title}
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
                            placeholder="Kategori veya kod ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)]/20 focus:border-[var(--asin-accent,#1FA8A0)] transition-all shadow-sm"
                            autoFocus
                        />
                    </div>
                </div>

                {definitionTableName && (
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
                                    placeholder="Kod"
                                    className="flex-1 min-w-[80px] px-2 py-1.5 border rounded text-xs"
                                />
                                <input
                                    value={quickName}
                                    onChange={(e) => setQuickName(e.target.value)}
                                    placeholder="Ad"
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

                {/* Tree View */}
                <div className="flex-1 overflow-auto p-2 bg-white">
                    {filteredTree.length === 0 ? (
                        <div className="text-center py-12">
                            <Database className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                            <p className="text-sm text-gray-500 italic">Aradığınız kriterde sonuç bulunamadı</p>
                            {definitionTableName && searchTerm.trim() && !showQuickAdd && (
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
                        <div className="space-y-0.5">
                            {filteredTree.map(node => renderNode(node))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        Vazgeç
                    </button>
                </div>
            </div>
        </div>
    );
}
