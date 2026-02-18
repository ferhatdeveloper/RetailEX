import React, { useRef } from 'react';
import { mmToPx, DEFAULT_A4, ReportTemplate, getBoundValue, exportToPDF, pxToMm } from './designerUtils';
import { Download, Printer, X } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';

interface ReportViewerProps {
    template: ReportTemplate;
    data: any;
    onClose: () => void;
}

export function ReportViewerModule({ template, data, onClose }: ReportViewerProps) {
    const paperRef = useRef<HTMLDivElement>(null);

    const handleDownload = () => {
        if (paperRef.current) {
            exportToPDF(paperRef.current, `${template.name}.pdf`);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex flex-col items-center">
            {/* Viewer Toolbar */}
            <div className="w-full h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <h2 className="text-sm font-bold text-gray-900">{template.name}</h2>
                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Rapor Önizleme</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-all font-mono"
                    >
                        <Download className="w-4 h-4" />
                        PDF İNDİR
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all"
                    >
                        <Printer className="w-4 h-4" />
                        YAZDIR
                    </button>
                    <div className="w-px h-6 bg-gray-200 mx-2" />
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-900 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 w-full overflow-auto p-12 flex justify-center">
                <div
                    ref={paperRef}
                    className="bg-white shadow-2xl relative flex-shrink-0 print:m-0 print:shadow-none"
                    style={{
                        width: `${mmToPx(template.pageSize?.width || DEFAULT_A4.width)}px`,
                        height: `${mmToPx(template.pageSize?.height || DEFAULT_A4.height)}px`,
                    }}
                >
                    {template.components.map((comp) => (
                        <div
                            key={comp.id}
                            className="absolute overflow-hidden"
                            style={{
                                left: `${mmToPx(comp.x)}px`,
                                top: `${mmToPx(comp.y)}px`,
                                width: `${mmToPx(comp.width)}px`,
                                height: `${mmToPx(comp.height)}px`,
                                ...comp.style,
                                background: comp.type === 'rect' ? (comp.style?.background || '#f3f4f6') : 'transparent'
                            }}
                        >
                            {comp.type === 'text' && (
                                <div className="w-full h-full p-0.5">
                                    {comp.binding ? getBoundValue(comp.binding, data) : comp.content}
                                </div>
                            )}
                            {comp.type === 'barcode' && (
                                <div className="w-full h-full bg-slate-50 flex items-center justify-center p-2 text-[8px]">
                                    [BARCODE: {comp.binding ? getBoundValue(comp.binding, data) : 'TEMP'}]
                                </div>
                            )}
                            {comp.type === 'table' && comp.columns && (
                                <div className="w-full h-full text-[10px]">
                                    {/* Header */}
                                    <div className="flex bg-gray-100 border-b border-gray-800 font-bold" style={comp.style}>
                                        {comp.columns.map((col, i) => (
                                            <div key={i} style={{ width: `${col.width}%` }} className="p-1.5 border-r border-gray-300 last:border-0 truncate">
                                                {col.header}
                                            </div>
                                        ))}
                                    </div>
                                    {/* Rows */}
                                    {(data?.items || []).map((item: any, rowIndex: number) => (
                                        <div key={rowIndex} className="flex border-b border-gray-100 hover:bg-gray-50">
                                            {comp.columns?.map((col, colIndex) => {
                                                let val = item[col.field];
                                                // Simple formatting for numbers
                                                if (typeof val === 'number') val = formatNumber(val, 2, true);
                                                return (
                                                    <div key={colIndex} style={{ width: `${col.width}%` }} className={`p-1.5 border-r border-gray-100 last:border-0 truncate ${typeof item[col.field] === 'number' ? 'text-right' : ''}`}>
                                                        {val}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                    {(!data?.items || data.items.length === 0) && (
                                        <div className="p-2 text-center text-gray-400 italic">Veri yok</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
