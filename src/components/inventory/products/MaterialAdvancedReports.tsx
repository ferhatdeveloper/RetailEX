import React from 'react';
import { BarChart3 } from 'lucide-react';

// Report Components
import { MaterialExtractReport } from '../../inventory/reports/MaterialExtractReport';
import { InventoryReport } from '../../inventory/reports/InventoryReport';
import { MaterialValueReport } from '../../inventory/reports/MaterialValueReport';
import { MinMaxStockReport } from '../../inventory/reports/MinMaxStockReport';
import { CostReport } from '../../inventory/reports/CostReport';
import { InOutTotalsReport } from '../../inventory/reports/InOutTotalsReport';
import { WarehouseStatusReport } from '../../inventory/reports/WarehouseStatusReport';
import { TransactionBreakdownReport } from '../../inventory/reports/TransactionBreakdownReport';
import { SlipListReport } from '../../inventory/reports/SlipListReport';

export type ReportViewType =
    | 'stockreports_bal'
    | 'stockreports_tr'
    | 'stockreports_list'
    | 'stockreports_sum'
    | 'stockreports_trans'
    | 'report-material-extract'
    | 'report-material-value'
    | 'inventory'
    | 'cost'
    | 'report-in-out-totals'
    | 'report-warehouse-status'
    | 'report-transaction-breakdown'
    | 'report-slip-list'
    | 'report-min-max';

interface MaterialAdvancedReportsProps {
    viewType: ReportViewType;
}

export function MaterialAdvancedReports({ viewType }: MaterialAdvancedReportsProps) {

    // Render the specific report component based on viewType
    switch (viewType) {
        case 'report-material-extract':
            return <MaterialExtractReport />;

        case 'inventory':
            return <InventoryReport />;

        case 'report-material-value':
            return <MaterialValueReport />;

        case 'report-min-max':
            return <MinMaxStockReport />;

        case 'cost':
            return <CostReport />;

        case 'report-in-out-totals':
            return <InOutTotalsReport />;

        case 'report-transaction-breakdown':
            return <TransactionBreakdownReport />;

        case 'report-slip-list':
            return <SlipListReport />;

        case 'report-warehouse-status':
            return <WarehouseStatusReport />;

        // TODO: Implement legacy generic reports or map them to new ones
        case 'stockreports_bal':
        case 'stockreports_tr':
        case 'stockreports_list':
        case 'stockreports_sum':
        case 'stockreports_trans':
        default:
            return (
                <div className="h-full flex flex-col bg-gray-50 items-center justify-center p-6">
                    <div className="text-center max-w-md">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <BarChart3 className="w-10 h-10 text-gray-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Rapor Hazırlanıyor</h2>
                        <p className="text-gray-500">
                            Bu rapor türü ({viewType}) henüz aktif edilmemiştir.
                        </p>
                    </div>
                </div>
            );
    }
}


