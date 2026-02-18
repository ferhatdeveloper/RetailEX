import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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

export async function exportToPDF(element: HTMLElement, fileName: string = 'report.pdf') {
    const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
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
