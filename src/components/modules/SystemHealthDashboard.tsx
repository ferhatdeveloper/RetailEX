import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, Clock, Database, Server, AlertCircle } from 'lucide-react';
import { systemHealthService, ServiceHealth } from '../../services/SystemHealthService';
import HealthStatusBadge from '../shared/HealthStatusBadge';

const SystemHealthDashboard: React.FC = () => {
    const [healthData, setHealthData] = useState<ServiceHealth[]>([]);
    const [syncLogs, setSyncLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [health, logs] = await Promise.all([
                systemHealthService.getServiceHealth(),
                systemHealthService.getSyncLogs(10)
            ]);
            setHealthData(health);
            setSyncLogs(logs);
            setLastRefresh(new Date());
        } catch (error) {
            console.error('Failed to refresh health data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-semibold text-slate-800">Sistem Gözlemlenebilirliği</h2>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500 font-mono">
                        Son Güncelleme: {lastRefresh.toLocaleTimeString('tr-TR')}
                    </span>
                    <button
                        onClick={fetchData}
                        disabled={isLoading}
                        className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {healthData.map((service) => (
                        <div key={service.service_name} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all duration-300">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${service.status === 'ONLINE' ? 'bg-emerald-100/50' : 'bg-slate-100'}`}>
                                        {service.service_name.includes('Sync') ? <Server className="w-5 h-5 text-indigo-500" /> : <Database className="w-5 h-5 text-amber-500" />}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900">{service.service_name}</h3>
                                        <span className="text-[10px] text-slate-400 font-mono">v{service.version}</span>
                                    </div>
                                </div>
                                <HealthStatusBadge status={service.status} />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1 text-slate-500">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Son Kalp Atışı:</span>
                                    </div>
                                    <span className="text-slate-700 font-medium">
                                        {new Date(service.last_heartbeat).toLocaleTimeString('tr-TR')}
                                    </span>
                                </div>

                                {service.metadata && (
                                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                                        {Object.entries(service.metadata).map(([key, value]: [string, any]) => (
                                            <div key={key} className="flex flex-col">
                                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</span>
                                                <span className="text-xs text-slate-700 font-semibold">{value.toString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-4 h-4 text-slate-400" />
                        <h4 className="text-sm font-semibold text-slate-700">Son Senkronizasyon Kayıtları</h4>
                    </div>
                    <div className="overflow-hidden border border-slate-100 rounded-lg">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-4 py-3">Tarih</th>
                                    <th className="px-4 py-3">Mağaza</th>
                                    <th className="px-4 py-3">Tip</th>
                                    <th className="px-4 py-3">Detay</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {syncLogs.length > 0 ? syncLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2.5 text-slate-600 font-mono">
                                            {new Date(log.last_sync_date).toLocaleTimeString('tr-TR')}
                                        </td>
                                        <td className="px-4 py-2.5 font-semibold text-slate-800">{log.store_code}</td>
                                        <td className="px-4 py-2.5">
                                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
                                                {log.sync_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">
                                            {JSON.stringify(log.detail)}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                                            Kayıt bulunamadı
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemHealthDashboard;
