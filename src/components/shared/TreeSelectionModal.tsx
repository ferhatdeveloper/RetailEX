import React, { useState, useMemo } from 'react';
import { X, Search, Database, ChevronRight, ChevronDown, Folder, FolderOpen, Check, Package } from 'lucide-react';

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
}

interface InternalTreeNode extends TreeDataItem {
    children: InternalTreeNode[];
}

export function TreeSelectionModal({
    title,
    items,
    currentValue,
    onSelect,
    onClose
}: TreeSelectionModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    // Transform flat list to tree structure
    const treeData = useMemo(() => {
        const itemMap: Record<string, InternalTreeNode> = {};
        const roots: InternalTreeNode[] = [];

        // Create map of all items
        items.forEach(item => {
            itemMap[item.id] = { ...item, children: [] };
        });

        // Build tree
        items.forEach(item => {
            const node = itemMap[item.id];
            if (item.parent_id && itemMap[item.parent_id]) {
                itemMap[item.parent_id].children.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    }, [items]);

    // Handle search and filtering
    const filteredTree = useMemo(() => {
        if (!searchTerm.trim()) return treeData;

        const term = searchTerm.toLowerCase();
        const filterNode = (node: InternalTreeNode): InternalTreeNode | null => {
            const matches =
                node.name.toLowerCase().includes(term) ||
                node.code.toLowerCase().includes(term) ||
                (node.description?.toLowerCase().includes(term));

            const filteredChildren = node.children
                .map(child => filterNode(child))
                .filter((child): child is InternalTreeNode => child !== null);

            if (matches || filteredChildren.length > 0) {
                // Auto-expand if search matches
                setExpandedNodes(prev => {
                    const next = new Set(prev);
                    next.add(node.id);
                    return next;
                });
                return { ...node, children: filteredChildren };
            }
            return null;
        };

        return treeData.map(node => filterNode(node)).filter((node): node is InternalTreeNode => node !== null);
    }, [searchTerm, treeData]);

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
                    className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all hover:bg-blue-50 group ${isSelected ? 'bg-blue-100 border-l-4 border-blue-600' : ''}`}
                    style={{ paddingLeft: `${(depth * 16) + 12}px` }}
                >
                    <div className="flex items-center gap-1 min-w-[20px]">
                        {hasChildren ? (
                            <button
                                onClick={(e) => toggleNode(node.id, e)}
                                className="p-0.5 hover:bg-blue-200 rounded transition-colors"
                            >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                            </button>
                        ) : (
                            <div className="w-4" />
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {hasChildren ? (
                            isExpanded ? <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        ) : (
                            <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}

                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                                    {node.code}
                                </span>
                                <span className="text-gray-300 text-[10px]">|</span>
                                <span className={`text-xs truncate ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-900'}`}>
                                    {node.name}
                                </span>
                            </div>
                            {node.description && (
                                <span className="text-[10px] text-gray-500 truncate">{node.description}</span>
                            )}
                        </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
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
                <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-800 rounded-t-lg">
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
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Tree View */}
                <div className="flex-1 overflow-auto p-2 bg-white">
                    {filteredTree.length === 0 ? (
                        <div className="text-center py-12">
                            <Database className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                            <p className="text-sm text-gray-500 italic">Aradığınız kriterde sonuç bulunamadı</p>
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

