import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { DEFAULT_A4, ReportTemplate, getBoundValue, exportToPDF } from './designerUtils';
import { Download, Printer, X, RotateCw } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { useLanguage } from '../../contexts/LanguageContext';
import { interpolateTemplateText } from '../../services/templateRenderService';

type EtiketPrintRotation = 0 | 90 | 180 | 270;

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

function clampPageMm(n: unknown, fallback: number): number {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return fallback;
    return Math.min(1200, Math.max(8, x));
}

export function ReportViewerModule({ template, data, onClose }: ReportViewerProps) {
    const { tm } = useLanguage();
    const paperRef = useRef<HTMLDivElement>(null);
    const pw = template.pageSize?.width || DEFAULT_A4.width;
    const ph = template.pageSize?.height || DEFAULT_A4.height;
    /** @page ve baskı için güvenli mm — geçersiz / çok küçük değerler önizlemeyi kilitleyebilir */
    const pwPrint = clampPageMm(pw, DEFAULT_A4.width);
    const phPrint = clampPageMm(ph, DEFAULT_A4.height);

    const isLabelTemplate = template.category === 'etiket';
    const [printRotation, setPrintRotation] = useState<EtiketPrintRotation>(() => {
        if (typeof window === 'undefined' || template.category !== 'etiket') return 0;
        const saved = Number(localStorage.getItem('retailex-label-print-rotation'));
        return ([0, 90, 180, 270] as EtiketPrintRotation[]).includes(saved as EtiketPrintRotation)
            ? (saved as EtiketPrintRotation)
            : 0;
    });

    useEffect(() => {
        if (!isLabelTemplate) return;
        try {
            localStorage.setItem('retailex-label-print-rotation', String(printRotation));
        } catch {
            /* ignore */
        }
    }, [isLabelTemplate, printRotation]);

    const effectiveRotation = isLabelTemplate ? printRotation : 0;
    const isSideways = effectiveRotation === 90 || effectiveRotation === 270;
    const pageWPrint = isSideways ? phPrint : pwPrint;
    const pageHPrint = isSideways ? pwPrint : phPrint;

    const handleDownload = () => {
        if (paperRef.current) {
            exportToPDF(paperRef.current, `${template.name}.pdf`, { width: pageWPrint, height: pageHPrint });
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const rotationOptions: { value: EtiketPrintRotation; label: string; hint: string }[] = [
        { value: 0, label: '0°', hint: tm('rotationNormal') },
        { value: 90, label: '90°', hint: tm('rotationRight') },
        { value: 180, label: '180°', hint: tm('rotationFlip') },
        { value: 270, label: '270°', hint: tm('rotationLeft') },
    ];

    const paperLayers = template.components.map((comp) => (
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
                    {(() => {
                        const raw = comp.binding ? getBoundValue(comp.binding, data) : comp.content;
                        return interpolateTemplateText(String(raw ?? ''), data || {});
                    })()}
                </div>
            )}
            {comp.type === 'line' && (
                <div className="w-full h-full">
                    <div style={{ borderTop: comp.style?.borderTop || '1px solid #111827', width: '100%', height: '0px' }} />
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
    ));

    const paperInner = <div className="relative box-border" style={{ width: `${pwPrint}mm`, height: `${phPrint}mm` }}>{paperLayers}</div>;

    const paperBlock =
        effectiveRotation === 0 ? (
            <div
                ref={paperRef}
                className="report-viewer-paper bg-white shadow-2xl relative flex-shrink-0 print:m-0 print:shadow-none box-border"
                style={{
                    width: `${pwPrint}mm`,
                    height: `${phPrint}mm`,
                }}
            >
                {paperInner}
            </div>
        ) : (
            <div
                ref={paperRef}
                className="report-viewer-paper bg-white shadow-2xl relative flex-shrink-0 print:m-0 print:shadow-none box-border"
                style={{
                    width: `${pageWPrint}mm`,
                    height: `${pageHPrint}mm`,
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: `translate(-50%, -50%) rotate(${effectiveRotation}deg)`,
                        transformOrigin: 'center center',
                    }}
                >
                    {paperInner}
                </div>
            </div>
        );

    /**
     * Tüm body kardeşlerini display:none yapmak bazı Chromium sürümlerinde yazdır önizlemesini
     * “Önizleme yükleniyor”da bırakır. #root ve diğer portal kardeşleri yükseklik 0 + gizle ile akıştan düşürülür.
     */
    /** Termal etikette: tam sayfa mm + sol üst sabit; aksi halde tarayıcı/sürücü içeriği ortalayıp sağa kaydırabiliyor. */
    const labelHtmlBody =
        isLabelTemplate &&
        `width: ${pageWPrint}mm !important;
    height: ${pageHPrint}mm !important;
    max-width: ${pageWPrint}mm !important;
    max-height: ${pageHPrint}mm !important;
    overflow: hidden !important;`;

    const printCss = `
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    ${labelHtmlBody || `width: 100% !important;
    height: auto !important;`}
    min-height: 0 !important;
    background: #fff !important;
  }
  body > *:not(.report-viewer-shell) {
    visibility: hidden !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 0 !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
    border: none !important;
  }
  .report-viewer-chrome {
    display: none !important;
  }
  .report-viewer-shell {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: auto !important;
    bottom: auto !important;
    inset: auto !important;
    width: ${pageWPrint}mm !important;
    height: ${pageHPrint}mm !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    max-width: ${pageWPrint}mm !important;
    max-height: ${pageHPrint}mm !important;
    overflow: hidden !important;
    background: #fff !important;
    backdrop-filter: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    visibility: visible !important;
  }
  .report-viewer-shell * {
    visibility: visible !important;
  }
  .report-viewer-stage {
    position: static !important;
    flex: none !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden !important;
    width: ${pageWPrint}mm !important;
    height: ${pageHPrint}mm !important;
    min-height: 0 !important;
    max-width: ${pageWPrint}mm !important;
    max-height: ${pageHPrint}mm !important;
    display: block !important;
    box-sizing: border-box !important;
  }
  .report-viewer-paper {
    position: relative !important;
    left: 0 !important;
    top: 0 !important;
    margin: 0 !important;
    width: ${pageWPrint}mm !important;
    height: ${pageHPrint}mm !important;
    max-width: ${pageWPrint}mm !important;
    max-height: ${pageHPrint}mm !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
  @page {
    size: ${pageWPrint}mm ${pageHPrint}mm;
    margin: 0 !important;
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
            <div className="report-viewer-chrome shrink-0 bg-white border-b border-gray-200 shadow-sm">
                <div className="w-full min-h-14 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-sm font-bold text-gray-900 truncate">{template.name}</h2>
                            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Rapor Önizleme</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                {isLabelTemplate && (
                    <div className="px-4 sm:px-6 pb-3 pt-1 border-t border-gray-100 bg-slate-50/70">
                        <div className="flex items-center gap-2 mb-2">
                            <RotateCw className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden />
                            <span className="text-[11px] font-bold text-gray-700">{tm('printRotation')}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 max-w-md">
                            {rotationOptions.map((opt) => {
                                const active = printRotation === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setPrintRotation(opt.value)}
                                        title={`${opt.label} — ${opt.hint}`}
                                        className={`flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 border-2 rounded-lg transition-all ${
                                            active
                                                ? 'border-blue-600 bg-blue-50 text-blue-800'
                                                : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                                        }`}
                                    >
                                        <span
                                            className="text-[13px] font-bold leading-none"
                                            style={{
                                                transform: `rotate(${opt.value}deg)`,
                                                transformOrigin: 'center center',
                                            }}
                                            aria-hidden
                                        >
                                            A
                                        </span>
                                        <span className="text-[9px] font-semibold">{opt.label}</span>
                                        <span className="text-[8px] text-gray-500 leading-tight text-center line-clamp-2">{opt.hint}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {isSideways && (
                            <p className="mt-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 leading-snug">
                                {tm('rotationPaperHint')}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Önizleme — yazdırmada yalnızca kağıt */}
            <div className="report-viewer-stage flex-1 w-full min-h-0 min-w-0 overflow-auto p-6 sm:p-12 print:p-0 flex justify-center print:justify-start">
                {paperBlock}
            </div>
        </div>
    );

    if (typeof document === 'undefined') {
        return null;
    }
    return createPortal(node, document.body);
}
