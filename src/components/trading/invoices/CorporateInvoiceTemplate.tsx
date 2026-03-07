import React from 'react';
import { formatNumber } from '../../../utils/formatNumber';
import type { Invoice } from '../../../core/types';

export interface PrintConfig {
    showLogo: boolean;
    logoUrl?: string;
    showQRCode: boolean;
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyTaxNo: string;
    footerText?: string;
}

interface CorporateInvoiceTemplateProps {
    invoice: Invoice;
    config: PrintConfig;
    typeLabel?: string; // E.g. "SATIŞ FATURASI", "İRSALİYE"
}

export const CorporateInvoiceTemplate: React.FC<CorporateInvoiceTemplateProps> = ({ invoice, config, typeLabel }) => {
    const invoiceDate = new Date(invoice.invoice_date || '').toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    const invoiceTime = new Date(invoice.invoice_date || '').toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Calculate totals
    const subtotal = invoice.subtotal || 0;
    const discount = invoice.discount || 0;
    const tax = invoice.tax || 0;
    const total = invoice.total || invoice.total_amount || 0;

    return (
        <div className="corporate-invoice-container bg-white text-gray-800 font-sans p-8 max-w-[210mm] mx-auto relative h-full">
            {/* Background Pattern / Watermark (Optional) */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -z-10 opacity-50 transform translate-x-1/3 -translate-y-1/3"></div>

            {/* Header Section */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
                {/* Company Info */}
                <div className="flex flex-col gap-2">
                    {config.showLogo && config.logoUrl ? (
                        <img src={config.logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-2" />
                    ) : (
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{config.companyName}</h1>
                    )}
                    <div className="text-sm text-slate-600 max-w-xs leading-relaxed">
                        <p>{config.companyAddress}</p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="font-semibold text-slate-700">Tel:</span> {config.companyPhone}
                        </div>
                        {config.companyTaxNo && (
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">Vergi No:</span> {config.companyTaxNo}
                            </div>
                        )}
                    </div>
                </div>

                {/* Invoice Title & Meta */}
                <div className="text-right">
                    <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight uppercase mb-1">{typeLabel || 'FATURA'}</h2>
                    <p className="text-slate-400 text-sm font-medium tracking-wide mb-6">BELGE</p>

                    <div className="flex flex-col gap-1 items-end">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-500 uppercase">Fatura No</span>
                            <span className="text-lg font-bold text-slate-900">{invoice.invoice_no}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-500 uppercase">Tarih</span>
                            <span className="text-base font-medium text-slate-900">{invoiceDate} <span className="text-xs text-slate-400 ml-1">{invoiceTime}</span></span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-12 mb-8">
                {/* Customer Section */}
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Müşteri / Sayın</h3>
                    <div className="text-base font-semibold text-slate-800 mb-1">
                        {invoice.customer_name || 'Müşterisiz İşlem'}
                    </div>
                    {/* If we had customer address/details in invoice object, we would map them here */}
                    {/* <p className="text-sm text-slate-600">...</p> */}
                </div>

                {/* Details Section */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Ödeme Yöntemi</h3>
                        <p className="text-sm font-medium text-slate-800">{invoice.payment_method || 'Nakit / Diğer'}</p>
                    </div>
                    {invoice.cashier && (
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Kasiyer / Plasiyer</h3>
                            <p className="text-sm font-medium text-slate-800">{invoice.cashier}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Items Table */}
            <div className="mb-8">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-800 text-slate-800 text-xs uppercase tracking-wider">
                            <th className="py-3 pr-4 font-bold">Ürün / Hizmet</th>
                            <th className="py-3 px-4 text-right font-bold w-24">Miktar</th>
                            <th className="py-3 px-4 text-right font-bold w-32">Birim Fiyat</th>
                            <th className="py-3 px-4 text-right font-bold w-24">İndirim</th>
                            <th className="py-3 pl-4 text-right font-bold w-32">Tutar</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {invoice.items && invoice.items.length > 0 ? (
                            invoice.items.map((item: any, index: number) => (
                                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="py-3 pr-4">
                                        <span className="font-semibold text-slate-700 block">{item.productName || item.description || '-'}</span>
                                        {item.code && <span className="text-xs text-slate-400 font-mono">{item.code}</span>}
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-600">
                                        {item.quantity}
                                        <span className="ml-1 text-xs text-slate-400">{item.unit || ''}</span>
                                    </td>
                                    <td className="py-3 px-4 text-right font-medium text-slate-700 tabular-nums">
                                        {formatNumber(item.price || item.unitPrice || 0, 2, true)}
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-500 tabular-nums">
                                        {item.discount > 0 ? (
                                            <span className="text-red-500 font-medium">% {item.discount}</span>
                                        ) : (
                                            '-'
                                        )}
                                    </td>
                                    <td className="py-3 pl-4 text-right font-bold text-slate-800 tabular-nums">
                                        {formatNumber(item.total || item.netAmount || 0, 2, true)}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                                    Bu faturada kalem bulunmamaktadır.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer / Totals */}
            <div className="flex justify-end mb-12">
                <div className="w-1/2 bg-slate-50 rounded-lg p-6 border border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-slate-500 font-medium text-sm">Ara Toplam</span>
                        <span className="text-slate-800 font-bold text-base tabular-nums">{formatNumber(subtotal, 2, true)} IQD</span>
                    </div>
                    {discount > 0 && (
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-red-500 font-medium text-sm">İndirim</span>
                            <span className="text-red-600 font-bold text-base tabular-nums">-{formatNumber(discount, 2, true)} IQD</span>
                        </div>
                    )}
                    {tax > 0 && (
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-slate-500 font-medium text-sm">Vergi / KDV</span>
                            <span className="text-slate-800 font-bold text-base tabular-nums">{formatNumber(tax, 2, true)} IQD</span>
                        </div>
                    )}

                    <div className="h-px bg-slate-300 my-4"></div>

                    <div className="flex justify-between items-center">
                        <span className="text-slate-900 font-bold text-lg">TOPLAM Tutar</span>
                        <span className="text-blue-700 font-extrabold text-2xl tabular-nums tracking-tight">{formatNumber(total, 2, true)} IQD</span>
                    </div>
                </div>
            </div>

            {/* Signature & QR */}
            <div className="grid grid-cols-2 gap-8 mt-auto pt-8 border-t border-slate-200">
                <div>
                    {config.showQRCode && (
                        <div className="flex items-center gap-4">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(invoice.invoice_no)}`}
                                alt="QR"
                                className="w-20 h-20 opacity-80"
                            />
                            <div className="text-xs text-slate-400">
                                <p className="mb-1">Bu belge elektronik olarak üretilmiştir.</p>
                                <p className="font-mono">{invoice.id?.substring(0, 8) || ''}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-between gap-4">
                    <div className="text-center pt-8 border-t border-dashed border-slate-300 w-32">
                        <p className="text-xs font-bold text-slate-400 uppercase">Teslim Alan</p>
                    </div>
                    <div className="text-center pt-8 border-t border-dashed border-slate-300 w-32">
                        <p className="text-xs font-bold text-slate-400 uppercase">Teslim Eden</p>
                    </div>
                </div>
            </div>

            {/* Disclaimer / Footer Text */}
            <div className="mt-8 text-center">
                <p className="text-xs text-slate-400">{config.footerText || 'İşbirliğiniz için teşekkür ederiz.'}</p>
                <p className="text-[10px] text-slate-300 mt-1">Generated by RetailEX Platform</p>
            </div>

            {/* Print Styles Injection */}
            <style>{`
        @media print {
            body { 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
            }
            .corporate-invoice-container {
                box-shadow: none !important;
                margin: 0 !important;
                max-width: none !important;
                width: 100% !important;
                padding: 0 !important;
            }
            @page {
                size: A4;
                margin: 1cm;
            }
        }
      `}</style>
        </div>
    );
};


