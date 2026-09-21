import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { virmanAPI, VirmanOperation } from '../../../services/virmanAPI';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

type VirmanGridRow = VirmanOperation & {
    from_name: string;
    to_name: string;
    status: string;
};

export function VirmanModule() {
    const [virmans, setVirmans] = useState<VirmanOperation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void loadVirmans();
    }, []);

    const loadVirmans = async () => {
        try {
            setLoading(true);
            const data = await virmanAPI.getAll();
            setVirmans(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu virmanı silmek istediğinizden emin misiniz?')) return;
        try {
            await virmanAPI.delete(id);
            void loadVirmans();
        } catch (error) {
            alert('Silme hatası');
        }
    };

    const gridRows = useMemo<VirmanGridRow[]>(
        () =>
            virmans.map((v) => ({
                ...v,
                from_name: (v as VirmanOperation & { from_warehouse?: { name?: string } }).from_warehouse?.name || '-',
                to_name: (v as VirmanOperation & { to_warehouse?: { name?: string } }).to_warehouse?.name || '-',
                status: v.status,
            })),
        [virmans],
    );

    const columns = useMemo<ReportColumnTableCol<VirmanGridRow>[]>(
        () => [
            {
                key: 'virman_no',
                header: 'Virman No',
                size: 130,
                cell: (v) => <span className="font-mono text-sm">{v.virman_no}</span>,
            },
            {
                key: 'operation_date',
                header: 'Tarih',
                type: 'date',
                size: 110,
                cell: (v) => new Date(v.operation_date).toLocaleDateString('tr-TR'),
            },
            { key: 'from_name', header: 'Kaynak', size: 160 },
            { key: 'to_name', header: 'Hedef', size: 160 },
            {
                key: 'status',
                header: 'Durum',
                size: 120,
                cell: (v) => (
                    <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs">{v.status}</span>
                ),
            },
            {
                key: 'id',
                header: 'İşlemler',
                size: 90,
                align: 'right',
                cell: (v) => (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(v.id);
                        }}
                        className="text-red-600"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                ),
            },
        ],
        [],
    );

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <ArrowRightLeft className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Virman Fişleri</h1>
                            <p className="text-sm text-gray-500">Depolar arası virman işlemleri</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">Yükleniyor...</div>
                ) : gridRows.length === 0 ? (
                    <div className="bg-white rounded-lg shadow-sm border py-12 text-center text-gray-500">
                        <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>Henüz virman fişi yok</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow-sm border p-4">
                        <ReportColumnTable
                            data={gridRows}
                            columns={columns}
                            height={520}
                            storageNamespace="accounting-virman"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
