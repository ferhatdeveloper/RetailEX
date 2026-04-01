import React, { useEffect, useState } from 'react';
import { Phone, Radio, Usb, Info, Save, Cable, RefreshCw } from 'lucide-react';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { getBridgeUrl, IS_TAURI } from '@/utils/env';
import { cn } from '@/components/ui/utils';
import type { RestaurantCallerIdMode } from '../types';

type SerialPortRow = { path: string; description: string };

export function RestaurantCallerIdSettings() {
    const { callerIdConfig, setCallerIdConfig } = useRestaurantStore();
    const bridgeBase = getBridgeUrl();
    const [serialPorts, setSerialPorts] = useState<SerialPortRow[]>([]);
    const [serialListLoading, setSerialListLoading] = useState(false);

    const setMode = (mode: RestaurantCallerIdMode) => setCallerIdConfig({ mode });

    const refreshSerialPorts = async () => {
        if (!IS_TAURI) return;
        setSerialListLoading(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const rows = await invoke<SerialPortRow[]>('list_caller_serial_ports');
            setSerialPorts(Array.isArray(rows) ? rows : []);
        } catch {
            setSerialPorts([]);
        } finally {
            setSerialListLoading(false);
        }
    };

    useEffect(() => {
        if (callerIdConfig.mode === 'physical_serial' && IS_TAURI) {
            void refreshSerialPorts();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callerIdConfig.mode]);

    const showPollBlock =
        callerIdConfig.mode === 'virtual_pbx' || callerIdConfig.mode === 'physical_device';

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-violet-50 rounded-2xl text-violet-600">
                    <Phone className="w-7 h-7" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Arayan Numara (Caller ID)</h1>
                    <p className="text-slate-500 text-sm font-medium mt-0.5">
                        Sanal santral webhook, yerel HTTP köprüsü veya DeskApp seri port
                    </p>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900 space-y-2">
                    <p>
                        Tarayıcı doğrudan santralden çağrı alamaz. Sanal santralde webhook adresi olarak{' '}
                        <strong>pg_bridge</strong> sunucunuza POST verilir; uygulama periyodik olarak son arayanı okur.
                    </p>
                    <p className="text-amber-800/90">
                        USB/RS232 Caller ID kutusu için <strong>DeskApp</strong> içinde &quot;Seri port (DeskApp)&quot;
                        modunu seçin; uygulama satırları okuyup numarayı çıkarır.
                    </p>
                </div>
            </div>

            <div className="grid gap-3">
                <ModeCard
                    active={callerIdConfig.mode === 'off'}
                    onSelect={() => setMode('off')}
                    icon={<Phone className="w-5 h-5" />}
                    title="Kapalı"
                    desc="Caller ID devre dışı"
                />
                <ModeCard
                    active={callerIdConfig.mode === 'virtual_pbx'}
                    onSelect={() => setMode('virtual_pbx')}
                    icon={<Radio className="w-5 h-5" />}
                    title="Sanal santral"
                    desc="Webhook → pg_bridge push, uygulama poll"
                />
                <ModeCard
                    active={callerIdConfig.mode === 'physical_device'}
                    onSelect={() => setMode('physical_device')}
                    icon={<Usb className="w-5 h-5" />}
                    title="Fiziksel cihaz / yerel köprü"
                    desc="Kendi GET endpoint veya cihaz yazılımı URL adresi"
                />
                <ModeCard
                    active={callerIdConfig.mode === 'physical_serial'}
                    onSelect={() => setMode('physical_serial')}
                    icon={<Cable className="w-5 h-5" />}
                    title="Seri port (DeskApp)"
                    desc="COM port üzerinden doğrudan okuma — yalnız masaüstü uygulamasında"
                />
            </div>

            {callerIdConfig.mode === 'physical_serial' && (
                <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-6 space-y-5">
                    {!IS_TAURI ? (
                        <p className="text-sm font-semibold text-amber-800">
                            Bu mod yalnızca RetailEX masaüstü (Tauri) kurulumunda çalışır. Web sürümünde &quot;Fiziksel
                            cihaz / yerel köprü&quot; ile küçük bir yerel HTTP servisi kullanın.
                        </p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    COM portu
                                </label>
                                <button
                                    type="button"
                                    onClick={() => refreshSerialPorts()}
                                    disabled={serialListLoading}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800"
                                >
                                    <RefreshCw className={cn('w-3.5 h-3.5', serialListLoading && 'animate-spin')} />
                                    Yenile
                                </button>
                            </div>
                            <select
                                value={callerIdConfig.serialPort}
                                onChange={(e) => setCallerIdConfig({ serialPort: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none bg-white"
                            >
                                <option value="">Port seçin…</option>
                                {serialPorts.map((p) => (
                                    <option key={p.path} value={p.path}>
                                        {p.path} — {p.description}
                                    </option>
                                ))}
                            </select>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Baud hızı
                                </label>
                                <select
                                    value={String(callerIdConfig.serialBaud)}
                                    onChange={(e) =>
                                        setCallerIdConfig({ serialBaud: Number(e.target.value) || 9600 })
                                    }
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium bg-white"
                                >
                                    {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
                                        <option key={b} value={b}>
                                            {b}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Satır bazlı okuma yapılır; <code className="bg-slate-100 px-1 rounded">NMBR=</code> veya
                                en az 10 haneli numara içeren metin desteklenir. Cihaz protokolü farklıysa üretici
                                yazılımı ile köprü kullanın.
                            </p>
                        </>
                    )}
                </div>
            )}

            {callerIdConfig.mode !== 'off' && showPollBlock && (
                <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-6 space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Özel poll URL (isteğe bağlı — sanal modda boş = köprü son kayıt)
                        </label>
                        <input
                            type="url"
                            value={callerIdConfig.pollUrl}
                            onChange={(e) => setCallerIdConfig({ pollUrl: e.target.value })}
                            placeholder={
                                callerIdConfig.mode === 'virtual_pbx'
                                    ? `${bridgeBase}/api/caller_id/last`
                                    : 'http://127.0.0.1:8765/last-call'
                            }
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Poll aralığı (ms)
                            </label>
                            <input
                                type="number"
                                min={1500}
                                step={100}
                                value={callerIdConfig.pollIntervalMs}
                                onChange={(e) =>
                                    setCallerIdConfig({ pollIntervalMs: Number(e.target.value) || 2500 })
                                }
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                API token (pg_bridge CALLER_ID_PUSH_TOKEN ile aynı)
                            </label>
                            <input
                                type="password"
                                autoComplete="off"
                                value={callerIdConfig.apiToken}
                                onChange={(e) => setCallerIdConfig({ apiToken: e.target.value })}
                                placeholder="Üretimde zorunlu önerilir"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium"
                            />
                        </div>
                    </div>

                    {callerIdConfig.mode === 'virtual_pbx' && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs font-mono text-slate-700 space-y-2 overflow-x-auto">
                            <p className="font-sans font-bold text-slate-600 text-[11px] uppercase tracking-wide">
                                Webhook (POST)
                            </p>
                            <code className="block whitespace-pre-wrap break-all">{bridgeBase}/api/caller_id/push</code>
                            <p className="font-sans text-slate-600 text-[11px] mt-2">
                                Gövde örneği:{' '}
                                <code className="bg-white px-1 rounded border border-slate-200">
                                    {`{ "phone": "905321234567", "name": "..." }`}
                                </code>
                                {callerIdConfig.apiToken.trim() ? (
                                    <>
                                        {' '}
                                        — token alanı veya{' '}
                                        <code className="bg-white px-1 rounded border">Authorization: Bearer …</code>
                                    </>
                                ) : null}
                            </p>
                            <p className="font-sans text-slate-600 text-[11px]">
                                Köprüyü çalıştırmadan önce ortamda{' '}
                                <code className="bg-white px-1 rounded border">CALLER_ID_PUSH_TOKEN</code> tanımlayabilirsiniz
                                (PowerShell:{' '}
                                <code className="bg-white px-1 rounded border">
                                    $env:CALLER_ID_PUSH_TOKEN=&quot;gizli&quot;
                                </code>
                                ).
                            </p>
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-end">
                <span className="inline-flex items-center gap-2 text-emerald-600 text-sm font-bold">
                    <Save className="w-4 h-4" />
                    Ayarlar bu cihazda otomatik kaydedilir
                </span>
            </div>
        </div>
    );
}

function ModeCard({
    active,
    onSelect,
    icon,
    title,
    desc,
}: {
    active: boolean;
    onSelect: () => void;
    icon: React.ReactNode;
    title: string;
    desc: string;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'w-full flex items-start gap-4 p-5 rounded-2xl border text-left transition-all',
                active
                    ? 'bg-violet-50 border-violet-200 ring-2 ring-violet-100 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/80'
            )}
        >
            <div
                className={cn(
                    'p-2.5 rounded-xl shrink-0',
                    active ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'
                )}
            >
                {icon}
            </div>
            <div>
                <div className="font-black text-slate-800">{title}</div>
                <div className="text-sm text-slate-500 font-medium mt-0.5">{desc}</div>
            </div>
        </button>
    );
}
