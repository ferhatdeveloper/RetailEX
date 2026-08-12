import React, { useState } from 'react';
import { BarChart3, FileText, Download, Filter, Calendar, TrendingUp } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

type ReportType = 'stock-balance' | 'purchase-sales' | 'detailed-list' | 'transfer';

export function MaterialReportsModule() {
    const { t } = useLanguage();
    const [activeReport, setActiveReport] = useState<ReportType>('stock-balance');

    const reports = [
        { id: 'stock-balance' as ReportType, name: 'Malzeme Depo Bakiye Raporu', icon: BarChart3 },
        { id: 'purchase-sales' as ReportType, name: 'Malzeme Alış Satış Raporu', icon: TrendingUp },
        { id: 'detailed-list' as ReportType, name: 'Ayrıntılı Malzeme Listesi', icon: FileText },
        { id: 'transfer' as ReportType, name: 'Transfer Raporu', icon: BarChart3 },
    ];

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-cyan-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Malzeme Raporları</h1>
                            <p className="text-sm text-gray-500">Stok ve malzeme raporlarını görüntüleyin</p>
                        </div>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
                        <Download className="w-5 h-5" />
                        Rapor İndir
                    </button>
                </div>
            </div>

            {/* Report Tabs */}
            <div className="bg-white border-b border-gray-200 px-6">
                <div className="flex gap-2 overflow-x-auto">
                    {reports.map((report) => {
                        const Icon = report.icon;
                        return (
                            <button
                                key={report.id}
                                onClick={() => setActiveReport(report.id)}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors whitespace-nowrap ${activeReport === report.id
                                        ? 'border-cyan-600 text-cyan-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {report.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Tarih Aralığı:</label>
                        <button className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">Bu Ay</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Depo:</label>
                        <select className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500">
                            <option>Tüm Depolar</option>
                            <option>Ana Depo</option>
                            <option>Şube Depo</option>
                        </select>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors ml-auto">
                        <Filter className="w-5 h-5" />
                        Daha Fazla Filtre
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                    <div className="text-center text-gray-500">
                        <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium mb-2">
                            {reports.find(r => r.id === activeReport)?.name}
                        </p>
                        <p className="text-sm">
                            Rapor parametrelerini seçin ve "Rapor İndir" butonuna tıklayın
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

