import React, { useState, useEffect } from 'react';
import {
    FileText, Search, Download, Printer,
    Calendar, Filter, ArrowRight
} from 'lucide-react';
import { dynamicReportEngine, MaterialExtractRow } from '../../../services/reports/DynamicReportEngine';
import { formatNumber } from '../../../utils/formatNumber';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export function MaterialExtractReport() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<MaterialExtractRow[]>([]);
    const [productId, setProductId] = useState('1'); // Demo ID
    const [dateRange, setDateRange] = useState({
        start: format(new Date().setMonth(new Date().getMonth() - 1), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });

    const loadReport = async () => {
        setLoading(true);
        try {
            const rows = await dynamicReportEngine.getMaterialExtract(productId, dateRange.start, dateRange.end);
            setData(rows);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReport();
    }, [productId]);

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Logo-Style Filter Bar */}
            <div className="bg-gray-100 border-b p-4 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Malzeme Kodu/Adı</label>
                    <div className="flex gap-2">
                        <input
                            className="px-3 py-1.5 border rounded text-sm w-64 focus:ring-2 focus:ring-indigo-500"
                            placeholder="Malzeme seçiniz..."
                            defaultValue="LAPTOP-001 - Gaming Laptop"
                        />
                        <button className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                            <Search className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Başlangıç Tarihi</label>
                    <input
                        type="date"
                        className="px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        value={dateRange.start}
                        onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bitiş Tarihi</label>
                    <input
                        type="date"
                        className="px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        value={dateRange.end}
                        onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    />
                </div>

                <button
                    onClick={loadReport}
                    className="px-6 py-2 bg-gray-800 text-white rounded font-bold text-sm hover:bg-black transition-all"
                >
                    Raporu Hazırla
                </button>

                <div className="flex-1 flex justify-end gap-2">
                    <button className="p-2 hover:bg-gray-200 rounded border transition-colors"><Printer className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-gray-200 rounded border transition-colors"><Download className="w-4 h-4" /></button>
                </div>
            </div>

            {/* Report Header (Logo Style) */}
            <div className="p-8 pb-4 text-center">
                <h1 className="text-xl font-bold uppercase tracking-widest text-gray-800">Malzeme Hareket Ekstresi</h1>
                <div className="mt-2 flex justify-center gap-4 text-xs text-gray-500">
                    <span>Tarih Aralığı: {dateRange.start} - {dateRange.end}</span>
                    <span>•</span>
                    <span>Birim: Yerel Para Birimi (IQD)</span>
                </div>
            </div>

            {/* Report Table */}
            <div className="flex-1 overflow-auto px-8 pb-8">
                <table className="w-full border-collapse border border-gray-300">
                    <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-700">
                        <tr>
                            <th className="border border-gray-300 px-3 py-2 text-left">Tarih</th>
                            <th className="border border-gray-300 px-3 py-2 text-left">İşlem Türü</th>
                            <th className="border border-gray-300 px-3 py-2 text-left">Fiş No</th>
                            <th className="border border-gray-300 px-3 py-2 text-left">Açıklama</th>
                            <th className="border border-gray-300 px-3 py-2 text-right">Giriş/Çıkış</th>
                            <th className="border border-gray-300 px-3 py-2 text-right">Birim Fiyat</th>
                            <th className="border border-gray-300 px-3 py-2 text-right">Tutar</th>
                            <th className="border border-gray-300 px-3 py-2 text-right bg-blue-50">Kalan Miktar</th>
                        </tr>
                    </thead>
                    <tbody className="text-[11px] text-gray-700">
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center py-10 text-gray-400 italic">Kayıt bulunamadı</td>
                            </tr>
                        ) : (
                            data.map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="border border-gray-200 px-3 py-1.5">{format(new Date(row.date), 'dd.MM.yyyy')}</td>
                                    <td className="border border-gray-200 px-3 py-1.5 font-bold">
                                        {row.trcode === 1 ? 'Sarf' : row.trcode === 2 ? 'Üretimden Giriş' : row.trcode === 5 ? 'Ambar Fişi' : `Farklı (${row.trcode})`}
                                    </td>
                                    <td className="border border-gray-200 px-3 py-1.5 font-mono">{row.fiche_no}</td>
                                    <td className="border border-gray-200 px-3 py-1.5 italic">{row.description || '-'}</td>
                                    <td className={`border border-gray-200 px-3 py-1.5 text-right font-bold ${row.movement_type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                                        {row.movement_type === 'in' ? '+' : '-'}{formatNumber(row.quantity, 0, false)}
                                    </td>
                                    <td className="border border-gray-200 px-3 py-1.5 text-right">{formatNumber(row.price, 2, false)}</td>
                                    <td className="border border-gray-200 px-3 py-1.5 text-right">{formatNumber(row.amount, 2, false)}</td>
                                    <td className="border border-gray-200 px-3 py-1.5 text-right font-bold bg-blue-50/30">
                                        {formatNumber(row.running_balance, 0, false)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {data.length > 0 && (
                        <tfoot className="bg-gray-100 font-bold text-xs">
                            <tr>
                                <td colSpan={4} className="border border-gray-300 px-3 py-2 text-right">TOPLAM</td>
                                <td className="border border-gray-300 px-3 py-2 text-right">
                                    {formatNumber(data.reduce((s, r) => s + (r.movement_type === 'in' ? r.quantity : -r.quantity), 0), 0, false)}
                                </td>
                                <td className="border border-gray-300 px-3 py-2"></td>
                                <td className="border border-gray-300 px-3 py-2 text-right">
                                    {formatNumber(data.reduce((s, r) => s + r.amount, 0), 2, false)}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right bg-blue-100">
                                    {formatNumber(data[data.length - 1].running_balance, 0, false)}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>

                <div className="mt-10 p-4 border rounded bg-indigo-50 border-indigo-100 flex items-center gap-4">
                    <div className="bg-indigo-600 p-2 rounded text-white"><FileText className="w-6 h-6" /></div>
                    <div className="text-xs text-indigo-900 leading-relaxed">
                        <strong>Editör Notu:</strong> Bu rapor yapısı Logo ERP'nin kurumsal standartlarıyla birebir uyumlu olacak şekilde, asenkron yürüyen bakiye (running balance) motoru kullanılarak RetailEX yerel veritabanı (PostgreSQL) üzerinden anlık olarak hesaplanmaktadır.
                    </div>
                </div>
            </div>
        </div>
    );
}
