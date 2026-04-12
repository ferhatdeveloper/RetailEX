import React from 'react';
import { FileText, Printer, X, Clock, Banknote, CreditCard } from 'lucide-react';
import { cn } from '../../ui/utils';
import { formatCurrency } from '../../../utils/currency';

interface ZReportData {
    date: string;
    openedAt: string;
    closedAt: string;
    staffName: string;
    openingCash: number;
    salesByCategory: { category: string; amount: number; count: number }[];
    paymentsByType: { type: string; amount: number; count: number }[];
    voids: { reason: string; amount: number; count: number }[];
    complements: { amount: number; count: number };
    returns?: { amount: number; count: number };
    totalSales: number;
    netCash: number;
    /** Mali gün içinde satılan ürün kalemleri (adet + tutar) */
    salesByProduct?: { productName: string; quantity: number; amount: number }[];
}

interface RestaurantZReportProps {
    data: ZReportData;
    onClose: () => void;
    onPrint?: () => void;
}

/** 80mm fiş için satır formatı (yaklaşık 32 karakter genişlik) */
function padLine(left: string, right: string, width = 32): string {
    const n = width - left.length - right.length;
    return n > 0 ? left + ' '.repeat(n) + right : left.slice(0, width - right.length) + right;
}

export const RestaurantZReport: React.FC<RestaurantZReportProps> = ({ data, onClose, onPrint }) => {
    const fmt = (num: number) => formatCurrency(num, 0, false);

    /** 80mm termal fiş içeriği — yazdırma penceresine gönderilecek HTML */
    const getReceipt80mmHtml = () => {
        const d = data;
        const lines: string[] = [];
        lines.push('');
        lines.push('      RETAILEX - Z RAPORU');
        lines.push('  ' + new Date(d.date).toLocaleDateString('tr-TR'));
        lines.push('--------------------------------');
        lines.push(padLine('Acilis', new Date(d.openedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })));
        lines.push(padLine('Kapanis', new Date(d.closedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })));
        lines.push(padLine('Sorumlu', d.staffName));
        lines.push('--------------------------------');
        lines.push(padLine('TOPLAM SATIS', fmt(d.totalSales)));
        lines.push(padLine('IADE', fmt(d.returns?.amount || 0)));
        lines.push(padLine('IKRAM', fmt(d.complements?.amount || 0)));
        lines.push(padLine('NET NAKIT', fmt(d.netCash)));
        lines.push('--------------------------------');
        lines.push('  SATILAN URUNLER');
        const byProd = d.salesByProduct || [];
        if (byProd.length === 0) {
            lines.push('  (kalem yok)');
        } else {
            byProd.forEach((row) => {
                const label = (row.productName || '—').slice(0, 22);
                const qty = Number(row.quantity) || 0;
                lines.push(padLine(label + ' x' + qty, fmt(row.amount)));
            });
        }
        lines.push('--------------------------------');
        lines.push('  ODEME TIPLERI');
        (d.paymentsByType || []).forEach((p: any) => {
            lines.push(padLine(p.type, fmt(p.amount)));
            lines.push('    ' + p.count + ' islem');
        });
        lines.push('--------------------------------');
        lines.push('  KATEGORI');
        (d.salesByCategory || []).forEach((c: any) => {
            lines.push(padLine(c.category + ' (' + c.count + ' adet)', fmt(c.amount)));
        });
        if ((d.voids || []).length > 0) {
            lines.push('--------------------------------');
            lines.push('  IPTALLER');
            d.voids.forEach((v: any) => lines.push(padLine(v.reason, fmt(v.amount))));
        }
        if ((d.complements?.count || 0) > 0) {
            lines.push('--------------------------------');
            lines.push(padLine('Ikram', fmt(d.complements.amount) + ' (' + d.complements.count + ' urun)'));
        }
        lines.push('--------------------------------');
        lines.push('     GUN SONU Z RAPORU');
        lines.push('');
        return lines.join('\n');
    };

    const openPrint80mm = () => {
        const html = getReceipt80mmHtml();
        const win = window.open('', '_blank', 'width=320,height=600');
        if (!win) return;
        const content = html.split('\n').map(line => `<div class="line">${line.replace(/ /g, '&nbsp;')}</div>`).join('');
        win.document.write(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Z-Raporu</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.35; padding: 8px; background: #fff; color: #000; }
  .receipt { width: 80mm; max-width: 80mm; min-height: 100vh; }
  .line { white-space: pre; letter-spacing: 0.02em; }
  @media print {
    body { padding: 0; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .receipt { width: 80mm !important; max-width: 80mm !important; }
    .no-print { display: none !important; }
    @page { size: 80mm auto; margin: 4mm; }
  }
</style>
</head>
<body>
  <div class="receipt">${content}</div>
  <div class="no-print" style="margin-top:16px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;">80mm Fiş Yazdır</button>
    <button onclick="window.close()" style="margin-left:8px;padding:10px 24px;font-size:14px;cursor:pointer;">Kapat</button>
  </div>
</body></html>
        `);
        win.document.close();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[5000]">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Başlık */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Z-Raporu</h2>
                            <p className="text-xs text-slate-500">{new Date(data.date).toLocaleDateString('tr-TR')} — {data.staffName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Özet */}
                <div className="px-6 py-4 border-b border-slate-100 space-y-3 shrink-0">
                    <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="w-4 h-4" /> Açılış: {new Date(data.openedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-500">Kapanış: {new Date(data.closedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Toplam Satış</p>
                            <p className="text-xl font-bold text-slate-900 mt-0.5">{fmt(data.totalSales)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Net Nakit</p>
                            <p className="text-xl font-bold text-slate-900 mt-0.5">{fmt(data.netCash)}</p>
                        </div>
                        <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide">İade Tutarı</p>
                            <p className="text-xl font-bold text-slate-900 mt-0.5">{fmt(data.returns?.amount || 0)}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">İkram Tutarı</p>
                            <p className="text-xl font-bold text-slate-900 mt-0.5">{fmt(data.complements?.amount || 0)}</p>
                        </div>
                    </div>
                </div>

                {/* Detay */}
                <div className="flex-1 overflow-auto px-6 py-4 space-y-4 text-sm">
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Satılan ürünler</h3>
                        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                            {(data.salesByProduct || []).length === 0 ? (
                                <li className="text-slate-400 text-sm">Bu gün için kalem yok</li>
                            ) : (
                                (data.salesByProduct || []).map((row, i) => (
                                    <li key={i} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0 gap-2">
                                        <span className="text-slate-700 truncate flex-1" title={row.productName}>{row.productName}</span>
                                        <span className="text-slate-500 shrink-0">×{Number(row.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}</span>
                                        <span className="font-semibold text-slate-900 shrink-0">{fmt(row.amount)}</span>
                                    </li>
                                ))
                            )}
                        </ul>
                    </section>
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ödeme tipleri</h3>
                        <ul className="space-y-1.5">
                            {data.paymentsByType.map((p, i) => (
                                <li key={i} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                                    <span className="flex items-center gap-2 text-slate-600">
                                        {p.type === 'NAKİT' || /NAKIT|CASH/i.test(p.type) ? <Banknote className="w-4 h-4 text-emerald-500" /> : <CreditCard className="w-4 h-4 text-slate-400" />}
                                        {p.type}
                                    </span>
                                    <span className="font-semibold text-slate-900">{fmt(p.amount)}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Kategori</h3>
                        <ul className="space-y-1.5">
                            {data.salesByCategory.map((c, i) => (
                                <li key={i} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                                    <span className="text-slate-600">{c.category} ({c.count})</span>
                                    <span className="font-semibold text-slate-900">{fmt(c.amount)}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                    {(data.voids?.length > 0 || (data.complements?.count ?? 0) > 0) && (
                        <section className="grid grid-cols-2 gap-4">
                            {data.voids?.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">İptaller</h3>
                                    <ul className="space-y-1 text-slate-600">
                                        {data.voids.map((v, i) => (
                                            <li key={i} className="flex justify-between"><span>{v.reason}</span><span>{fmt(v.amount)}</span></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {(data.complements?.count ?? 0) > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">İkram</h3>
                                    <p className="text-slate-600">{data.complements.count} ürün — {fmt(data.complements.amount)}</p>
                                </div>
                            )}
                        </section>
                    )}
                </div>

                {/* Alt butonlar */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className={cn(
                            'flex-1 py-3 rounded-xl font-semibold text-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        )}
                    >
                        Kapat
                    </button>
                    <button
                        onClick={openPrint80mm}
                        className="flex-1 py-3 rounded-xl font-semibold text-sm bg-slate-800 text-white flex items-center justify-center gap-2 hover:bg-slate-700"
                    >
                        <Printer className="w-4 h-4" />
                        80mm Fiş Yazdır
                    </button>
                </div>
            </div>
        </div>
    );
};
