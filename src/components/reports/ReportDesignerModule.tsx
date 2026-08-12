import React, { useState, useRef, useEffect } from 'react';
import {
    Type, Image as ImageIcon, Table as TableIcon,
    Settings, Save, Play, Trash2, Layers,
    ChevronRight, ChevronLeft, Move, Maximize,
    Hash, Layout, Grid, Download, Printer, Copy, Sparkles, Database, Folder, FileText
} from 'lucide-react';
import {
    DndContext,
    useDraggable,
    useDroppable,
    DragEndEvent
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { snapToGrid, mmToPx, pxToMm, DEFAULT_A4, ReportComponent, DataField } from './designerUtils';

// --- Data Schema Definition ---
const INVOICE_SCHEMA: DataField[] = [
    {
        name: 'Fatura Bilgileri',
        key: 'invoice',
        type: 'object',
        children: [
            { name: 'Fatura No', key: 'invoice.number', type: 'string' },
            { name: 'Tarih', key: 'invoice.date', type: 'date' },
            { name: 'Saat', key: 'invoice.time', type: 'string' },
            { name: 'Belge No', key: 'invoice.document_no', type: 'string' }
        ]
    },
    {
        name: 'Cari Hesabı',
        key: 'customer',
        type: 'object',
        children: [
            { name: 'Ünvan', key: 'customer.name', type: 'string' },
            { name: 'Vergi No', key: 'customer.tax_no', type: 'string' },
            { name: 'Vergi Dairesi', key: 'customer.tax_office', type: 'string' },
            { name: 'Adres', key: 'customer.address', type: 'string' },
            { name: 'İl / İlçe', key: 'customer.city', type: 'string' },
            { name: 'Telefon', key: 'customer.phone', type: 'string' },
            { name: 'E-Posta', key: 'customer.email', type: 'string' }
        ]
    },
    {
        name: 'Toplamlar',
        key: 'totals',
        type: 'object',
        children: [
            { name: 'Ara Toplam', key: 'totals.subtotal', type: 'number' },
            { name: 'İndirim', key: 'totals.discount', type: 'number' },
            { name: 'KDV', key: 'totals.tax', type: 'number' },
            { name: 'Genel Toplam', key: 'totals.net', type: 'number' }
        ]
    },
    {
        name: 'Ürün Listesi',
        key: 'items',
        type: 'array',
        children: [
            { name: 'Ürün Adı', key: 'productName', type: 'string' },
            { name: 'Miktar', key: 'quantity', type: 'number' },
            { name: 'Birim', key: 'unit', type: 'string' },
            { name: 'Birim Fiyat', key: 'unitPrice', type: 'number' },
            { name: 'Tutar', key: 'total', type: 'number' },
            { name: 'KDV Oranı', key: 'taxRate', type: 'number' }
        ]
    }
];

// --- Draggable Field Element ---
function DraggableField({ field }: { field: DataField }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `field-${field.key}`,
        data: { type: 'field', field }
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="flex items-center gap-2 p-2 mb-1 bg-white border border-gray-100 rounded cursor-grab hover:bg-blue-50 hover:border-blue-200 transition-colors group"
        >
            <FileText className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-gray-700">{field.name}</span>
        </div>
    );
}

// --- Draggable Tool Element ---
function DraggableTool({ type, icon: Icon, label }: { type: string, icon: any, label: string }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `tool-${type}`,
        data: { type }
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="flex flex-col items-center justify-center p-3 mb-2 bg-white border border-gray-200 rounded-lg cursor-grab hover:border-blue-500 hover:shadow-sm transition-all group"
        >
            <Icon className="w-5 h-5 text-gray-500 group-hover:text-blue-600 mb-1" />
            <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">{label}</span>
        </div>
    );
}

// --- Designer Workspace (Paper) ---
function DesignerPaper({ components, selectedId, onSelect, onMove }: {
    components: ReportComponent[],
    selectedId: string | null,
    onSelect: (id: string) => void,
    onMove: (id: string, x: number, y: number) => void
}) {
    const { setNodeRef } = useDroppable({
        id: 'paper-area',
    });

    return (
        <div className="flex justify-center p-12 bg-gray-100 min-h-full overflow-auto">
            <div
                ref={setNodeRef}
                id="report-paper"
                className="bg-white shadow-2xl relative"
                style={{
                    width: `${mmToPx(DEFAULT_A4.width)}px`,
                    height: `${mmToPx(DEFAULT_A4.height)}px`,
                    backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}
            >
                {components.map((comp) => (
                    <div
                        key={comp.id}
                        onClick={(e) => { e.stopPropagation(); onSelect(comp.id); }}
                        className={`absolute cursor-pointer group flex items-center justify-center border ${selectedId === comp.id
                            ? 'border-blue-600 ring-2 ring-blue-600/20 z-20'
                            : 'border-transparent hover:border-blue-400 z-10'
                            }`}
                        style={{
                            left: `${mmToPx(comp.x)}px`,
                            top: `${mmToPx(comp.y)}px`,
                            width: `${mmToPx(comp.width)}px`,
                            height: `${mmToPx(comp.height)}px`,
                            background: comp.type === 'rect' ? (comp.style?.background || '#f3f4f6') : 'transparent'
                        }}
                    >
                        {comp.type === 'text' && (
                            <span style={comp.style} className="w-full h-full p-1 overflow-hidden">
                                {comp.content || '[METİN ALANI]'}
                            </span>
                        )}
                        {comp.type === 'image' && (
                            <ImageIcon className="w-1/2 h-1/2 text-gray-300" />
                        )}
                        {comp.type === 'table' && (
                            <div className="w-full h-full border border-gray-300 bg-white text-[10px] overflow-hidden">
                                <div className="flex bg-gray-100 border-b border-gray-200 font-bold">
                                    {comp.columns?.map((col, i) => (
                                        <div key={i} style={{ width: `${col.width}%` }} className="p-1 border-r border-gray-200 last:border-0 truncate">
                                            {col.header}
                                        </div>
                                    ))}
                                    {!comp.columns && <div className="p-1 w-full">Tablo (Sütun Yok)</div>}
                                </div>
                                <div className="p-1 text-gray-400 italic text-center mt-2">
                                    [Veri Listesi Burada Listelenecek]
                                </div>
                            </div>
                        )}
                        {comp.type === 'barcode' && (
                            <div className="w-full h-full bg-slate-50 flex items-center justify-center p-2">
                                <div className="w-full h-full border-l-2 border-r-2 border-slate-300 flex justify-between px-1">
                                    {[...Array(10)].map((_, i) => <div key={i} className="w-1 h-full bg-black"></div>)}
                                </div>
                            </div>
                        )}

                        {/* Handle for moving (Custom implementation since it's already placed) */}
                        {selectedId === comp.id && (
                            <div className="absolute -top-3 -left-3 bg-blue-600 text-white p-1 rounded-full shadow-lg">
                                <Move className="w-3 h-3" />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ReportDesignerModule() {
    const [components, setComponents] = useState<ReportComponent[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'tools' | 'data'>('tools');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showGallery, setShowGallery] = useState(false);

    // Standard Templates Data
    const standardTemplates = [
        {
            id: 'template-modern-invoice',
            name: 'Modern Satış Faturası',
            icon: Layout,
            components: [
                { id: `comp-1`, type: 'text', x: 10, y: 10, width: 40, height: 10, content: 'LOGO BURADA', style: { fontSize: '10px', color: '#666', border: '1px dashed #ccc' } },
                { id: `comp-2`, type: 'text', x: 150, y: 10, width: 50, height: 10, content: 'SATIŞ FATURASI', style: { fontSize: '18px', fontWeight: 'bold', textAlign: 'right' } },
                { id: `comp-3`, type: 'rect', x: 10, y: 80, width: 190, height: 8, style: { background: '#f3f4f6' } }
            ]
        },
        {
            id: 'template-corporate-invoice',
            name: 'Kurumsal Fatura Tasarımı',
            icon: Layout,
            components: [
                // Header / Company Info
                { id: 'c-1', type: 'text', x: 10, y: 10, width: 80, height: 10, content: 'ŞİRKET ADI A.Ş.', style: { fontSize: '18px', fontWeight: 'bold', color: '#1e293b' } },
                { id: 'c-2', type: 'text', x: 10, y: 20, width: 80, height: 25, content: 'Adres Bilgisi\nTelefon: +90 000 000 0000\nVergi No: 0000000000', style: { fontSize: '10px', color: '#475569' } },

                // Invoice Title & Meta
                { id: 'c-3', type: 'text', x: 140, y: 10, width: 60, height: 10, content: 'FATURA', style: { fontSize: '24px', fontWeight: '800', textAlign: 'right', color: '#0f172a' } },
                { id: 'c-4', type: 'text', x: 140, y: 20, width: 60, height: 5, content: 'BELGE', style: { fontSize: '10px', textAlign: 'right', color: '#94a3b8', letterSpacing: '2px' } },
                { id: 'c-5', type: 'text', x: 140, y: 30, width: 60, height: 5, content: 'Tarih: [DATE]', binding: 'invoice.date', style: { fontSize: '12px', textAlign: 'right', fontWeight: 'bold' } },
                { id: 'c-6', type: 'text', x: 140, y: 36, width: 60, height: 5, content: 'No: [NO]', binding: 'invoice.number', style: { fontSize: '12px', textAlign: 'right', fontWeight: 'bold' } },

                // Customer Info
                { id: 'c-7', type: 'rect', x: 10, y: 50, width: 190, height: 25, style: { background: '#f8fafc', borderRadius: '4px' } },
                { id: 'c-8', type: 'text', x: 15, y: 53, width: 100, height: 5, content: 'SAYIN MÜŞTERİ', style: { fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' } },
                { id: 'c-9', type: 'text', x: 15, y: 60, width: 100, height: 10, content: '[MÜŞTERİ ÜNVANI]', binding: 'customer.name', style: { fontSize: '14px', fontWeight: 'bold' } },

                // Items Table
                {
                    id: 'c-10',
                    type: 'table',
                    x: 10,
                    y: 80,
                    width: 190,
                    height: 100,
                    columns: [
                        { header: 'Ürün / Hizmet', field: 'productName', width: 40 },
                        { header: 'Miktar', field: 'quantity', width: 15 },
                        { header: 'Birim', field: 'unit', width: 15 },
                        { header: 'Birim Fiyat', field: 'unitPrice', width: 15 },
                        { header: 'Tutar', field: 'total', width: 15 }
                    ],
                    style: { fontSize: '10px' }
                },

                // Footer / Totals
                { id: 'c-11', type: 'rect', x: 130, y: 190, width: 70, height: 40, style: { background: '#f8fafc', borderRadius: '8px' } },
                { id: 'c-12', type: 'text', x: 135, y: 195, width: 30, height: 5, content: 'Ara Toplam', style: { fontSize: '10px', color: '#64748b' } },
                { id: 'c-13', type: 'text', x: 170, y: 195, width: 25, height: 5, content: '[SUBTOTAL]', binding: 'totals.subtotal', style: { fontSize: '12px', fontWeight: 'bold', textAlign: 'right' } },
                { id: 'c-14', type: 'text', x: 135, y: 202, width: 30, height: 5, content: 'KDV', style: { fontSize: '10px', color: '#64748b' } },
                { id: 'c-15', type: 'text', x: 170, y: 202, width: 25, height: 5, content: '[TAX]', binding: 'totals.tax', style: { fontSize: '12px', fontWeight: 'bold', textAlign: 'right' } },
                { id: 'c-16', type: 'line', x: 135, y: 210, width: 60, height: 1, style: { borderColor: '#cbd5e1' } },
                { id: 'c-17', type: 'text', x: 135, y: 215, width: 30, height: 8, content: 'GENEL TOPLAM', style: { fontSize: '12px', fontWeight: 'bold' } },
                { id: 'c-18', type: 'text', x: 165, y: 215, width: 30, height: 8, content: '[TOTAL]', binding: 'totals.net', style: { fontSize: '16px', fontWeight: '800', color: '#1d4ed8', textAlign: 'right' } },

                // Bottom
                { id: 'c-19', type: 'text', x: 10, y: 250, width: 190, height: 5, content: 'İşbirliğiniz için teşekkür ederiz.', style: { fontSize: '10px', color: '#94a3b8', textAlign: 'center' } }
            ]
        },
        {
            id: 'template-standard-label',
            name: 'Standart Ürün Etiketi',
            icon: Sparkles,
            components: [
                { id: `comp-l1`, type: 'text', x: 2, y: 2, width: 36, height: 5, content: 'ÜRÜN ADI', style: { fontSize: '10px', fontWeight: 'bold' } },
                { id: `comp-l2`, type: 'barcode', x: 2, y: 10, width: 36, height: 8 }
            ]
        }
    ];

    const loadTemplate = (template: any) => {
        setComponents(template.components.map((c: any) => ({
            ...c,
            id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        })));
        setShowGallery(false);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over, delta } = event;

        if (over && over.id === 'paper-area') {
            const toolType = active.data.current?.type;

            // If it's a tool from the sidebar
            if (active.id.toString().startsWith('tool-')) {
                const rect = document.getElementById('report-paper')?.getBoundingClientRect();
                if (!rect) return;

                // Calculate position relative to paper
                const rawX = active.rect.current.translated?.left ? active.rect.current.translated.left - rect.left : 0;
                const rawY = active.rect.current.translated?.top ? active.rect.current.translated.top - rect.top : 0;

                const newId = `comp-${Date.now()}`;
                const newComp: ReportComponent = {
                    id: newId,
                    type: toolType,
                    x: snapToGrid(pxToMm(rawX)),
                    y: snapToGrid(pxToMm(rawY)),
                    width: toolType === 'barcode' ? 60 : (toolType === 'table' ? 190 : 100),
                    height: toolType === 'barcode' ? 20 : (toolType === 'table' ? 50 : 10),
                    content: toolType === 'text' ? 'Yeni Metin' : undefined,
                    columns: toolType === 'table' ? [
                        { header: 'Kolon 1', field: 'col1', width: 33 },
                        { header: 'Kolon 2', field: 'col2', width: 33 },
                        { header: 'Kolon 3', field: 'col3', width: 33 }
                    ] : undefined,
                    style: { fontSize: '12px', fontWeight: '400' }
                };

                setComponents([...components, newComp]);
                setSelectedId(newId);
            }
            // If it's a data field from the data source panel
            else if (active.data.current?.type === 'field') {
                const field = active.data.current.field as DataField;
                const rect = document.getElementById('report-paper')?.getBoundingClientRect();
                if (!rect) return;

                const rawX = active.rect.current.translated?.left ? active.rect.current.translated.left - rect.left : 0;
                const rawY = active.rect.current.translated?.top ? active.rect.current.translated.top - rect.top : 0;

                const newId = `comp-${Date.now()}`;
                let newComp: ReportComponent;

                if (field.key === 'items') {
                    // Create a table automatically for the items array
                    newComp = {
                        id: newId,
                        type: 'table',
                        x: snapToGrid(pxToMm(rawX)),
                        y: snapToGrid(pxToMm(rawY)),
                        width: 190,
                        height: 50,
                        columns: [
                            { header: 'Ürün Adı', field: 'productName', width: 40 },
                            { header: 'Miktar', field: 'quantity', width: 15 },
                            { header: 'Birim Fiyat', field: 'unitPrice', width: 15 },
                            { header: 'Tutar', field: 'total', width: 15 }
                        ],
                        style: { fontSize: '10px' }
                    };
                } else {
                    // Create a text field with binding
                    newComp = {
                        id: newId,
                        type: 'text',
                        x: snapToGrid(pxToMm(rawX)),
                        y: snapToGrid(pxToMm(rawY)),
                        width: 40,
                        height: 5,
                        content: `[${field.name.toUpperCase()}]`,
                        binding: field.key,
                        style: { fontSize: '10px', fontWeight: field.type === 'number' ? 'bold' : 'normal', textAlign: field.type === 'number' ? 'right' : 'left' }
                    };
                }

                setComponents([...components, newComp]);
                setSelectedId(newId);
            }
        }
    };

    const selectedComp = components.find(c => c.id === selectedId);

    const updateSelected = (updates: Partial<ReportComponent>) => {
        if (!selectedId) return;
        setComponents(components.map(c =>
            c.id === selectedId ? { ...c, ...updates } : c
        ));
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
            {/* Top Toolbar */}
            <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-30 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Layout className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-gray-900 leading-tight">Dizayn Merkezi</h1>
                        <p className="text-[10px] text-gray-500 uppercase font-medium tracking-tighter">Modern Report Engine v1.0</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowGallery(!showGallery)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-all"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Hazır Şablonlar
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all">
                        <Play className="w-3.5 h-3.5" />
                        Önizleme
                    </button>
                    <button
                        onClick={() => {
                            // In a real app, this would save to backend/localStorage
                            console.log('Template saved:', components);
                            alert('Şablon başarıyla kaydedildi! (Demo)');
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all">
                        <Save className="w-3.5 h-3.5" />
                        Şablonu Kaydet
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <DndContext onDragEnd={handleDragEnd}>
                    {/* Left Sidebar */}
                    <div className="w-64 bg-white border-r border-gray-200 flex flex-col z-20 shadow-sm">
                        {/* Sidebar Tabs */}
                        <div className="flex border-b border-gray-200">
                            <button
                                onClick={() => setActiveTab('tools')}
                                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'tools' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                <Layout className="w-4 h-4" />
                                Araçlar
                            </button>
                            <button
                                onClick={() => setActiveTab('data')}
                                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'data' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                <Database className="w-4 h-4" />
                                Veri Kaynağı
                            </button>
                        </div>

                        {/* Sidebar Content */}
                        <div className="flex-1 overflow-y-auto p-3">
                            {activeTab === 'tools' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <DraggableTool type="text" icon={Type} label="Metin" />
                                    <DraggableTool type="image" icon={ImageIcon} label="Resim" />
                                    <DraggableTool type="table" icon={TableIcon} label="Tablo" />
                                    <DraggableTool type="barcode" icon={Hash} label="Barkod" />
                                    <DraggableTool type="rect" icon={Grid} label="Şekil" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {INVOICE_SCHEMA.map((group) => (
                                        <div key={group.key}>
                                            <div className="flex items-center gap-1.5 mb-2 px-1">
                                                <Folder className="w-3.5 h-3.5 text-yellow-500" />
                                                <span className="text-xs font-bold text-gray-700">{group.name}</span>
                                            </div>
                                            <div className="pl-2 space-y-1">
                                                {group.children?.map(field => (
                                                    <DraggableField key={field.key} field={field} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Workspace */}
                    <div className="flex-1 overflow-auto bg-gray-100 flex flex-col relative">
                        {showGallery && (
                            <div className="absolute inset-0 bg-gray-900/10 backdrop-blur-sm z-40 flex items-center justify-center p-8">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-full overflow-hidden flex flex-col">
                                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Hazır Şablon Kütüphanesi</h3>
                                            <p className="text-xs text-gray-500">Standart tasarımlardan birini seçerek hızlıca başlayın</p>
                                        </div>
                                        <button onClick={() => setShowGallery(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                            <Trash2 className="w-5 h-5 text-gray-400" />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4">
                                        {standardTemplates.map((tpl) => (
                                            <div
                                                key={tpl.id}
                                                onClick={() => loadTemplate(tpl)}
                                                className="group cursor-pointer border border-gray-200 rounded-xl p-4 hover:border-blue-500 hover:shadow-md transition-all flex items-start gap-4"
                                            >
                                                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                                                    <tpl.icon className="w-6 h-6 text-blue-600 group-hover:text-white" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-sm font-bold text-gray-900 mb-1">{tpl.name}</h4>
                                                    <p className="text-[10px] text-gray-500 line-clamp-2">Logo ERP standartlarına uygun profesyonel tasarım.</p>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        <DesignerPaper
                            components={components}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onMove={() => { }}
                        />
                    </div>
                </DndContext>

                {/* Right Properties Panel */}
                <div className={`w-72 bg-white border-l border-gray-200 flex flex-col transition-all duration-300 z-20 shadow-sm ${sidebarOpen ? 'translate-x-0' : 'translate-x-full absolute invisible'}`}>
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-xs font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <Settings className="w-3.5 h-3.5 text-blue-600" />
                            Özellikler
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {!selectedComp ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                    <Move className="w-6 h-6 text-gray-300" />
                                </div>
                                <p className="text-xs text-gray-400 font-medium leading-relaxed">Düzenlemek için bir nesne şeçin<br />veya yenisini sürükleyin</p>
                            </div>
                        ) : (
                            <>
                                {/* Basic Props */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2 px-1">Konum & Boyut (mm)</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <span className="text-[9px] text-gray-500 font-medium px-1">X</span>
                                                <input
                                                    type="number"
                                                    value={selectedComp.x}
                                                    onChange={(e) => updateSelected({ x: Number(e.target.value) })}
                                                    className="w-full h-8 px-2 text-xs bg-gray-50 border border-gray-200 rounded focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[9px] text-gray-500 font-medium px-1">Y</span>
                                                <input
                                                    type="number"
                                                    value={selectedComp.y}
                                                    onChange={(e) => updateSelected({ y: Number(e.target.value) })}
                                                    className="w-full h-8 px-2 text-xs bg-gray-50 border border-gray-200 rounded focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[9px] text-gray-500 font-medium px-1">Genişlik</span>
                                                <input
                                                    type="number"
                                                    value={selectedComp.width}
                                                    onChange={(e) => updateSelected({ width: Number(e.target.value) })}
                                                    className="w-full h-8 px-2 text-xs bg-gray-50 border border-gray-200 rounded focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[9px] text-gray-500 font-medium px-1">Yükseklik</span>
                                                <input
                                                    type="number"
                                                    value={selectedComp.height}
                                                    onChange={(e) => updateSelected({ height: Number(e.target.value) })}
                                                    className="w-full h-8 px-2 text-xs bg-gray-50 border border-gray-200 rounded focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {selectedComp.type === 'text' && (
                                        <div className="space-y-4 pt-4 border-t border-gray-100">
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5 px-1">İçerik</label>
                                                <textarea
                                                    value={selectedComp.content}
                                                    onChange={(e) => updateSelected({ content: e.target.value })}
                                                    className="w-full h-20 p-2 text-xs bg-gray-50 border border-gray-200 rounded focus:border-blue-500 outline-none resize-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5 px-1">Veri Alanı</label>
                                                <select
                                                    value={selectedComp.binding}
                                                    onChange={(e) => updateSelected({ binding: e.target.value })}
                                                    className="w-full h-8 px-2 text-xs bg-gray-50 border border-gray-200 rounded focus:border-blue-500 outline-none"
                                                >
                                                    <option value="">Manuel Metin</option>
                                                    <option value="customer.name">Müşteri Ünvanı</option>
                                                    <option value="customer.tax_no">Vergi No</option>
                                                    <option value="invoice.number">Fatura No</option>
                                                    <option value="invoice.date">Fatura Tarihi</option>
                                                    <option value="totals.gross">Brüt Toplam</option>
                                                    <option value="totals.net">Net Toplam</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-6">
                                        <button
                                            onClick={() => {
                                                setComponents(components.filter(c => c.id !== selectedId));
                                                setSelectedId(null);
                                            }}
                                            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-500 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Nesneyi Sil
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Sayfa Katmanları</span>
                            <span className="text-[10px] text-gray-500 font-bold">{components.length} Nesne</span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {components.map((c, i) => (
                                <div
                                    key={c.id}
                                    onClick={() => setSelectedId(c.id)}
                                    className={`px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${selectedId === c.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-100 hover:bg-gray-100'}`}
                                >
                                    {i + 1}. {c.type.toUpperCase()} #{c.id.split('-')[1]}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


