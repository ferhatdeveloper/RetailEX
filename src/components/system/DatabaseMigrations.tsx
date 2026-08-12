import React, { useState } from 'react';
import {
    Database,
    ArrowLeft,
    Play,
    RotateCcw,
    CheckCircle2,
    AlertCircle,
    Clock,
    Search,
    FileCode,
    Download,
    Filter
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface Migration {
    id: string;
    name: string;
    status: 'applied' | 'pending' | 'failed';
    applied_at?: string;
    description: string;
    version: string;
}

interface DatabaseMigrationsProps {
    onBack?: () => void;
}

export function DatabaseMigrations({ onBack }: DatabaseMigrationsProps) {
    const { darkMode } = useTheme();
    const [filter, setFilter] = useState<'all' | 'applied' | 'pending' | 'failed'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Mock Data
    const [migrations, setMigrations] = useState<Migration[]>([
        {
            id: '20250101_init',
            name: 'Initial Schema Setup',
            status: 'applied',
            applied_at: '2025-01-01 10:00:00',
            description: 'Base tables for Users, Products, and Stores.',
            version: '1.0.0'
        },
        {
            id: '20250102_auth',
            name: 'Auth Tables & RLS Policies',
            status: 'applied',
            applied_at: '2025-01-02 14:30:00',
            description: 'Added secure authentication tables and Row Level Security policies.',
            version: '1.0.1'
        },
        {
            id: '20250103_inventory',
            name: 'Advanced Inventory Management',
            status: 'applied',
            applied_at: '2025-01-03 09:15:00',
            description: 'Stock movements, warehouses, and serial/lot tracking.',
            version: '1.1.0'
        },
        {
            id: '20250104_ex_roserp',
            name: 'EX-ROSERP Integration Types',
            status: 'applied',
            applied_at: '2025-01-04 08:00:00',
            description: 'Added support for new modules: Voice Assistant, Workflow, etc.',
            version: '1.2.0'
        },
        {
            id: '20250105_ai_analytics',
            name: 'AI Analytics Tables',
            status: 'pending',
            description: 'Schema for heatmaps, gaze tracking and customer behavior analytics.',
            version: '1.3.0-beta'
        },
        {
            id: '20250105_fix_indexes',
            name: 'Performance Index Optimization',
            status: 'pending',
            description: 'Adding composite indexes for faster reporting queries.',
            version: '1.3.1'
        }
    ]);

    const filteredMigrations = migrations.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            m.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filter === 'all' || m.status === filter;
        return matchesSearch && matchesFilter;
    });

    const handleRunPending = () => {
        // Simulate running migrations
        alert('Running pending migrations... (Simulation)');
        const updated = migrations.map(m =>
            m.status === 'pending'
                ? { ...m, status: 'applied' as const, applied_at: new Date().toLocaleString() }
                : m
        );
        setMigrations(updated);
    };

    const handleRollback = () => {
        alert('Rolling back last migration... (Simulation)');
    };

    return (
        <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-slate-800'}`}>
            {/* Header */}
            <div className={`p-6 border-b ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-slate-100'
                                    }`}
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                        )}
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold">Database Migrations</h1>
                                <span className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full">
                                    PRO
                                </span>
                            </div>
                            <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                                Veritabanı şema versiyonlarını ve geçmişini yönetin.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleRollback}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${darkMode
                                    ? 'border-red-800 text-red-500 hover:bg-red-900/30'
                                    : 'border-red-200 text-red-600 hover:bg-red-50'
                                }`}
                        >
                            <RotateCcw className="w-4 h-4" />
                            <span>Rollback Last</span>
                        </button>
                        <button
                            onClick={handleRunPending}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Play className="w-4 h-4" />
                            <span>Run Pending</span>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center justify-between mt-6">
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg p-1">
                        {['all', 'applied', 'pending', 'failed'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f as any)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${filter === f
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : darkMode ? 'text-gray-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className={`relative ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                        <input
                            type="text"
                            placeholder="Search migrations..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`pl-9 pr-4 py-2 rounded-lg border text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode
                                    ? 'bg-gray-800 border-gray-700 focus:border-transparent placeholder-gray-500'
                                    : 'bg-white border-slate-200 placeholder-slate-400'
                                }`}
                        />
                    </div>
                </div>
            </div>

            {/* Migration List */}
            <div className="flex-1 overflow-auto p-6">
                <div className="space-y-4 max-w-5xl mx-auto">
                    {filteredMigrations.map((migration) => (
                        <div
                            key={migration.id}
                            className={`border rounded-xl p-5 transition-all hover:shadow-md ${darkMode
                                    ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className={`mt-1 p-2 rounded-lg ${migration.status === 'applied'
                                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                            : migration.status === 'pending'
                                                ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                        }`}>
                                        <FileCode className="w-5 h-5" />
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h3 className={`font-semibold text-lg ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>
                                                {migration.name}
                                            </h3>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${migration.status === 'applied'
                                                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                                    : migration.status === 'pending'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                                                        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                                                }`}>
                                                {migration.status.toUpperCase()}
                                            </span>
                                        </div>

                                        <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                                            {migration.description}
                                        </p>

                                        <div className="flex items-center gap-4 mt-4 text-xs">
                                            <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                                                <Database className="w-3 h-3" />
                                                ID: <span className="font-mono">{migration.id}</span>
                                            </span>
                                            {migration.applied_at && (
                                                <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                                                    <Clock className="w-3 h-3" />
                                                    Applied: {migration.applied_at}
                                                </span>
                                            )}
                                            <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                                                <Filter className="w-3 h-3" />
                                                v{migration.version}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                    {migration.status === 'failed' && (
                                        <button className="text-xs text-red-600 hover:underline flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            View Error Logs
                                        </button>
                                    )}
                                    {migration.status === 'applied' && (
                                        <button className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-slate-50 text-slate-400'}`}>
                                            <Download className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredMigrations.length === 0 && (
                        <div className={`text-center py-12 rounded-xl border border-dashed ${darkMode ? 'border-gray-800' : 'border-slate-300'}`}>
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-gray-800' : 'bg-slate-100'}`}>
                                <Search className={`w-6 h-6 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`} />
                            </div>
                            <h3 className={`text-lg font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-slate-900'}`}>No migrations found</h3>
                            <p className={`${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>Try adjusting your search or filters.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

