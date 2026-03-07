import React, { useState, useEffect } from 'react';
import {
    Shield,
    Lock,
    Unlock,
    Globe,
    Activity,
    AlertTriangle,
    Terminal,
    Wifi,
    WifiOff,
    RefreshCw,
    Server,
    Eye,
    Settings
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface SecurityEvent {
    id: string;
    type: 'blocked_ip' | 'failed_login' | 'port_scan' | 'system_alert';
    message: string;
    source: string;
    timestamp: string;
    severity: 'low' | 'medium' | 'high';
}

export function SecurityModulesWeb() {
    const { darkMode } = useTheme();
    const [vpnConnected, setVpnConnected] = useState(true);
    const [firewallActive, setFirewallActive] = useState(true);

    // Real-time log simulation
    const [logs, setLogs] = useState<SecurityEvent[]>([
        { id: 'ev-1', type: 'blocked_ip', message: 'Inbound connection blocked from unauthorized IP', source: '192.168.1.105', timestamp: '10:42:15', severity: 'medium' },
        { id: 'ev-2', type: 'system_alert', message: 'WireGuard service handshake completed', source: 'System', timestamp: '10:40:00', severity: 'low' },
        { id: 'ev-3', type: 'failed_login', message: 'Failed SSH login attempt (root)', source: '10.0.0.5', timestamp: '09:15:22', severity: 'high' }
    ]);

    const toggleVpn = () => {
        setVpnConnected(!vpnConnected);
        // Add log
        const newLog: SecurityEvent = {
            id: `ev-${Date.now()}`,
            type: 'system_alert',
            message: vpnConnected ? 'VPN service stopped manually' : 'VPN service started successfully',
            source: 'Admin User',
            timestamp: new Date().toLocaleTimeString(),
            severity: 'medium'
        };
        setLogs([newLog, ...logs]);
    };

    return (
        <div className={`h-full flex flex-col p-6 overflow-y-auto ${darkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-900'}`}>

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Shield className="w-8 h-8 text-indigo-500" />
                        ExSecureGate Command Center
                        <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded border border-indigo-500/30">v2.4.0</span>
                    </h1>
                    <p className={`mt-1 font-mono text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                        Secure Access Service Edge (SASE) & Zero Trust Network Access
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${vpnConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${vpnConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    </span>
                    <span className={`text-sm font-bold ${vpnConnected ? 'text-green-500' : 'text-red-500'}`}>
                        SYSTEM {vpnConnected ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>
            </div>

            {/* Control Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

                {/* VPN Status Card */}
                <div className={`p-6 rounded-xl border relative overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-slate-200'}`}>
                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <h3 className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>WireGuard VPN</h3>
                            <div className="flex items-center gap-3 mt-2">
                                {vpnConnected ? <Lock className="w-8 h-8 text-green-500" /> : <Unlock className="w-8 h-8 text-red-500" />}
                                <div>
                                    <span className="text-2xl font-bold block">{vpnConnected ? 'Connected' : 'Disconnected'}</span>
                                    <span className="text-xs text-gray-500 font-mono">10.8.0.1 (Gateway)</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={toggleVpn}
                            className={`p-2 rounded-lg transition-colors ${vpnConnected
                                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                    : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                                }`}
                        >
                            {vpnConnected ? <WifiOff className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
                        </button>
                    </div>
                    {/* Background decoration */}
                    <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-10 ${vpnConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                </div>

                {/* Firewall Status Card */}
                <div className={`p-6 rounded-xl border relative overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-slate-200'}`}>
                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <h3 className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Firewall Rules</h3>
                            <div className="flex items-center gap-3 mt-2">
                                <Server className="w-8 h-8 text-blue-500" />
                                <div>
                                    <span className="text-2xl font-bold block">Active</span>
                                    <span className="text-xs text-gray-500 font-mono">142 Rules Loaded</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button className={`p-2 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20`}>
                                <RefreshCw className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 border border-gray-700 font-mono">Inbound: DENY</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 border border-gray-700 font-mono">Outbound: ALLOW</span>
                    </div>
                </div>

                {/* Active Sessions Card */}
                <div className={`p-6 rounded-xl border relative overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-slate-200'}`}>
                    <div className="relative z-10">
                        <h3 className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Active Sessions</h3>
                        <div className="flex items-center gap-3 mt-2">
                            <Globe className="w-8 h-8 text-purple-500" />
                            <div>
                                <span className="text-2xl font-bold block">12 Devices</span>
                                <span className="text-xs text-gray-500 font-mono">Bandwidth: 4.2 MB/s</span>
                            </div>
                        </div>
                        <div className="mt-4 w-full bg-gray-800 rounded-full h-1.5">
                            <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: '65%' }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Middle Section - Traffic & Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">

                {/* Threat Monitor */}
                <div className={`rounded-xl border flex flex-col ${darkMode ? 'bg-gray-900/50 border-gray-800' : 'bg-white border-slate-200'}`}>
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-400" />
                            Live Threat Monitor
                        </h3>
                        <span className="animate-pulse w-2 h-2 rounded-full bg-indigo-500"></span>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-2 max-h-[400px]">
                        {logs.map((log) => (
                            <div key={log.id} className={`p-3 rounded border-l-4 ${log.severity === 'high'
                                    ? 'bg-red-500/10 border-red-500 text-red-200'
                                    : log.severity === 'medium'
                                        ? 'bg-amber-500/10 border-amber-500 text-amber-200'
                                        : 'bg-blue-500/10 border-blue-500 text-blue-200'
                                }`}>
                                <div className="flex justify-between opactiy-75 text-xs mb-1">
                                    <span>[{log.timestamp}]</span>
                                    <span className="uppercase font-bold">{log.type}</span>
                                </div>
                                <div>{log.message}</div>
                                <div className="mt-1 text-xs opacity-60">Source: {log.source}</div>
                            </div>
                        ))}

                        {/* Fake terminal type cursor */}
                        <div className="flex items-center gap-2 text-green-500 animate-pulse mt-4">
                            <Terminal className="w-4 h-4" />
                            <span>_monitoring_network_traffic...</span>
                        </div>
                    </div>
                </div>

                {/* Quick Actions / Configuration */}
                <div className={`rounded-xl border p-6 flex flex-col gap-4 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-slate-200'}`}>
                    <h3 className="font-semibold flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Quick Configurations
                    </h3>

                    <div className="space-y-3">
                        <div className={`p-4 rounded-lg flex items-center justify-between border ${darkMode ? 'bg-black/20 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                <div>
                                    <div className="font-medium">Force Block All Traffic</div>
                                    <div className="text-xs opacity-60">Except Admin VPN (Panic Button)</div>
                                </div>
                            </div>
                            <button className="px-3 py-1.5 bg-red-600/20 text-red-500 border border-red-600/50 rounded hover:bg-red-600/30 transition-colors text-sm font-bold">
                                ACTIVATE
                            </button>
                        </div>

                        <div className={`p-4 rounded-lg flex items-center justify-between border ${darkMode ? 'bg-black/20 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <Eye className="w-5 h-5 text-blue-500" />
                                <div>
                                    <div className="font-medium">Deep Packet Inspection</div>
                                    <div className="text-xs opacity-60">Monitor encrypted traffic headers</div>
                                </div>
                            </div>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </div>
                        </div>

                        <div className={`p-4 rounded-lg flex items-center justify-between border ${darkMode ? 'bg-black/20 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <Globe className="w-5 h-5 text-green-500" />
                                <div>
                                    <div className="font-medium">Geo-Blocking (International)</div>
                                    <div className="text-xs opacity-60">Block all non-TR traffic</div>
                                </div>
                            </div>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" defaultChecked />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-300">
                        <span className="font-bold block mb-1">?? ExSecureGate Status</span>
                        Your connection is securely encrypted with ChaCha20-Poly1305. All traffic is routed through the central gateway.
                    </div>
                </div>
            </div>
        </div>
    );
}



