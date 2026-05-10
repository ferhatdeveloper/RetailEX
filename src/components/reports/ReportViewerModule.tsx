import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { DEFAULT_A4, ReportTemplate, getBoundValue, exportToPDF } from './designerUtils';
import { Download, Printer, X } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';

function reportBarcodeFormat(value: string): 'EAN13' | 'CODE128' {
    if (/^\d{13}$/.test(value)) return 'EAN13';
    return 'CODE128';
}

/** Kutunun genişliğine göre çubuk modülü (px) — yazdırma kutusuna sığacak şekilde. */
function estimateBarcodeModuleWidthPx(value: string, widthPx: number): number {
    const fmt = reportBarcodeFormat(value);
    if (fmt === 'EAN13' && /^\d{13}$/.test(value)) {
        return Math.max(0.9, Math.min(4, widthPx / 95));
    }
    const len = Math.max(value.length, 3);
    const modulesGuess = 56 + len * 14;
    return Math.max(0.75, Math.min(4, widthPx / modulesGuess));
}

function fitBarcodeSvgToContainer(svg: SVGSVGElement) {
    const apply = () => {
        try {
            const b = svg.getBBox();
            if (!Number.isFinite(b.width) || !Number.isFinite(b.height) || b.width <= 0 || b.height <= 0) return;
            const pad = 0.5;
            svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.maxWidth = '100%';
            svg.style.maxHeight = '100%';
            svg.style.display = 'block';
        } catch {
            /* layout henüz hazır değil */
        }
    };
    apply();
    requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
    });
}

/** Barkod çizimi — altındaki rakamlar (displayValue) kutuya göre ölçeklenir. */
function ReportBarcodeSvg({
    svgId,
    value,
    widthPx,
    heightPx,
}: {
    svgId: string;
    value: string;
    widthPx: number;
    heightPx: number;
}) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const el = svgRef.current;
        if (!el || !value || widthPx < 2 || heightPx < 2) return;
        while (el.firstChild) el.removeChild(el.firstChild);

        const showText = true;
        const textReserve = Math.min(Math.max(8, heightPx * 0.26), heightPx * 0.42);
        const barH = Math.max(6, Math.floor(heightPx - textReserve - 1));
        const modW = estimateBarcodeModuleWidthPx(value, widthPx);
        const fmt = reportBarcodeFormat(value);
        const opts = {
            format: fmt,
            width: modW,
            height: barH,
            displayValue: showText,
            fontSize: Math.max(5, Math.min(14, Math.floor(heightPx * 0.17))),
            textMargin: 0,
            margin: 0,
            background: '#ffffff',
        } as const;

        const draw = (format: 'EAN13' | 'CODE128') => {
            while (el.firstChild) el.removeChild(el.firstChild);
            JsBarcode(el, value, { ...opts, format });
            fitBarcodeSvgToContainer(el);
        };

        try {
            draw(fmt);
        } catch {
            try {
                draw('CODE128');
            } catch {
                // Geçersiz barkod
            }
        }
    }, [value, widthPx, heightPx, svgId]);

    return (
        <svg
            id={svgId}
            ref={svgRef}
            className="block min-h-0 min-w-0"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={value}
        />
    );
}

function ReportBarcodePreview({ svgId, value }: { svgId: string; value: string }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 0, h: 0 });

    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const read = () => {
            const w = Math.max(1, Math.round(el.clientWidth));
            const h = Math.max(1, Math.round(el.clientHeight));
            setDims((d) => (d.w === w && d.h === h ? d : { w, h }));
        };
        read();
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={wrapRef} className="w-full h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden box-border">
            {dims.w > 0 && dims.h > 0 ? (
                <ReportBarcodeSvg svgId={svgId} value={value} widthPx={dims.w} heightPx={dims.h} />
            ) : null}
        </div>
    );
}

interface ReportViewerProps {
    template: ReportTemplate;
    data: any;
    onClose: () => void;
}

export function ReportViewerModule({ template, data, onClose }: ReportViewerProps) {
    const paperRef = useRef<HTMLDivElement>(null);
    const pw = template.pageSize?.width || DEFAULT_A4.width;
    const ph = template.pageSize?.height || DEFAULT_A4.height;

    const handleDownload = () => {
        if (paperRef.current) {
            exportToPDF(paperRef.current, `${template.name}.pdf`, { width: pw, height: ph });
        }
    };

    const handlePrint = () => {
        window.print();
    };

    /** Yalnızca etiket kağıdı + @page mm — arka plan uygulaması ikinci sayfa / A4 taşmasını engeller */
    const printCss = `
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    background: #fff !important;
  }
  body * {
    visibility: hidden !important;
  }
  .report-viewer-shell,
  .report-viewer-shell * {
    visibility: visible !important;
  }
  .report-viewer-chrome {
    display: none !important;
  }
  .report-viewer-shell {
    position: static !important;
    inset: auto !important;
    width: ${pw}mm !important;
    height: ${ph}mm !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: hidden !important;
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .report-viewer-stage {
    position: static !important;
    flex: none !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    width: ${pw}mm !important;
    height: ${ph}mm !important;
    min-height: 0 !important;
    display: block !important;
  }
  .report-viewer-paper {
    position: relative !important;
    left: 0 !important;
    top: 0 !important;
    margin: 0 !important;
    width: ${pw}mm !important;
    height: ${ph}mm !important;
    max-width: ${pw}mm !important;
    max-height: ${ph}mm !important;
    box-shadow: none !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
  @page {
    size: ${pw}mm ${ph}mm;
    margin: 0mm;
  }
}`;

    /** body’ye portal: üst layout overflow/stacking ve düşük z-index araç çubuğunu kesmesin; RetailExFlatModal ile aynı lig. */
    const overlayZ = 2147483646;

    const node = (
        <div
            className="report-viewer-shell fixed inset-0 flex flex-col w-full min-h-0 bg-gray-900/40 backdrop-blur-sm"
            style={{ zIndex: overlayZ, isolation: 'isolate' }}
        >
            <style>{printCss}</style>
            {/* Araç çubuğu — yazdırmada gizli */}
            <div className="report-viewer-chrome w-full h-14 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <h2 className="text-sm font-bold text-gray-900">{template.name}</h2>
                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Rapor Önizleme</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-all font-mono"
                    >
                        <Download className="w-4 h-4" />
                        PDF İNDİR
                    </button>
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all"
                    >
                        <Printer className="w-4 h-4" />
                        YAZDIR
                    </button>
                    <div className="w-px h-6 bg-gray-200 mx-2" />
                    <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Önizleme — yazdırmada yalnızca kağıt */}
            <div className="report-viewer-stage flex-1 w-full min-h-0 min-w-0 overflow-auto p-6 sm:p-12 print:p-0 flex justify-center print:justify-start">
                <div
                    ref={paperRef}
                    className="report-viewer-paper bg-white shadow-2xl relative flex-shrink-0 print:m-0 print:shadow-none box-border"
                    style={{
                        width: `${pw}mm`,
                        height: `${ph}mm`,
                    }}
                >
                    {template.components.map((comp) => (
                        <div
                            key={comp.id}
                            className="absolute overflow-hidden box-border"
                            style={{
                                left: `${comp.x}mm`,
                                top: `${comp.y}mm`,
                                width: `${comp.width}mm`,
                                height: `${comp.height}mm`,
                                ...comp.style,
                                background: comp.type === 'rect' ? (comp.style?.background || '#f3f4f6') : 'transparent',
                            }}
                        >
                            {comp.type === 'text' && (
                                <div className="w-full h-full p-0.5">
                                    {comp.binding ? getBoundValue(comp.binding, data) : comp.content}
                                </div>
                            )}
                            {comp.type === 'barcode' && (() => {
                                const raw = comp.binding ? getBoundValue(comp.binding, data) : comp.content;
                                const barcodeValue = String(raw ?? '').trim();
                                if (!barcodeValue) {
                                    return (
                                        <div className="w-full h-full bg-slate-50 flex items-center justify-center p-1 text-[8px] text-slate-400 text-center">
                                            Barkod alanı: veri veya içerik yok
                                        </div>
                                    );
                                }
                                return (
                                    <div className="w-full h-full min-h-0 min-w-0 bg-white flex items-center justify-center overflow-hidden box-border">
                                        <ReportBarcodePreview svgId={`report-barcode-${comp.id}`} value={barcodeValue} />
                                    </div>
                                );
                            })()}
                            {comp.type === 'table' && comp.columns && (
                                <div className="w-full h-full text-[10px]">
                                    <div className="flex bg-gray-100 border-b border-gray-800 font-bold" style={comp.style}>
                                        {comp.columns.map((col, i) => (
                                            <div key={i} style={{ width: `${col.width}%` }} className="p-1.5 border-r border-gray-300 last:border-0 truncate">
                                                {col.header}
                                            </div>
                                        ))}
                                    </div>
                                    {(data?.items || []).map((item: any, rowIndex: number) => (
                                        <div key={rowIndex} className="flex border-b border-gray-100 hover:bg-gray-50">
                                            {comp.columns?.map((col, colIndex) => {
                                                let val = item[col.field];
                                                if (typeof val === 'number') val = formatNumber(val, 2, true);
                                                return (
                                                    <div
                                                        key={colIndex}
                                                        style={{ width: `${col.width}%` }}
                                                        className={`p-1.5 border-r border-gray-100 last:border-0 truncate ${typeof item[col.field] === 'number' ? 'text-right' : ''}`}
                                                    >
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

    if (typeof document === 'undefined') {
        return null;
    }
    return createPortal(node, document.body);
}
