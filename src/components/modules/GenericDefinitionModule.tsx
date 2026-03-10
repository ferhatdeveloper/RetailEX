import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, X, AlertCircle, RefreshCw, Download, Upload, Filter, MoreVertical } from 'lucide-react';
import { definitionAPI, DefinitionItem } from '../../services/definitionAPI';
import { BaseModal } from '../shared/BaseModal';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { IconPicker } from '../shared/IconPicker';
import * as LucideIcons from 'lucide-react';
import { Check, Minus } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { ContextMenu } from '../shared/ContextMenu';

interface ColumnDef {
    key: string;
    header: string;
    type?: 'text' | 'boolean' | 'number' | 'icon';
}

interface GenericDefinitionModuleProps {
    title: string;
    description: string;
    tableName: string;
    columns: ColumnDef[];
    icon: React.ElementType;
}

export function GenericDefinitionModule({
    title,
    description,
    tableName,
    columns,
    icon: Icon
}: GenericDefinitionModuleProps) {
    const { t, tm } = useLanguage();
    const [items, setItems] = useState<DefinitionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<DefinitionItem | null>(null);
    const [formData, setFormData] = useState<any>({});
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: DefinitionItem } | null>(null);

    const loadItems = useCallback(async () => {
        try {
            setLoading(true);
            const data = await definitionAPI.getAll(tableName);
            setItems(data);
        } catch (error) {
            console.error('Error loading items:', error);
        } finally {
            setLoading(false);
        }
    }, [tableName]);

    useEffect(() => {
        setItems([]);
        setSearchQuery('');
        setLoading(true);
        loadItems();
    }, [tableName, loadItems]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await definitionAPI.update(tableName, editingItem.id, formData);
            } else {
                console.log('[GenericDefinitionModule] Creating with formData:', formData);
                await definitionAPI.create(tableName, { ...formData, is_active: true });
            }
            setShowModal(false);
            resetForm();
            loadItems();
        } catch (error: any) {
            console.error('Error saving item:', error);
            alert(error.message || tm('saveError'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(tm('confirmDeleteRecord'))) return;
        try {
            await definitionAPI.delete(tableName, id);
            loadItems();
        } catch (error) {
            console.error('Error deleting:', error);
            alert(tm('deleteError'));
        }
    };

    const handleToggleActive = async (item: DefinitionItem) => {
        try {
            await definitionAPI.toggleActive(tableName, item.id, item.is_active);
            loadItems();
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    const resetForm = () => {
        const initialData: any = {};
        columns.forEach(col => {
            if (col.key !== 'is_active' && col.key !== 'actions') {
                initialData[col.key] = col.type === 'boolean' ? false : '';
            }
        });
        setFormData(initialData);
        console.log('[GenericDefinitionModule] Form Reset:', initialData);
        setEditingItem(null);
    };

    const openEditModal = (item: DefinitionItem) => {
        setEditingItem(item);
        const data: any = {};
        columns.forEach(col => {
            data[col.key] = item[col.key];
        });
        setFormData(data);
        setShowModal(true);
    };

    const filteredItems = useMemo(() => {
        return items.filter(item =>
            Object.values(item).some(val =>
                String(val).toLowerCase().includes(searchQuery.toLowerCase())
            )
        );
    }, [items, searchQuery]);

    // Construct columns for DevExDataGrid
    const columnHelper = createColumnHelper<DefinitionItem>();
    const gridColumns = useMemo(() => {
        const cols = columns.map(col =>
            columnHelper.accessor(col.key as any, {
                header: col.header,
                cell: info => {
                    const value = info.getValue();
                    if (col.type === 'boolean') {
                        return value ? <Check className="w-4 h-4 text-green-600" /> : <Minus className="w-4 h-4 text-gray-300" />;
                    }
                    if (col.type === 'icon') {
                        const IconComp = (LucideIcons as any)[value as string] || LucideIcons.HelpCircle;
                        return (
                            <div className="flex items-center gap-2">
                                <IconComp className="w-4 h-4 text-blue-600" />
                                <span className="text-[10px] text-gray-500 font-mono">{value}</span>
                            </div>
                        );
                    }
                    return value;
                },
            })
        );

        // Add Status Column
        cols.push(
            columnHelper.accessor('is_active', {
                header: tm('status').toUpperCase(),
                cell: info => (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(info.row.original);
                        }}
                        className={`px-2 py-1 text-[10px] font-bold rounded-full border transition-all ${info.getValue()
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                            }`}
                    >
                        {info.getValue() ? tm('activeStatus') : tm('passiveStatus')}
                    </button>
                ),
                size: 100
            }) as any
        );

        // Add Actions Column
        cols.push(
            columnHelper.display({
                id: 'actions',
                header: tm('actions').toUpperCase(),
                cell: info => (
                    <div className="flex items-center gap-1 justify-end">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(info.row.original);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title={tm('edit')}
                        >
                            <Edit className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(info.row.original.id);
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title={tm('delete')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ),
                size: 100,
            }) as any
        );

        return cols;
    }, [columns]);

    // Context Menu Handler
    const handleContextMenu = (e: React.MouseEvent, item: DefinitionItem) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item
        });
    };

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header - Standard Blue Gradient */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 shadow-md z-10 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1 bg-white/10 rounded">
                            <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-tight">{title}</h2>
                            <p className="text-[10px] text-blue-100 leading-none opacity-80">{description} • {items.length} {tm('records')}</p>
                        </div>
                    </div>

                    <div className="flex gap-1.5">
                        <button
                            onClick={loadItems}
                            className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] rounded backdrop-blur-sm"
                            title={tm('refresh')}
                        >
                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{tm('refresh')}</span>
                        </button>
                        <button className="hidden sm:flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] rounded backdrop-blur-sm">
                            <Download className="w-3 h-3" />
                            <span>{tm('export')}</span>
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

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col p-3">
                {/* Search & Filters */}
                <div className="mb-3 bg-white p-3 border border-gray-200 rounded-lg shadow-sm flex-shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={tm('searchInside').replace('...', '') + ` ${title}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                        />
                    </div>
                </div>

                {/* Data Grid */}
                <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col relative">
                    {loading ? (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                                <span className="text-sm font-medium text-gray-600">{tm('loadingData')}</span>
                            </div>
                        </div>
                    ) : (
                        <DevExDataGrid
                            data={filteredItems}
                            columns={gridColumns}
                            onRowDoubleClick={(row) => openEditModal(row)}
                            onRowContextMenu={handleContextMenu}
                            pageSize={20}
                            height="100%"
                        />
                    )}
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={[
                        {
                            id: 'edit',
                            label: tm('edit'),
                            icon: LucideIcons.Edit,
                            onClick: () => openEditModal(contextMenu.item)
                        },
                        {
                            id: 'toggle',
                            label: contextMenu.item.is_active ? tm('deactivate') : tm('activate'),
                            icon: LucideIcons.RefreshCw,
                            onClick: () => handleToggleActive(contextMenu.item)
                        },
                        {
                            id: 'delete',
                            label: tm('delete'),
                            icon: LucideIcons.Trash2,
                            variant: 'danger',
                            divider: true,
                            onClick: () => handleDelete(contextMenu.item.id)
                        }
                    ]}
                />
            )}

            {/* Edit Modal */}
            <BaseModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={editingItem ? `${tm('edit')} ${title}` : `${tm('addNew')} ${title}`}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 bg-gray-100 border border-gray-200 rounded text-gray-700 hover:bg-gray-200 font-medium text-sm transition-colors"
                        >
                            {tm('cancel')}
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm transition-colors shadow-sm shadow-blue-200"
                        >
                            {editingItem ? tm('update') : tm('save')}
                        </button>
                    </>
                }
            >
                <form onSubmit={handleSubmit} className="space-y-4 p-1">
                    {columns.map(col => (
                        <div key={col.key}>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                                {col.header} {(col.key === 'code' || col.key === 'name') && <span className="text-red-500">*</span>}
                            </label>

                            {col.type === 'boolean' ? (
                                <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-300 rounded cursor-pointer hover:bg-white transition-all">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={!!formData[col.key]}
                                            onChange={(e) => setFormData({ ...formData, [col.key]: e.target.checked })}
                                            className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-slate-300 checked:bg-blue-600 transition-all"
                                        />
                                        <Check className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                    </div>
                                    <span className="text-sm text-gray-700 font-medium">{tm('activate')}</span>
                                </label>
                            ) : col.type === 'icon' ? (
                                <IconPicker
                                    value={formData[col.key] || ''}
                                    onChange={(name) => setFormData({ ...formData, [col.key]: name })}
                                />
                            ) : (
                                <input
                                    type={col.type === 'number' ? 'number' : 'text'}
                                    required={col.key === 'code' || col.key === 'name'}
                                    value={formData[col.key] || ''}
                                    onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 placeholder-gray-400"
                                    placeholder={`${tm('definitionName')} ${tm('enterText')}`}
                                />
                            )}
                        </div>
                    ))}
                    <button type="submit" className="hidden" />
                </form>
            </BaseModal>
        </div>
    );
}

