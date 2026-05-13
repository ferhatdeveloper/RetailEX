import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const H2C_TEMP_ID_PREFIX = 'retailex-h2c-';

/** html2canvas oklch() / modern CSS parse edemiyor; klon üzerinde harici CSS kaldırılıp hesaplanmış stiller inline yapılır. */
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
                const value = computed.getPropertyValue(name);
                if (value) {
                    if (computed.getPropertyPriority(name) === 'important') {
                        c.style.setProperty(name, value, 'important');
                    } else {
                        c.style.setProperty(name, value);
                    }
                }
            } catch {
                /* bazı salt-okunur / motor özellikleri atlanır */
            }
        }
    }
}

function withPdfCaptureRoot<T>(element: HTMLElement, fn: (tempId: string) => Promise<T>): Promise<T> {
    const tempId = `${H2C_TEMP_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const prevId = element.id;
    element.id = tempId;
    return fn(tempId).finally(() => {
        element.id = prevId;
    });
}

const HTML2CANVAS_PDF_BASE = {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    scrollX: 0,
    scrollY: 0,
} as const;

function onCloneStripOklchAndInline(orig: HTMLElement, tempId: string) {
    return (clonedDoc: Document) => {
        stripExternalStylesFromClone(clonedDoc);
        const cloneRoot = clonedDoc.getElementById(tempId);
        if (cloneRoot instanceof HTMLElement) {
            inlineSubtreeComputedStyles(orig, cloneRoot);
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
    pageSizeMm: { width: number; height: number } = DEFAULT_A4
) {
    const pw = Math.max(1, pageSizeMm.width);
    const ph = Math.max(1, pageSizeMm.height);

    const canvas = await withPdfCaptureRoot(element, (tempId) =>
        html2canvas(element, {
            ...HTML2CANVAS_PDF_BASE,
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


