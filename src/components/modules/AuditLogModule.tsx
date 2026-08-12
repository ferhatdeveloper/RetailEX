// src/components/AuditLogModule.tsx
import React, { useState, useEffect } from 'react';
import { Shield, Search, Filter, Clock, User, Activity, ChevronRight, FileJson } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

interface AuditLog {
    id: string;
    user_name: string;
    action: string;
    entity_type: string;
    entity_id: string;
    timestamp: string;
    severity: 'info' | 'warning' | 'critical';
    reason?: string;
    new_values?: any;
}

export function AuditLogModule() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(100);

            if (error) throw error;
            setLogs(data || []);
        } catch (err) {
            console.error('Failed to load audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-100 text-red-700 border-red-200';
            case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-blue-100 text-blue-700 border-blue-200';
        }
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'INSERT': return <Activity className="w-4 h-4 text-green-500" />;
            case 'UPDATE': return <Activity className="w-4 h-4 text-blue-500" />;
            case 'DELETE': return <Activity className="w-4 h-4 text-red-500" />;
            default: return <Activity className="w-4 h-4 text-slate-500" />;
        }
    };

    return (
        <div className="flex h-full bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
            {/* Sidebar: Log List */}
            <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white">
                <div className="p-4 border-b border-slate-200 space-y-3">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-slate-900">Denetim Kayıtları</h2>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Ara..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-xl text-sm focus:bg-white focus:border-indigo-500 transition-all outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Yükleniyor...</div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">Kayıt bulunamadı.</div>
                    ) : (
                        logs.map(log => (
                            <div
                                key={log.id}
                                onClick={() => setSelectedLog(log)}
                                className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${selectedLog?.id === log.id ? 'bg-indigo-50/50 border-r-4 border-r-indigo-500' : ''
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getSeverityColor(log.severity)} uppercase`}>
                                        {log.severity}
                                    </span>
                                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(log.timestamp).toLocaleTimeString('tr-TR')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                                    {getActionIcon(log.action)}
                                    {log.action}: {log.entity_type}
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                    <User className="w-3 h-3" />
                                    {log.user_name}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Detail Area */}
            <div className="flex-1 flex flex-col bg-slate-50">
                {selectedLog ? (
                    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                                    <Activity className="w-8 h-8 text-indigo-600" />
                                    Kayıt Detayı
                                </h1>
                                <p className="text-slate-500 mt-1">ID: {selectedLog.id}</p>
                            </div>
                            <div className={`px-4 py-2 rounded-xl font-bold border ${getSeverityColor(selectedLog.severity)}`}>
                                {selectedLog.severity.toUpperCase()}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">İşlem Bilgileri</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">İşlem:</span>
                                        <span className="font-bold text-indigo-600">{selectedLog.action}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Varlık Tipi:</span>
                                        <span className="font-bold text-slate-900">{selectedLog.entity_type}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Varlık ID:</span>
                                        <span className="font-mono text-xs font-medium text-slate-900">{selectedLog.entity_id}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Aktör & Zaman</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Kullanıcı:</span>
                                        <span className="font-bold text-slate-900">{selectedLog.user_name}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Tarih:</span>
                                        <span className="font-bold text-slate-900">{new Date(selectedLog.timestamp).toLocaleDateString('tr-TR')}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Saat:</span>
                                        <span className="font-bold text-slate-900">{new Date(selectedLog.timestamp).toLocaleTimeString('tr-TR')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedLog.reason && (
                            <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
                                <h3 className="text-xs font-bold text-amber-600 uppercase mb-2">Değişiklik Nedeni</h3>
                                <p className="text-amber-900 font-medium italic">"{selectedLog.reason}"</p>
                            </div>
                        )}

                        <div className="bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-bold text-slate-400 uppercase">Veri Değişikliği (JSON)</h3>
                                <FileJson className="w-4 h-4 text-slate-500" />
                            </div>
                            <pre className="text-green-400 font-mono text-xs overflow-x-auto">
                                {JSON.stringify(selectedLog.new_values || {}, null, 2)}
                            </pre>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
                        <div className="p-6 bg-slate-100 rounded-full">
                            <Shield className="w-12 h-12 opacity-20" />
                        </div>
                        <p className="text-lg">Detayları görmek için bir kayıt seçin</p>
                    </div>
                )}
            </div>
        </div>
    );
}

