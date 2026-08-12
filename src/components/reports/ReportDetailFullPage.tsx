import {
    BarChart3, ChevronLeft
} from 'lucide-react';
import { InteractiveReportExplorer } from './InteractiveReportExplorer';

interface ReportDetailFullPageProps {
    reportId: string;
    reportName: string;
    data: any[];
    onBack: () => void;
}

export function ReportDetailFullPage({ reportId, reportName, data, onBack }: ReportDetailFullPageProps) {
    return (
        <div className="h-full flex flex-col bg-white">
            {/* Premium Compact Header */}
            <div className="px-6 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors group"
                    >
                        <ChevronLeft className="w-5 h-5 text-gray-500 group-hover:text-blue-600" />
                    </button>
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-600" />
                        <h1 className="text-sm font-bold text-gray-900 uppercase tracking-tight">{reportName} - Analytics Explorer</h1>
                    </div>
                </div>
            </div>

            {/* Interactive Explorer Content */}
            <div className="flex-1 overflow-hidden">
                <InteractiveReportExplorer
                    reportName={reportName}
                    data={data}
                />
            </div>
        </div>
    );
}


