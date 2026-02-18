import React, { useState, useMemo } from 'react';
import {
    BarChart3, PieChart, LineChart as LineChartIcon,
    Table as TableIcon, Filter, Layers,
    Plus, X, ChevronDown, ChevronRight,
    Download, Printer, Play, RefreshCw,
    Settings2, Database, Layout, TrendingUp
} from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line,
    PieChart as RePieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { formatNumber } from '../../utils/formatNumber';

interface Field {
    id: string;
    name: string;
    type: 'dimension' | 'metric';
}

interface InteractiveReportExplorerProps {
    reportName: string;
    data: any[];
}

export function InteractiveReportExplorer({ reportName, data }: InteractiveReportExplorerProps) {
    const [viewMode, setViewMode] = useState<'table' | 'pivot' | 'chart'>('chart');
    const [chartType, setChartType] = useState<'bar' | 'line' | 'area' | 'pie'>('bar');
    const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

    // Extract fields from data
    const fields = useMemo(() => {
        if (!data || !Array.isArray(data) || data.length === 0) return [];
        return Object.keys(data[0]).map(key => ({
            id: key,
            name: key.split(/(?=[A-Z])|_/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            type: (typeof data[0][key] === 'number') ? 'metric' : 'dimension'
        })) as Field[];
    }, [data]);

    // Set default selection if none
    React.useEffect(() => {
        if (selectedDimensions.length === 0 && selectedMetrics.length === 0 && fields.length > 0) {
            const firstDim = fields.find(f => f.type === 'dimension');
            const firstMet = fields.find(f => f.type === 'metric');
            if (firstDim) setSelectedDimensions([firstDim.id]);
            if (firstMet) setSelectedMetrics([firstMet.id]);
        }
    }, [fields, selectedDimensions.length, selectedMetrics.length]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    const pivotData = useMemo(() => {
        if (!data || !Array.isArray(data) || data.length === 0 || selectedDimensions.length === 0 || selectedMetrics.length === 0) return [];

        const dim = selectedDimensions[0];
        const met = selectedMetrics[0];

        const grouped = data.reduce((acc: any, curr: any) => {
            const key = curr[dim] || 'Unknown';
            if (!acc[key]) acc[key] = 0;
            acc[key] += Number(curr[met]) || 0;
            return acc;
        }, {});

        return Object.keys(grouped).map(key => ({
            name: key,
            value: grouped[key]
        })).sort((a, b) => b.value - a.value);
    }, [data, selectedDimensions, selectedMetrics]);

    return (
        <div className="flex h-full overflow-hidden bg-gray-50/50">
            {/* Sidebar - Field Selector */}
            <div className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-600" />
                        FIELD EXPLORER
                    </h2>
                    <button className="p-1 hover:bg-gray-100 rounded">
                        <Settings2 className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Dimensions */}
                    <div>
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                            DIMENSIONS
                            <Plus className="w-3 h-3" />
                        </h3>
                        <div className="space-y-1">
                            {fields.filter(f => f.type === 'dimension').map(field => (
                                <button
                                    key={field.id}
                                    onClick={() => {
                                        setSelectedDimensions(prev =>
                                            prev.includes(field.id) ? prev.filter(id => id !== field.id) : [...prev, field.id]
                                        );
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${selectedDimensions.includes(field.id)
                                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                        : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                                        }`}
                                >
                                    <Layers className={`w-3.5 h-3.5 ${selectedDimensions.includes(field.id) ? 'text-blue-600' : 'text-gray-400'}`} />
                                    {field.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Metrics */}
                    <div>
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                            METRICS
                            <Plus className="w-3 h-3" />
                        </h3>
                        <div className="space-y-1">
                            {fields.filter(f => f.type === 'metric').map(field => (
                                <button
                                    key={field.id}
                                    onClick={() => {
                                        setSelectedMetrics(prev =>
                                            prev.includes(field.id) ? prev.filter(id => id !== field.id) : [...prev, field.id]
                                        );
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${selectedMetrics.includes(field.id)
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                                        }`}
                                >
                                    <TrendingUp className={`w-3.5 h-3.5 ${selectedMetrics.includes(field.id) ? 'text-emerald-600' : 'text-gray-400'}`} />
                                    {field.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50/80">
                    <button className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95">
                        <Play className="w-3 h-3 fill-current" />
                        RUN QUERY
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            <button
                                onClick={() => setViewMode('chart')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'chart' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <BarChart3 className="w-3.5 h-3.5" />
                                CHARTS
                            </button>
                            <button
                                onClick={() => setViewMode('pivot')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'pivot' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Layout className="w-3.5 h-3.5" />
                                PIVOT
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <TableIcon className="w-3.5 h-3.5" />
                                TABLE
                            </button>
                        </div>

                        {viewMode === 'chart' && (
                            <div className="flex gap-1 h-8 items-center border-l pl-4 border-gray-200">
                                {[
                                    { id: 'bar', icon: BarChart3 },
                                    { id: 'line', icon: LineChartIcon },
                                    { id: 'area', icon: Layout },
                                    { id: 'pie', icon: PieChart },
                                ].map(type => (
                                    <button
                                        key={type.id}
                                        onClick={() => setChartType(type.id as any)}
                                        className={`p-1.5 rounded-md transition-all ${chartType === type.id ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}
                                    >
                                        <type.icon className="w-4 h-4" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reset
                        </button>
                        <button className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-md hover:bg-blue-700">
                            <Download className="w-3.5 h-3.5" />
                            Save Layout
                        </button>
                    </div>
                </div>

                {/* Workspace */}
                <div className="flex-1 p-8 overflow-hidden bg-gray-50/30">
                    <div className="h-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col overflow-hidden">
                        {viewMode === 'chart' ? (
                            <div className="flex-1 min-h-0">
                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-gray-900">{reportName} Explorer</h3>
                                    <p className="text-sm text-gray-500 mt-1">Aggregating {selectedMetrics.join(', ')} by {selectedDimensions.join(', ')}</p>
                                </div>
                                <div className="h-[calc(100%-60px)] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        {chartType === 'bar' ? (
                                            <BarChart data={pivotData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} dy={10} />
                                                <YAxis fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v, 0, false)} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                                    formatter={(v: any) => [formatNumber(v, 0, false), selectedMetrics[0]]}
                                                />
                                                <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                                            </BarChart>
                                        ) : chartType === 'line' ? (
                                            <LineChart data={pivotData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                                                <YAxis fontSize={11} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                                            </LineChart>
                                        ) : chartType === 'area' ? (
                                            <AreaChart data={pivotData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                                                <YAxis fontSize={11} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#colorVal)" strokeWidth={3} />
                                                <defs>
                                                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                            </AreaChart>
                                        ) : (
                                            <RePieChart>
                                                <Pie
                                                    data={pivotData}
                                                    innerRadius={80}
                                                    outerRadius={120}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {pivotData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </RePieChart>
                                        )}
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ) : viewMode === 'table' ? (
                            <div className="flex-1 overflow-hidden">
                                <DevExDataGrid
                                    data={Array.isArray(data) ? data : []}
                                    columns={fields.map(f => ({
                                        accessorKey: f.id,
                                        header: f.name,
                                        cell: (info: any) => {
                                            const value = info.getValue();
                                            return typeof value === 'number' ? formatNumber(value, 0, false) : value;
                                        }
                                    }))}
                                />
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto">
                                {/* Pivot Table View */}
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{selectedDimensions[0]}</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Metrik: {selectedMetrics[0]}</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">% Of Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {pivotData.map((row, idx) => {
                                            const total = pivotData.reduce((sum, r) => sum + r.value, 0);
                                            const percentage = ((row.value / total) * 100).toFixed(1);
                                            return (
                                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{row.name}</td>
                                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">{formatNumber(row.value, 0, false)}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-blue-500 rounded-full"
                                                                    style={{ width: `${percentage}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-500 min-w-[40px]">{percentage}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-50/50 font-bold border-t-2 border-gray-200">
                                        <tr>
                                            <td className="px-6 py-4 text-sm text-gray-900">GRAND TOTAL</td>
                                            <td className="px-6 py-4 text-sm text-blue-700" colSpan={2}>
                                                {formatNumber(pivotData.reduce((sum, r) => sum + r.value, 0), 0, false)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
