import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { buildJsBarcodeOptions, type BarcodeCaptionMode } from '../../services/labelPrintFieldSettingsService';

const H2C_TEMP_ID_PREFIX = 'retailex-h2c-';
const PX_PER_MM = 3.7795275591;

/**
 * html2canvas modern CSS Color 4 fonksiyonlarını (oklch, oklab, lab, lch, hwb,
 * color(), color-mix()) parse edemez. Tailwind 4 / shadcn varsayılan olarak
 * `oklch()` üretir ve `getComputedStyle()` modern Chromium'da bu değerleri
 * olduğu gibi geri döndürür — bu yüzden klona inline yazarken RGB'ye çevirmek
 * gerekir. Canvas `fillStyle` hack'i bu çevirimi tarayıcıya yaptırır.
 */

let _colorNormalizeCtx: CanvasRenderingContext2D | null | undefined;
function getColorNormalizeCtx(): CanvasRenderingContext2D | null {
    if (_colorNormalizeCtx !== undefined) return _colorNormalizeCtx;
    if (typeof document === 'undefined') {
        _colorNormalizeCtx = null;
        return null;
    }
    try {
        const c = document.createElement('canvas');
        _colorNormalizeCtx = c.getContext('2d');
    } catch {
        _colorNormalizeCtx = null;
    }
    return _colorNormalizeCtx;
}

/**
 * Tek bir renk ifadesini RGB(A) stringine çevirir; tarayıcı reddederse orijinali döner.
 * Geçerli mi diye anlamak için alışılmadık bir sentinel ile reset yapılır: atamadan
 * sonra değer hâlâ sentinele eşitse tarayıcı renkleri kabul etmemiş demektir.
 */
function rgbifyColor(value: string): string {
    const ctx = getColorNormalizeCtx();
    if (!ctx) return fallbackStripModernColors(value);
    try {
        ctx.fillStyle = '#feedba';
        const sentinel = String(ctx.fillStyle).toLowerCase();
        ctx.fillStyle = value;
        let out = String(ctx.fillStyle);
        if (!out || out.toLowerCase() === sentinel) return fallbackStripModernColors(value);
        /** Chromium bazen oklch’yi fillStyle’da kabul edip aynı oklch stringini döndürür — html2canvas parse edemez. */
        if (MODERN_COLOR_QUICK_RE.test(out)) return fallbackStripModernColors(value);
        return out;
    } catch {
        return fallbackStripModernColors(value);
    }
}

/** Parantez içi iç içe olabilen modern renk çağrılarını düz rgb ile değiştirir (son çare). */
function fallbackStripModernColors(value: string): string {
    if (!value || !MODERN_COLOR_QUICK_RE.test(value)) return value;
    let out = '';
    let i = 0;
    const s = value;
    while (i < s.length) {
        let matchedName: string | null = null;
        for (const name of MODERN_COLOR_FN_NAMES) {
            if (!s.startsWith(name, i)) continue;
            const prev = i === 0 ? '' : s[i - 1];
            if (prev && /[A-Za-z0-9_-]/.test(prev)) continue;
            let p = i + name.length;
            while (p < s.length && s[p] === ' ') p++;
            if (s[p] !== '(') continue;
            matchedName = name;
            break;
        }
        if (!matchedName) {
            out += s[i];
            i++;
            continue;
        }
        const start = i;
        i += matchedName.length;
        while (i < s.length && s[i] === ' ') i++;
        i++;
        let depth = 1;
        while (i < s.length && depth > 0) {
            const ch = s[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            i++;
        }
        out += 'rgb(55, 65, 81)';
    }
    return out;
}

/** Hızlı ön kontrol — değer içinde modern color fonksiyonu var mı? */
const MODERN_COLOR_QUICK_RE = /\b(?:oklch|oklab|lch|lab|hwb|color-mix|color)\s*\(/i;

const MODERN_COLOR_FN_NAMES = ['oklch', 'oklab', 'lab', 'lch', 'hwb', 'color-mix', 'color'];

/**
 * Bir CSS değer içindeki tüm modern renk fonksiyonu çağrılarını (iç içe
 * parantezler dâhil) RGB karşılıklarıyla değiştirir. `color()` ve `color-mix()`
 * iç içe parantez içerebileceği için basit regex yerine paranteze duyarlı
 * tarayıcı kullanılır.
 */
function replaceModernColorFns(value: string): string {
    if (!value || !MODERN_COLOR_QUICK_RE.test(value)) return value;
    let out = '';
    let i = 0;
    const s = value;
    while (i < s.length) {
        let matchedName: string | null = null;
        for (const name of MODERN_COLOR_FN_NAMES) {
            if (!s.startsWith(name, i)) continue;
            const prev = i === 0 ? '' : s[i - 1];
            if (prev && /[A-Za-z0-9_-]/.test(prev)) continue;
            let p = i + name.length;
            while (p < s.length && s[p] === ' ') p++;
            if (s[p] !== '(') continue;
            matchedName = name;
            break;
        }
        if (!matchedName) {
            out += s[i];
            i++;
            continue;
        }
        const start = i;
        i += matchedName.length;
        while (i < s.length && s[i] === ' ') i++;
        i++; /* '(' atla */
        let depth = 1;
        while (i < s.length && depth > 0) {
            const ch = s[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            i++;
        }
        const fullMatch = s.slice(start, i);
        out += rgbifyColor(fullMatch);
    }
    return out;
}

function normalizeCssValue(value: string): string {
    if (!value || typeof value !== 'string') return value;
    if (!MODERN_COLOR_QUICK_RE.test(value)) return value;
    return replaceModernColorFns(value);
}

function stripExternalStylesFromClone(clonedDoc: Document) {
    clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((n) => n.remove());
    clonedDoc.querySelectorAll('style').forEach((n) => n.remove());
}

function inlineSubtreeComputedStyles(origRoot: HTMLElement, cloneRoot: HTMLElement) {
    const origFlat = [origRoot, ...origRoot.querySelectorAll<HTMLElement>('*')];
    const cloneFlat = [cloneRoot, ...cloneRoot.querySelectorAll<HTMLElement>('*')];
    const n = Math.min(origFlat.length, cloneFlat.length);
    for (let i = 0; i < n; i++) {
        const o = origFlat[i];
        const c = cloneFlat[i];
        if (o.tagName === 'CANVAS' || c.tagName === 'CANVAS') continue;
        const computed = window.getComputedStyle(o);
        for (let j = 0; j < computed.length; j++) {
            const name = computed[j];
            try {
                const rawValue = computed.getPropertyValue(name);
                if (!rawValue) continue;
                const value = normalizeCssValue(rawValue);
                if (computed.getPropertyPriority(name) === 'important') {
                    c.style.setProperty(name, value, 'important');
                } else {
                    c.style.setProperty(name, value);
                }
            } catch {
                /* bazı salt-okunur / motor özellikleri atlanır */
            }
        }
    }
}

/**
 * copyCSSStyles’ın bıraktığı oklch vb. yalnızca `style` üzerindeki açık özelliklerde aranır;
 * iframe’de tüm getComputedStyle listesini taramaktan çok daha hızlıdır.
 */
function scrubInlineModernColorsSubtree(cloneRoot: HTMLElement) {
    const visit = (el: HTMLElement) => {
        if (el.tagName === 'CANVAS') return;
        const st = el.style;
        if (!st?.length) return;
        for (let k = 0; k < st.length; k++) {
            const name = st[k];
            try {
                const raw = st.getPropertyValue(name);
                if (!raw || !MODERN_COLOR_QUICK_RE.test(raw)) continue;
                const val = normalizeCssValue(raw);
                if (st.getPropertyPriority(name) === 'important') {
                    el.style.setProperty(name, val, 'important');
                } else {
                    el.style.setProperty(name, val);
                }
            } catch {
                /* ignore */
            }
        }
    };
    let p: HTMLElement | null = cloneRoot;
    while (p) {
        visit(p);
        p = p.parentElement;
    }
    cloneRoot.querySelectorAll<HTMLElement>('*').forEach((el) => visit(el));
}

function withPdfCaptureRoot<T>(element: HTMLElement, fn: (tempId: string) => Promise<T>): Promise<T> {
    const tempId = `${H2C_TEMP_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const prevId = element.id;
    element.id = tempId;
    return fn(tempId).finally(() => {
        element.id = prevId;
    });
}

function resolveLabelSizeMmFromCanvas(canvas: HTMLCanvasElement): { width: number; height: number } {
    const widthAttr = Number(canvas.dataset.labelWidthMm);
    const heightAttr = Number(canvas.dataset.labelHeightMm);
    if (Number.isFinite(widthAttr) && widthAttr > 0 && Number.isFinite(heightAttr) && heightAttr > 0) {
        return { width: widthAttr, height: heightAttr };
    }
    const rect = canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width / PX_PER_MM : 60;
    const height = rect.height > 0 ? rect.height / PX_PER_MM : 40;
    return { width: Math.max(20, width), height: Math.max(10, height) };
}

function normalizeCaptionMode(raw: string | undefined): BarcodeCaptionMode {
    if (raw === 'barcode' || raw === 'variantCode' || raw === 'both' || raw === 'none') return raw;
    return 'barcode';
}

function applyCanvasStyleToReplacement(replacement: HTMLElement | SVGElement, source: HTMLElement) {
    const className = source.getAttribute('class');
    if (className) replacement.setAttribute('class', className);
    const inlineStyle = source.getAttribute('style');
    if (inlineStyle) replacement.setAttribute('style', inlineStyle);
    replacement.style.display = 'block';
    replacement.style.maxWidth = '100%';
    replacement.style.maxHeight = '100%';
}

function buildBarcodeSvgFromCanvas(canvas: HTMLCanvasElement): SVGSVGElement | null {
    const barcodeValue = (canvas.dataset.barcodeValue || '').trim();
    if (!barcodeValue) return null;
    try {
        const sizeMm = resolveLabelSizeMmFromCanvas(canvas);
        const variantCode = canvas.dataset.variantCode || '';
        const captionMode = normalizeCaptionMode(canvas.dataset.barcodeCaptionMode);
        const opts = buildJsBarcodeOptions(barcodeValue, variantCode, captionMode, sizeMm);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, barcodeValue, opts as Parameters<typeof JsBarcode>[2]);
        return svg;
    } catch {
        return null;
    }
}

async function buildQrSvgFromCanvas(canvas: HTMLCanvasElement): Promise<SVGElement | null> {
    const qrValue = (canvas.dataset.qrValue || '').trim();
    if (!qrValue) return null;
    try {
        const margin = Number(canvas.dataset.qrMargin || 1);
        const svgMarkup = await QRCode.toString(qrValue, {
            type: 'svg',
            margin: Number.isFinite(margin) && margin >= 0 ? margin : 1,
            errorCorrectionLevel: 'M',
        });
        const holder = document.createElement('div');
        holder.innerHTML = svgMarkup.trim();
        return holder.querySelector('svg');
    } catch {
        return null;
    }
}

const HTML2CANVAS_PDF_BASE = {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    scrollX: 0,
    scrollY: 0,
} as const;

function resolvePdfScale(pageSizeMm: { width: number; height: number }, requestedScale?: number): number {
    if (typeof requestedScale === 'number' && Number.isFinite(requestedScale) && requestedScale > 0) {
        return Math.max(1, Math.min(6, requestedScale));
    }
    const minEdge = Math.max(1, Math.min(pageSizeMm.width, pageSizeMm.height));
    if (minEdge <= 25) return 5;
    if (minEdge <= 40) return 4.5;
    if (minEdge <= 70) return 4;
    return 3;
}

/** Toplu termal PDF: her etiket hücresi yüksek çözünürlükte ayrı yakalanır. */
export async function exportLabelGridToPdfPages(
    _gridContainer: HTMLElement,
    cells: HTMLElement[],
    fileName: string,
    pageSizeMm: { width: number; height: number },
    opts?: { scale?: number }
): Promise<void> {
    if (!cells.length) return;
    const scale = resolvePdfScale(pageSizeMm, opts?.scale);
    const pw = Math.max(1, pageSizeMm.width);
    const ph = Math.max(1, pageSizeMm.height);
    const orientation = ph >= pw ? 'p' : 'l';
    const pdf = new jsPDF(orientation, 'mm', [pw, ph]);
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < cells.length; i++) {
        if (i > 0) {
            pdf.addPage([pw, ph]);
        }
        const cell = cells[i];
        const canvas = await withPdfCaptureRoot(cell, (tempId) =>
            html2canvas(cell, {
                ...HTML2CANVAS_PDF_BASE,
                scale,
                onclone: onCloneStripOklchAndInline(cell, tempId),
            })
        );
        const cw = Math.max(1, canvas.width);
        const ch = Math.max(1, canvas.height);
        const sliceAr = cw / ch;
        const pageAr = pageW / pageH;
        let imgW = pageW;
        let imgH = pageH;
        let imgX = 0;
        let imgY = 0;
        if (sliceAr > pageAr) {
            imgW = pageW;
            imgH = pageW / sliceAr;
            imgY = (pageH - imgH) / 2;
        } else if (sliceAr < pageAr) {
            imgH = pageH;
            imgW = pageH * sliceAr;
            imgX = (pageW - imgW) / 2;
        }
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', imgX, imgY, imgW, imgH);
    }
    pdf.save(fileName);
}

/**
 * Termal toplu yazdırma için etiket DOM'unu yeni pencerede sayfa sayfa basar.
 * Barkod/QR canvas öğelerini SVG'ye çevirip vektörel çıktı üretir.
 */
export async function printLabelElementsInBrowser(
    elements: HTMLElement[],
    pageSizeMm: { width: number; height: number },
    _opts?: { scale?: number }
): Promise<void> {
    if (!elements.length) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const pw = Math.max(1, pageSizeMm.width);
    const ph = Math.max(1, pageSizeMm.height);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        throw new Error('Yazdırma penceresi açılamadı. Tarayıcı popup engelini kontrol edin.');
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Asin Label Print</title>
    <style>
      @page {
        size: ${pw}mm ${ph}mm;
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
      }
      .print-page {
        width: ${pw}mm;
        height: ${ph}mm;
        page-break-after: always;
        break-after: page;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .print-page.last {
        page-break-after: auto;
        break-after: auto;
      }
      .print-slot {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .print-slot img,
      .print-slot svg {
        image-rendering: -webkit-optimize-contrast;
        image-rendering: crisp-edges;
      }
    </style>
  </head>
  <body>
    <div id="print-root"></div>
  </body>
</html>`);
    printWindow.document.close();

    const buildPrintableClone = async (source: HTMLElement): Promise<HTMLElement> => {
        const clone = source.cloneNode(true) as HTMLElement;
        inlineSubtreeComputedStyles(source, clone);
        scrubInlineModernColorsSubtree(clone);

        const sourceCanvases = Array.from(source.querySelectorAll('canvas'));
        const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
        const n = Math.min(sourceCanvases.length, cloneCanvases.length);
        for (let i = 0; i < n; i++) {
            const srcCanvas = sourceCanvases[i];
            const dstCanvas = cloneCanvases[i];
            const barcodeSvg = buildBarcodeSvgFromCanvas(srcCanvas);
            if (barcodeSvg) {
                applyCanvasStyleToReplacement(barcodeSvg, dstCanvas);
                dstCanvas.replaceWith(barcodeSvg);
                continue;
            }
            const qrSvg = await buildQrSvgFromCanvas(srcCanvas);
            if (qrSvg) {
                applyCanvasStyleToReplacement(qrSvg, dstCanvas);
                dstCanvas.replaceWith(qrSvg);
                continue;
            }
            const img = document.createElement('img');
            try {
                img.src = srcCanvas.toDataURL('image/png');
            } catch {
                continue;
            }
            img.className = dstCanvas.className;
            const inlineStyle = dstCanvas.getAttribute('style');
            if (inlineStyle) img.setAttribute('style', inlineStyle);
            img.style.display = 'block';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            dstCanvas.replaceWith(img);
        }

        const sourceSvgs = Array.from(source.querySelectorAll('svg'));
        const cloneSvgs = Array.from(clone.querySelectorAll('svg'));
        const svgN = Math.min(sourceSvgs.length, cloneSvgs.length);
        for (let i = 0; i < svgN; i++) {
            const srcSvg = sourceSvgs[i];
            const dstSvg = cloneSvgs[i];
            if (srcSvg.childNodes.length === 0) continue;
            dstSvg.innerHTML = srcSvg.innerHTML;
            for (const attr of ['viewBox', 'preserveAspectRatio', 'class', 'style', 'id']) {
                const v = srcSvg.getAttribute(attr);
                if (v != null) dstSvg.setAttribute(attr, v);
            }
        }
        return clone;
    };

    const root = printWindow.document.getElementById('print-root');
    if (!root) throw new Error('Yazdırma içeriği oluşturulamadı.');

    for (let idx = 0; idx < elements.length; idx++) {
        const el = elements[idx];
        const page = printWindow.document.createElement('div');
        page.className = `print-page${idx === elements.length - 1 ? ' last' : ''}`;
        const slot = printWindow.document.createElement('div');
        slot.className = 'print-slot';
        const clone = await buildPrintableClone(el);
        slot.appendChild(printWindow.document.importNode(clone, true));
        page.appendChild(slot);
        root.appendChild(page);
    }

    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const waitForImages = async () => {
        const images = Array.from(printWindow.document.images);
        if (!images.length) return;
        await Promise.race([
            Promise.all(
                images.map(
                    (img) =>
                        new Promise<void>((resolve) => {
                            if (img.complete) {
                                resolve();
                                return;
                            }
                            img.addEventListener('load', () => resolve(), { once: true });
                            img.addEventListener('error', () => resolve(), { once: true });
                        })
                )
            ),
            new Promise<void>((resolve) => setTimeout(resolve, 1200)),
        ]);
    };

    await waitForImages();
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    printWindow.onafterprint = () => {
        try {
            printWindow.close();
        } catch {
            /* ignore */
        }
    };
    printWindow.focus();
    printWindow.print();
}

function onCloneStripOklchAndInline(orig: HTMLElement, tempId: string) {
    return (clonedDoc: Document) => {
        stripExternalStylesFromClone(clonedDoc);
        const cloneRoot = clonedDoc.getElementById(tempId);
        if (cloneRoot instanceof HTMLElement) {
            inlineSubtreeComputedStyles(orig, cloneRoot);
            scrubInlineModernColorsSubtree(cloneRoot);
        }
    };
}

export interface ReportComponent {
    id: string;
    type: 'text' | 'image' | 'table' | 'barcode' | 'line' | 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    content?: string;
    style?: Record<string, any>;
    binding?: string; // Data field name
    columns?: { header: string; field: string; width: number }[]; // For tables
}

export interface DataField {
    name: string;
    key: string;
    type: 'string' | 'number' | 'date' | 'array' | 'object';
    children?: DataField[];
}

export interface ReportTemplate {
    name: string;
    category: string;
    pageSize: { width: number; height: number }; // In mm
    components: ReportComponent[];
}

export const SNAP_GRID = 2; // 2mm snapping

export const snapToGrid = (val: number) => {
    return Math.round(val / SNAP_GRID) * SNAP_GRID;
};

export const mmToPx = (mm: number) => mm * 3.7795275591;
export const pxToMm = (px: number) => px / 3.7795275591;

/**
 * HTML öğesini PDF yapar. `pageSizeMm` verilirse sayfa boyutu şablonla birebir mm olur (yazdırma ile aynı mantık).
 */
export async function exportToPDF(
    element: HTMLElement,
    fileName: string = 'report.pdf',
    pageSizeMm: { width: number; height: number } = DEFAULT_A4,
    opts?: { scale?: number }
) {
    const pw = Math.max(1, pageSizeMm.width);
    const ph = Math.max(1, pageSizeMm.height);

    const canvas = await withPdfCaptureRoot(element, (tempId) =>
        html2canvas(element, {
            ...HTML2CANVAS_PDF_BASE,
            scale: resolvePdfScale(pageSizeMm, opts?.scale),
            onclone: onCloneStripOklchAndInline(element, tempId),
        })
    );

    const imgData = canvas.toDataURL('image/png');
    const orientation = ph >= pw ? 'p' : 'l';
    const pdf = new jsPDF(orientation, 'mm', [pw, ph]);
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH);
    pdf.save(fileName);
}

/**
 * Her HTML öğesi ayrı bir PDF sayfası (aynı mm boyut). Termal etiket kuyruğu gibi çoklu hücreler için.
 */
export async function exportElementsToPdfPages(
    elements: HTMLElement[],
    fileName: string = 'labels.pdf',
    pageSizeMm: { width: number; height: number } = DEFAULT_A4
): Promise<void> {
    if (!elements.length) return;
    const pw = Math.max(1, pageSizeMm.width);
    const ph = Math.max(1, pageSizeMm.height);
    const orientation = ph >= pw ? 'p' : 'l';
    const pdf = new jsPDF(orientation, 'mm', [pw, ph]);

    for (let i = 0; i < elements.length; i++) {
        if (i > 0) {
            pdf.addPage([pw, ph]);
        }
        const el = elements[i];
        const canvas = await withPdfCaptureRoot(el, (tempId) =>
            html2canvas(el, {
                ...HTML2CANVAS_PDF_BASE,
                onclone: onCloneStripOklchAndInline(el, tempId),
            })
        );
        const imgData = canvas.toDataURL('image/png');
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH);
    }
    pdf.save(fileName);
}

export const DEFAULT_A4 = {
    width: 210,
    height: 297
};

export const getBoundValue = (field: string, data: any) => {
    if (!field || !data) return '';
    const parts = field.split('.');
    let val = data;
    for (const part of parts) {
        val = val?.[part];
    }
    return val || '';
};


