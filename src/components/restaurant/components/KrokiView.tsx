import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lock, Unlock, Save, RotateCcw, Users, Move, Maximize2, X, Circle, Square, RectangleHorizontal, History, Clock, List, ChevronRight, Settings2, Eye, EyeOff, Plus, Minus, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { Table } from '../types';
import { RestaurantService } from '@/services/restaurant';

const fmt = (num: number) => {
    return new Intl.NumberFormat('tr-TR', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
};

const STORAGE_KEY = 'restaurant-kroki-layout';
const HIDDEN_KEY = 'restaurant-kroki-hidden';
const DEFAULT_PIN = '1234';

function getStoreId(): string | null {
    try {
        const dev = localStorage.getItem('retailex_registered_device');
        if (dev) return JSON.parse(dev).storeId ?? null;
    } catch { /* ignore */ }
    return null;
}

function loadHidden(): Set<string> {
    try {
        const raw = localStorage.getItem(HIDDEN_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveHidden(hidden: Set<string>) {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
}

type ShapeType = 'rect' | 'oval' | 'circle' | 'square';

interface TablePosition {
    x: number;
    y: number;
    w: number;
    h: number;
    shape: ShapeType;
}

type LayoutMap = Record<string, TablePosition>;

function loadLayout(): LayoutMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveLayoutToStorage(layout: LayoutMap) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

const DEFAULT_SIZE = 120;
const MIN_SIZE = 70;
const MAX_SIZE = 300;
const GRID_SIZE = 20;

function snapToGrid(val: number) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

function autoLayout(tables: Table[], canvasW: number, _canvasH: number): LayoutMap {
    const map: LayoutMap = {};
    const cols = Math.ceil(Math.sqrt(tables.length));
    const cellW = Math.max(160, canvasW / cols);
    const cellH = 160;
    tables.forEach((t, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        map[t.id] = {
            x: col * cellW + 20,
            y: row * cellH + 20,
            w: DEFAULT_SIZE,
            h: DEFAULT_SIZE,
            shape: 'square',
        };
    });
    return map;
}

// ─── Auto-push: shift nearby tables away when one grows ───────────────────────
function autoPushNeighbors(layout: LayoutMap, changedId: string, oldW: number, oldH: number): LayoutMap {
    const changed = layout[changedId];
    if (!changed) return layout;

    const dw = changed.w - oldW;
    const dh = changed.h - oldH;
    if (dw <= 0 && dh <= 0) return layout;

    const MARGIN = 8;
    const result = { ...layout };

    for (const id of Object.keys(result)) {
        if (id === changedId) continue;
        const other = { ...result[id] };
        const changedRight = changed.x + changed.w + MARGIN;
        const changedBottom = changed.y + changed.h + MARGIN;

        // Check horizontal overlap
        const overlapY = other.y + other.h > changed.y && other.y < changed.y + changed.h;
        // Check vertical overlap
        const overlapX = other.x + other.w > changed.x && other.x < changed.x + changed.w;

        if (overlapY && other.x >= changed.x && other.x < changedRight) {
            // Push right
            other.x = Math.max(other.x, changedRight);
        }
        if (overlapX && other.y >= changed.y && other.y < changedBottom) {
            // Push down
            other.y = Math.max(other.y, changedBottom);
        }

        result[id] = other;
    }

    return result;
}

// ─── Shape presets ────────────────────────────────────────────────────────────
const SHAPE_OPTIONS: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
    { type: 'square', label: 'Kare', icon: <Square className="w-5 h-5" /> },
    { type: 'rect', label: 'Dikdörtgen', icon: <RectangleHorizontal className="w-5 h-5" /> },
    { type: 'oval', label: 'Oval', icon: <Circle className="w-5 h-5" style={{ transform: 'scaleX(1.4)' }} /> },
    { type: 'circle', label: 'Yuvarlak', icon: <Circle className="w-5 h-5" /> },
];

const SIZE_PRESETS = [
    { label: 'S', w: 90, h: 90 },
    { label: 'M', w: 120, h: 120 },
    { label: 'L', w: 160, h: 160 },
    { label: 'XL', w: 210, h: 210 },
    { label: 'Geniş', w: 240, h: 120 },
];

// ─── PIN Modal ───────────────────────────────────────────────────────────────
function PinModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);

    const handleDigit = (d: string) => {
        if (pin.length >= 4) return;
        const next = pin + d;
        setPin(next);
        setError(false);
        if (next.length === 4) {
            if (next === DEFAULT_PIN) {
                setTimeout(onSuccess, 150);
            } else {
                setTimeout(() => { setPin(''); setError(true); }, 400);
            }
        }
    };

    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[48px] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 relative border border-white/50">
                {/* Header with Blue Gradient */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 flex items-center gap-6 text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl opacity-50" />

                    <div className="w-16 h-16 bg-white/20 rounded-[24px] flex items-center justify-center backdrop-blur-md border border-white/20 shadow-xl relative z-10 transition-transform hover:scale-105 duration-500">
                        <Lock className="w-8 h-8 font-black" />
                    </div>

                    <div className="relative z-10 flex-1">
                        <h3 className="text-2xl font-black uppercase tracking-tighter leading-tight mb-1">Yetki Kontrolü</h3>
                        <p className="text-[10px] text-blue-100 font-black uppercase tracking-[0.3em] opacity-70">ERİŞİM İÇİN PIN GİRİN</p>
                    </div>
                </div>

                <div className={cn(
                    "p-10 flex flex-col items-center gap-10 transition-all",
                    error && "animate-shake"
                )}>
                    {/* PIN Display Dots */}
                    <div className="flex justify-center gap-6">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className={cn(
                                    "w-6 h-6 rounded-full border-2 transition-all duration-500 flex items-center justify-center shadow-inner",
                                    pin.length > i
                                        ? "bg-blue-600 border-blue-600 scale-125 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                                        : "border-slate-100 bg-slate-50"
                                )}
                            >
                                {pin.length > i && <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm" />}
                            </div>
                        ))}
                    </div>

                    {/* Numeric Keypad Grid - Modern Flat Style */}
                    <div className="grid grid-cols-3 gap-4 w-full">
                        {digits.map((d, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    if (d === null) return;
                                    if (d === 'del') { setPin(p => p.slice(0, -1)); setError(false); }
                                    else handleDigit(String(d));
                                }}
                                disabled={d === null}
                                className={cn(
                                    "w-full aspect-square rounded-[32px] bg-slate-50 hover:bg-slate-100 border border-slate-200/50 shadow-sm active:scale-95 transition-all flex items-center justify-center text-3xl font-black text-slate-800",
                                    d === null && "opacity-0 pointer-events-none",
                                    d === 'del' && "bg-red-50 hover:bg-red-100 border-red-100 text-red-500"
                                )}
                            >
                                {d === 'del' ? <X className="w-6 h-6" /> : d}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-red-500 font-black text-[10px] uppercase tracking-[0.3em] transition-all hover:tracking-[0.4em] active:scale-95"
                    >
                        ✕ İPTAL ET
                    </button>
                </div>

                {/* Footer Brand Line */}
                <div className="py-4 bg-slate-50 flex justify-center border-t border-slate-100 opacity-20 select-none">
                    <span className="text-[8px] font-black text-slate-900 uppercase tracking-[0.5em]">RETAILEX SECURE ACCESS</span>
                </div>
            </div>
        </div>
    );
}

// ─── Table Settings Popup ─────────────────────────────────────────────────────
function TableSettingsPopup({
    table, position, onClose, onChangeShape, onChangeSize
}: {
    table: Table;
    position: TablePosition;
    onClose: () => void;
    onChangeShape: (shape: ShapeType) => void;
    onChangeSize: (w: number, h: number) => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-slate-900 rounded-[32px] p-8 w-[400px] border border-white/10 shadow-2xl shadow-black/50">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-white font-black text-xl tracking-tight">Masa {table.number}</h3>
                        <p className="text-white/40 font-bold text-[11px] uppercase tracking-widest mt-1">Konfigürasyon Ayarları</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                        <X className="w-5 h-5 text-white/50" />
                    </button>
                </div>

                {/* Shape */}
                <div className="mb-8 p-6 bg-white/5 rounded-[24px] border border-white/5">
                    <span className="text-white/30 font-black text-[10px] uppercase tracking-[0.2em] mb-4 block">GEOMETRİK FORM</span>
                    <div className="grid grid-cols-4 gap-3">
                        {SHAPE_OPTIONS.map(opt => (
                            <button
                                key={opt.type}
                                onClick={() => onChangeShape(opt.type)}
                                className={cn(
                                    "flex flex-col items-center gap-3 p-4 rounded-2xl transition-all border-2 active:scale-90",
                                    position.shape === opt.type
                                        ? "bg-blue-600/20 border-blue-500 text-blue-400 shadow-lg shadow-blue-500/10"
                                        : "bg-white/5 border-transparent text-white/40 hover:bg-white/10"
                                )}
                            >
                                <div className={cn("transition-transform", position.shape === opt.type ? "scale-110" : "")}>
                                    {opt.icon}
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-tight">{opt.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Size */}
                <div className="p-6 bg-white/5 rounded-[24px] border border-white/5">
                    <span className="text-white/30 font-black text-[10px] uppercase tracking-[0.2em] mb-4 block">BOYUT ÖLÇEĞİ</span>
                    <div className="grid grid-cols-5 gap-2.5">
                        {SIZE_PRESETS.map(preset => {
                            const isActive = Math.abs(position.w - preset.w) < 15 && Math.abs(position.h - preset.h) < 15;
                            return (
                                <button
                                    key={preset.label}
                                    onClick={() => onChangeSize(preset.w, preset.h)}
                                    className={cn(
                                        "flex flex-col items-center justify-center p-3 rounded-2xl transition-all border-2 active:scale-95",
                                        isActive
                                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                                            : "bg-white/5 border-transparent text-white/30 hover:bg-white/10"
                                    )}
                                >
                                    <span className="text-[14px] font-black">{preset.label}</span>
                                    <span className="text-[8px] font-bold opacity-60 tracking-tighter mt-1">{preset.w}×{preset.h}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-8 py-4 bg-white text-slate-900 font-black text-[13px] uppercase tracking-[0.1em] rounded-2xl hover:bg-blue-50 transition-colors shadow-lg active:scale-95"
                >
                    Tamam
                </button>
            </div>
        </div>
    );
}

// ─── Status Config (Masalar-identical) ────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; shadow: string }> = {
    empty: { bg: '#10b981', shadow: 'shadow-emerald-500/20' },
    occupied: { bg: '#3b82f6', shadow: 'shadow-blue-500/30' },
    billing: { bg: '#ef4444', shadow: 'shadow-red-500/40' },
    reserved: { bg: '#f59e0b', shadow: 'shadow-amber-500/20' },
    cleaning: { bg: '#64748b', shadow: 'shadow-slate-500/20' },
};

const STATUS_LABELS: Record<string, string> = {
    empty: 'Boş', occupied: 'Dolu', billing: 'Hesap', reserved: 'Rezerve', cleaning: 'Temizlik',
};

function getShapeRadius(shape: ShapeType): string {
    switch (shape) {
        case 'oval': return '50%';
        case 'circle': return '50%';
        case 'rect': return '2rem';
        case 'square': return '1.4rem';
        default: return '1.4rem';
    }
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function TableTimer({ startTime }: { startTime: string }) {
    const [elapsed, setElapsed] = React.useState('');
    React.useEffect(() => {
        const update = () => {
            const diff = Math.max(0, Date.now() - new Date(startTime).getTime());
            const m = Math.floor(diff / 60000);
            const h = Math.floor(m / 60);
            setElapsed(h > 0 ? `${h}:${(m % 60).toString().padStart(2, '0')}` : `${m}dk`);
        };
        update();
        const iv = setInterval(update, 30000);
        return () => clearInterval(iv);
    }, [startTime]);
    return <span className="text-[10px] font-black">{elapsed}</span>;
}

// ─── Draggable Table Card (Masalar-identical look) ────────────────────────────
function DraggableTableCard({
    table, position, unlocked, onDragEnd, onResize, onDoubleClick, isSelected
}: {
    table: Table;
    position: TablePosition;
    unlocked: boolean;
    onDragEnd: (id: string, x: number, y: number) => void;
    onResize: (id: string, w: number, h: number) => void;
    onDoubleClick: (table: Table) => void;
    isSelected?: boolean;
}) {
    const cardRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const resizing = useRef(false);
    const startMouse = useRef({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const startSize = useRef({ w: 0, h: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    // --- Hint Logic ---
    const [hint, setHint] = useState<string | null>(null);
    useEffect(() => {
        if (!table || table.status === 'empty') { setHint(null); return; }

        const updateHint = () => {
            const nowTime = Date.now();
            const elapsedMs = table.startTime ? nowTime - new Date(table.startTime).getTime() : 0;
            const elapsedMin = Math.floor(elapsedMs / 60000);

            if (table.status === 'occupied') {
                if (!table.total || table.total === 0) {
                    if (elapsedMin > 10) setHint('SİPARİŞ ALINMADI');
                    else setHint(null);
                } else if (table.orders.some(o => o.status === 'pending')) {
                    setHint('MUTFAĞA GÖNDER!');
                } else if (elapsedMin > 45) {
                    setHint('UZUN SÜRELİ OTURUM');
                } else {
                    setHint(null);
                }
            } else if (table.status === 'billing') {
                if (elapsedMin > 5) setHint('ÖDEME BEKLİYOR');
                else setHint(null);
            } else {
                setHint(null);
            }
        };

        updateHint();
        const id = setInterval(updateHint, 10000);
        return () => clearInterval(id);
    }, [table.status, table.total, table.orders, table.startTime]);

    const onPointerDown = (e: React.PointerEvent) => {
        if (!unlocked) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
            resizing.current = true;
            setIsResizing(true);
            startMouse.current = { x: e.clientX, y: e.clientY };
            startSize.current = { w: position.w, h: position.h };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
        }
        dragging.current = true;
        setIsDragging(true);
        startMouse.current = { x: e.clientX, y: e.clientY };
        startPos.current = { x: position.x, y: position.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (resizing.current && cardRef.current) {
            const dx = e.clientX - startMouse.current.x;
            const dy = e.clientY - startMouse.current.y;
            let nw = Math.min(MAX_SIZE, Math.max(MIN_SIZE, startSize.current.w + dx));
            let nh = Math.min(MAX_SIZE, Math.max(MIN_SIZE, startSize.current.h + dy));
            if (position.shape === 'circle' || position.shape === 'square') {
                const avg = Math.max(nw, nh); nw = avg; nh = avg;
            }
            cardRef.current.style.width = `${nw}px`;
            cardRef.current.style.height = `${nh}px`;
            return;
        }
        if (!dragging.current || !cardRef.current) return;
        const dx = e.clientX - startMouse.current.x;
        const dy = e.clientY - startMouse.current.y;
        cardRef.current.style.left = `${startPos.current.x + dx}px`;
        cardRef.current.style.top = `${startPos.current.y + dy}px`;
    };

    const onPointerUp = (e: React.PointerEvent) => {
        if (resizing.current) {
            resizing.current = false;
            setIsResizing(false);
            const dx = e.clientX - startMouse.current.x;
            const dy = e.clientY - startMouse.current.y;
            let nw = Math.min(MAX_SIZE, Math.max(MIN_SIZE, startSize.current.w + dx));
            let nh = Math.min(MAX_SIZE, Math.max(MIN_SIZE, startSize.current.h + dy));
            if (position.shape === 'circle' || position.shape === 'square') {
                const avg = Math.max(nw, nh); nw = avg; nh = avg;
            }
            onResize(table.id, nw, nh);
            return;
        }
        if (!dragging.current) return;
        dragging.current = false;
        setIsDragging(false);
        const dx = e.clientX - startMouse.current.x;
        const dy = e.clientY - startMouse.current.y;
        onDragEnd(table.id, startPos.current.x + dx, startPos.current.y + dy);
    };

    const onResizeHandleDown = (e: React.PointerEvent) => {
        if (!unlocked) return;
        e.preventDefault();
        e.stopPropagation();
        resizing.current = true;
        setIsResizing(true);
        startMouse.current = { x: e.clientX, y: e.clientY };
        startSize.current = { w: position.w, h: position.h };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const config = STATUS_CONFIG[table.status] || STATUS_CONFIG.empty;
    const borderRadius = getShapeRadius(position.shape || 'square');
    const scale = Math.min(position.w, position.h) / 120;

    return (
        <div
            ref={cardRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => !unlocked && onDoubleClick(table)}
            onDoubleClick={() => { /* Çift tıklama davranışı, onClick'e taşındı ama mobil uyum vs için boş tutulabilir */ }}
            style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                width: position.w,
                height: position.h,
                backgroundColor: config.bg,
                touchAction: 'none',
                cursor: unlocked ? (isResizing ? 'nwse-resize' : isDragging ? 'grabbing' : 'grab') : 'pointer',
                zIndex: isDragging || isResizing ? 100 : 1,
                borderRadius,
                border: isSelected ? '4px solid #fbbf24' : '1px solid rgba(255,255,255,0.2)',
                boxShadow: isDragging
                    ? `0 30px 60px rgba(0,0,0,0.4), 0 0 0 4px rgba(255,255,255,0.3), 0 0 20px ${config.bg}60`
                    : isSelected
                        ? '0 0 0 4px rgba(251,191,36,0.3), 0 8px 32px rgba(0,0,0,0.3)'
                        : '0 8px 24px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.2)',
                transform: isDragging ? 'scale(1.08) perspective(1000px) rotateX(10deg)' : 'scale(1)',
                transition: isDragging ? 'box-shadow 0.15s, transform 0.15s' : 'box-shadow 0.3s, transform 0.3s, border-color 0.2s',
                overflow: 'hidden',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: `${Math.round(10 * scale)}px`,
                color: 'white',
            }}
            className={cn(config.shadow, 'ring-1 ring-black/10 group')}
        >
            {/* Premium Glossy/Glass effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-black/10 pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent pointer-events-none border-b border-white/5" />

            {/* Header */}
            <div className="flex justify-between items-start w-full pointer-events-none relative z-10">
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-xl px-2.5 py-1 rounded-full border border-white/10 shadow-lg">
                    <History className="text-white/60" style={{ width: Math.round(11 * scale), height: Math.round(11 * scale) }} />
                    <span className="font-black uppercase tracking-tighter" style={{ fontSize: Math.round(10 * scale) }}>
                        {table.total && table.total > 0 ? (table.total / 1000).toFixed(1) + 'k' : '0'}
                    </span>
                </div>
                {table.status === 'occupied' && table.startTime && (
                    <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-xl px-2.5 py-1 rounded-full border border-white/20 shadow-lg animate-pulse">
                        <Clock className="text-white" style={{ width: Math.round(11 * scale), height: Math.round(11 * scale) }} />
                        <TableTimer startTime={table.startTime} />
                    </div>
                )}
            </div>

            {/* Number */}
            <div className="flex flex-col items-center justify-center flex-1 pointer-events-none relative z-10 py-2">
                {hint ? (
                    <div className="flex flex-col items-center animate-in zoom-in duration-300">
                        <span className="font-black tracking-tighter text-amber-400 drop-shadow-lg text-center leading-none" style={{ fontSize: Math.round(14 * scale) }}>
                            {hint}
                        </span>
                        <div className="mt-2 text-white/40 font-bold" style={{ fontSize: Math.round(24 * scale) }}>{table.number}</div>
                    </div>
                ) : (
                    <>
                        <span className="font-black tracking-tighter leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]" style={{ fontSize: Math.round(36 * scale) }}>
                            {table.number}
                        </span>
                        <div className="px-2.5 py-0.5 bg-black/20 backdrop-blur-sm rounded-full mt-2 border border-white/5">
                            <span className="font-black uppercase tracking-[0.2em] italic opacity-90" style={{ fontSize: Math.round(8 * scale) }}>
                                {table.location}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center w-full pointer-events-none relative z-10 pt-1">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/30 backdrop-blur-md rounded-2xl border border-white/10 shadow-inner">
                    <Users className="text-white/70" style={{ width: Math.round(13 * scale), height: Math.round(13 * scale) }} />
                    <span className="font-black drop-shadow-md text-white" style={{ fontSize: Math.round(11 * scale) }}>{table.seats}</span>
                </div>
                {table.total && table.total > 0 && (
                    <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-xl px-3 py-1 rounded-2xl border border-white/20 shadow-lg">
                        <span className="font-black tracking-tighter text-white" style={{ fontSize: Math.round(10 * scale) }}>
                            {fmt(table.total / 100)}
                        </span>
                    </div>
                )}
            </div>

            {/* Drag hint overlay */}
            {unlocked && !isDragging && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 backdrop-blur-md rounded-full p-2 border border-white/20">
                    <Move className="w-5 h-5 text-white/50" />
                </div>
            )}

            {/* Resize handle */}
            {unlocked && (
                <div
                    onPointerDown={onResizeHandleDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className="absolute bottom-[-2px] right-[-2px] w-7 h-7 bg-blue-600 rounded-tl-2xl rounded-br-[inherit] border-t-2 border-l-2 border-white shadow-xl cursor-nwse-resize flex items-center justify-center z-30 transform hover:scale-110 active:scale-90 transition-transform"
                >
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                </div>
            )}
        </div>
    );
}

// ─── Table List Panel ─────────────────────────────────────────────────────────
function TableListPanel({
    tables,
    layout,
    selectedId,
    hiddenIds,
    onSelect,
    onDoubleClick,
    onToggleHidden,
    onClose,
}: {
    tables: Table[];
    layout: LayoutMap;
    selectedId: string | null;
    hiddenIds: Set<string>;
    onSelect: (table: Table) => void;
    onDoubleClick: (table: Table) => void;
    onToggleHidden: (id: string) => void;
    onClose: () => void;
}) {
    const visibleTables = tables.filter(t => !hiddenIds.has(t.id));
    const hiddenTables = tables.filter(t => hiddenIds.has(t.id));

    return (
        <div className="w-[320px] h-full bg-slate-900 border-l border-white/5 flex flex-col shrink-0 overflow-hidden shadow-2xl relative z-40">
            {/* Decorative bg light */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl pointer-events-none" />

            {/* Panel header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 relative z-10">
                <div>
                    <span className="text-white font-black text-[13px] uppercase tracking-[0.15em]">Masa Listesi</span>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full">
                            <Eye className="w-3 h-3 text-emerald-500" />
                            <span className="text-[9px] font-black text-emerald-500 uppercase">{visibleTables.length}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-full">
                            <EyeOff className="w-3 h-3 text-slate-500" />
                            <span className="text-[9px] font-black text-slate-500 uppercase">{hiddenTables.length}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-90"
                >
                    <X className="w-5 h-5 text-white/50" />
                </button>
            </div>

            {/* Table list */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative z-10">
                {/* Visible tables section */}
                {visibleTables.length > 0 && (
                    <div className="mb-6 space-y-2">
                        <div className="px-2 mb-3 flex items-center gap-2">
                            <div className="h-[1px] flex-1 bg-emerald-500/20" />
                            <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest whitespace-nowrap">Krokidekiler</span>
                            <div className="h-[1px] flex-1 bg-emerald-500/20" />
                        </div>
                        {visibleTables.map(table => {
                            const config = STATUS_CONFIG[table.status] || STATUS_CONFIG.empty;
                            const pos = layout[table.id];
                            const shapeLabel = SHAPE_OPTIONS.find(o => o.type === pos?.shape)?.label || 'Kare';
                            const isActive = selectedId === table.id;

                            return (
                                <div
                                    key={table.id}
                                    onClick={() => {
                                        if (table.status === 'empty') {
                                            onSelect(table); // Seç (modal vesaire için)
                                        } else {
                                            onDoubleClick(table); // Direkt içine gir
                                        }
                                    }}
                                    className={cn(
                                        "flex items-center gap-4 p-4 rounded-[20px] transition-all cursor-pointer border group active:scale-[0.98]",
                                        isActive
                                            ? "bg-blue-600/10 border-blue-500/50 shadow-lg shadow-blue-500/5"
                                            : "bg-white/2 hover:bg-white/5 border-transparent"
                                    )}
                                >
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: config.bg, boxShadow: `0 0 10px ${config.bg}60` }}
                                    />

                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-black text-[14px]">Masa {table.number}</div>
                                        <div className="flex items-center gap-2 mt-0.5 opacity-40">
                                            <span className="text-[9px] font-bold uppercase">{shapeLabel}</span>
                                            <span className="w-1 h-1 rounded-full bg-white/50" />
                                            <span className="text-[9px] font-bold">{pos?.w}×{pos?.h}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); onToggleHidden(table.id); }}
                                        className="w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors group-hover:scale-110 active:scale-90"
                                    >
                                        <Minus className="w-4 h-4 text-red-400" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Hidden tables section */}
                {hiddenTables.length > 0 && (
                    <div className="space-y-2">
                        <div className="px-2 mb-3 flex items-center gap-2">
                            <div className="h-[1px] flex-1 bg-white/5" />
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest whitespace-nowrap">Gizli Masalar</span>
                            <div className="h-[1px] flex-1 bg-white/5" />
                        </div>
                        {hiddenTables.map(table => {
                            const config = STATUS_CONFIG[table.status] || STATUS_CONFIG.empty;
                            return (
                                <div
                                    key={table.id}
                                    className="flex items-center gap-4 p-4 rounded-[20px] bg-white/2 opacity-40 hover:opacity-100 transition-all border border-transparent"
                                >
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: config.bg }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-black text-[14px]">Masa {table.number}</div>
                                        <div className="text-[9px] font-bold uppercase opacity-60">Beklemede</div>
                                    </div>

                                    <button
                                        onClick={() => onToggleHidden(table.id)}
                                        className="w-9 h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center transition-all hover:scale-110 active:scale-90"
                                    >
                                        <Plus className="w-4 h-4 text-emerald-400" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer shadow fade */}
            <div className="h-8 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none absolute bottom-0 inset-x-0" />
        </div>
    );
}

// ─── Main KrokiView ───────────────────────────────────────────────────────────
interface KrokiViewProps {
    activeFloor: string;
}
export function KrokiView({ activeFloor }: KrokiViewProps) {
    const { tables, mergeTables, moveTable } = useRestaurantStore();
    const [selectionMode, setSelectionMode] = useState<'merge' | 'transfer' | null>(null);
    const [sourceTableId, setSourceTableId] = useState<string | null>(null);

    const handleTableClick = (table: Table) => {
        if (!selectionMode) return;
        if (!sourceTableId) {
            if (table.status === 'empty') return;
            setSourceTableId(table.id);
        } else {
            if (sourceTableId === table.id) {
                setSourceTableId(null);
                return;
            }
            if (selectionMode === 'merge') mergeTables(sourceTableId, table.id);
            else moveTable(sourceTableId, table.id);
            setSelectionMode(null);
            setSourceTableId(null);
        }
    };

    const canvasRef = useRef<HTMLDivElement>(null);

    const [unlocked, setUnlocked] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [layout, setLayout] = useState<LayoutMap>({});
    const [saved, setSaved] = useState(false);
    const [settingsTable, setSettingsTable] = useState<Table | null>(null);
    const [showList, setShowList] = useState(false);
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [showGrid, setShowGrid] = useState(true);
    const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => loadHidden());

    const toggleHidden = useCallback((id: string) => {
        setHiddenIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            saveHidden(next);
            return next;
        });
    }, []);

    const floorTables = activeFloor === 'Tümü' ? tables : tables.filter(t => t.location === activeFloor);

    // Load layout: try DB first, fallback to localStorage
    useEffect(() => {
        let cancelled = false;

        async function loadFromDB() {
            try {
                const dbResult = await RestaurantService.getKrokiLayout(getStoreId(), activeFloor);
                if (!cancelled && dbResult) {
                    const migrated = { ...dbResult.layoutData } as LayoutMap;
                    for (const key of Object.keys(migrated)) {
                        if (!migrated[key].w) migrated[key].w = DEFAULT_SIZE;
                        if (!migrated[key].h) migrated[key].h = DEFAULT_SIZE;
                        if (!migrated[key].shape) migrated[key].shape = 'square';
                    }

                    const missing = floorTables.some(t => !migrated[t.id]);
                    const canvas = canvasRef.current;
                    const cw = canvas?.offsetWidth || 1200;
                    const ch = canvas?.offsetHeight || 800;

                    if (missing) {
                        const auto = autoLayout(floorTables, cw, ch);
                        setLayout({ ...migrated, ...auto });
                    } else {
                        setLayout(migrated);
                    }

                    // Sync hidden tables from DB
                    if (dbResult.hiddenTables && dbResult.hiddenTables.length > 0) {
                        setHiddenIds(new Set(dbResult.hiddenTables));
                    }

                    // Also sync to localStorage as cache
                    saveLayoutToStorage(migrated);
                    saveHidden(new Set(dbResult.hiddenTables || []));
                    return;
                }
            } catch {
                // DB not available, fall through to localStorage
            }

            // Fallback: localStorage
            if (!cancelled) {
                const stored = loadLayout();
                const canvas = canvasRef.current;
                const w = canvas?.offsetWidth || 1200;
                const h = canvas?.offsetHeight || 800;

                const migrated = { ...stored };
                for (const key of Object.keys(migrated)) {
                    if (!migrated[key].w) migrated[key].w = DEFAULT_SIZE;
                    if (!migrated[key].h) migrated[key].h = DEFAULT_SIZE;
                    if (!migrated[key].shape) migrated[key].shape = 'square';
                }

                const missing = floorTables.some(t => !migrated[t.id]);
                if (missing) {
                    const auto = autoLayout(floorTables, w, h);
                    setLayout({ ...migrated, ...auto });
                } else {
                    setLayout(migrated);
                }
            }
        }

        loadFromDB();
        return () => { cancelled = true; };
    }, [activeFloor, tables.length]);

    const handleDragEnd = useCallback((id: string, x: number, y: number) => {
        setLayout(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                x: snapToGrid(Math.max(0, x)),
                y: snapToGrid(Math.max(0, y))
            }
        }));
    }, []);

    const handleResize = useCallback((id: string, w: number, h: number) => {
        setLayout(prev => {
            const oldPos = prev[id];
            const updated = { ...prev, [id]: { ...oldPos, w, h } };
            // Auto-push neighbors
            return autoPushNeighbors(updated, id, oldPos.w, oldPos.h);
        });
    }, []);

    const handleChangeShape = useCallback((shape: ShapeType) => {
        if (!settingsTable) return;
        setLayout(prev => {
            const existing = prev[settingsTable.id];
            if (!existing) return prev;
            let { w, h } = existing;
            if (shape === 'circle' || shape === 'square') {
                const avg = Math.round((w + h) / 2); w = avg; h = avg;
            }
            const updated = { ...prev, [settingsTable.id]: { ...existing, shape, w, h } };
            return autoPushNeighbors(updated, settingsTable.id, existing.w, existing.h);
        });
    }, [settingsTable]);

    const handleChangeSize = useCallback((w: number, h: number) => {
        if (!settingsTable) return;
        setLayout(prev => {
            const existing = prev[settingsTable.id];
            if (!existing) return prev;
            if (existing.shape === 'circle' || existing.shape === 'square') {
                const avg = Math.round((w + h) / 2);
                const updated = { ...prev, [settingsTable.id]: { ...existing, w: avg, h: avg } };
                return autoPushNeighbors(updated, settingsTable.id, existing.w, existing.h);
            }
            const updated = { ...prev, [settingsTable.id]: { ...existing, w, h } };
            return autoPushNeighbors(updated, settingsTable.id, existing.w, existing.h);
        });
    }, [settingsTable]);

    const handleListSelect = useCallback((table: Table) => {
        setSelectedTableId(table.id);
        setSettingsTable(table);
    }, []);

    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        // Always save to localStorage as cache
        saveLayoutToStorage(layout);
        saveHidden(hiddenIds);
        setSaving(true);

        try {
            // Save to database
            await RestaurantService.saveKrokiLayout(
                getStoreId(),
                activeFloor,
                layout,
                [...hiddenIds]
            );
            setSaved(true);
        } catch {
            // DB failed, localStorage is still saved
            setSaved(true);
            console.warn('Kroki layout DB kayıt hatası, localStorage\'a kaydedildi.');
        }

        setSaving(false);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = () => {
        const canvas = canvasRef.current;
        const w = canvas?.offsetWidth || 1200;
        const h = canvas?.offsetHeight || 800;
        const auto = autoLayout(floorTables, w, h);
        const snappedAuto = { ...auto };
        Object.keys(snappedAuto).forEach(id => {
            snappedAuto[id].x = snapToGrid(snappedAuto[id].x);
            snappedAuto[id].y = snapToGrid(snappedAuto[id].y);
        });
        const stored = loadLayout();
        setLayout({ ...stored, ...snappedAuto });
    };

    const handleSmartAlign = () => {
        setLayout(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(id => {
                next[id] = {
                    ...next[id],
                    x: snapToGrid(next[id].x),
                    y: snapToGrid(next[id].y)
                };
            });
            return next;
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f1f3f5' }}>
            {/* Toolbar */}
            <div className="flex items-center gap-4 px-6 py-3.5 bg-slate-900 border-b border-white/5 shrink-0 relative overflow-hidden backdrop-blur-md">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Maximize2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <span className="text-white font-black text-[14px] tracking-tight block">KROKİ DÜZENİ</span>
                        <span className="text-white/40 font-bold text-[10px] uppercase tracking-widest">{activeFloor} Yerleşimi</span>
                    </div>
                </div>

                <div className="flex-1" />

                {unlocked && (
                    <div className="flex items-center gap-2 relative z-10 animate-in fade-in slide-in-from-right-4 duration-300">
                        <button
                            onClick={() => setShowList(v => !v)}
                            className={cn(
                                "flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase transition-all border active:scale-90 shadow-md",
                                showList
                                    ? "bg-blue-600 text-white border-blue-500 shadow-blue-500/20"
                                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/15 hover:text-white"
                            )}
                        >
                            <List className="w-4 h-4" />
                            Liste
                        </button>

                        <button
                            onClick={() => setShowGrid(!showGrid)}
                            className={cn(
                                "flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase transition-all border active:scale-90",
                                showGrid
                                    ? "bg-white/15 text-white border-white/20"
                                    : "bg-white/5 text-white/40 border-white/10"
                            )}
                        >
                            <Users className="w-4 h-4" />
                            Izgara
                        </button>

                        <button
                            onClick={handleSmartAlign}
                            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase transition-all bg-white/5 text-white/80 border border-white/10 hover:bg-white/15 hover:text-white active:scale-90"
                        >
                            <Maximize2 className="w-4 h-4" />
                            Hizala
                        </button>

                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase transition-all bg-white/5 text-white/60 border border-white/10 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 active:scale-90"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Sıfırla
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={cn(
                                "flex items-center gap-2.5 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase transition-all active:scale-90 disabled:opacity-50 shadow-xl",
                                saved ? "bg-emerald-500 text-white" : "bg-blue-500 text-white shadow-blue-500/30"
                            )}
                        >
                            {saving ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Kaydediliyor...' : saved ? 'Kaydedildi!' : 'Değişiklikleri Kaydet'}
                        </button>
                    </div>
                )}

                {/* Operational Actions (Merging/Transferring) */}
                {!unlocked && (
                    <div className="flex items-center gap-2 relative z-10 transition-all duration-300">
                        <div className="flex items-center gap-1 bg-white/5 backdrop-blur-md p-1 rounded-2xl border border-white/10">
                            <button
                                onClick={() => { setSelectionMode(selectionMode === 'merge' ? null : 'merge'); setSourceTableId(null); }}
                                className={cn(
                                    "flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[11px] font-black tracking-tight transition-all active:scale-95",
                                    selectionMode === 'merge' ? "bg-amber-500 text-white shadow-lg mx-1" : "text-white/60 hover:text-white"
                                )}
                            >
                                <UtensilsCrossed className="w-4 h-4" /> BİRLEŞTİR
                            </button>
                            <button
                                onClick={() => { setSelectionMode(selectionMode === 'transfer' ? null : 'transfer'); setSourceTableId(null); }}
                                className={cn(
                                    "flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[11px] font-black tracking-tight transition-all active:scale-95",
                                    selectionMode === 'transfer' ? "bg-blue-500 text-white shadow-lg mx-1" : "text-white/60 hover:text-white"
                                )}
                            >
                                <Move className="w-4 h-4" /> TAŞI
                            </button>
                        </div>
                    </div>
                )}

                {selectionMode && (
                    <div className="mx-4 flex items-center gap-3 px-6 py-2.5 bg-amber-500 text-white rounded-2xl animate-bounce shadow-xl shadow-amber-500/20 relative z-20">
                        <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                        <span className="text-[11px] font-black uppercase tracking-wider">
                            {!sourceTableId ? "KAYNAK MASAYI SEÇİN" : "HEDEF MASAYI SEÇİN"}
                        </span>
                        <button onClick={() => { setSelectionMode(null); setSourceTableId(null); }} className="ml-2 hover:rotate-90 transition-transform"><X className="w-4 h-4" /></button>
                    </div>
                )}

                <button
                    onClick={() => unlocked ? setUnlocked(false) : setShowPin(true)}
                    className={cn(
                        "flex items-center gap-2.5 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase transition-all border active:scale-95 shadow-lg relative z-10",
                        unlocked
                            ? "bg-amber-500/20 text-amber-500 border-amber-500/30 hover:bg-amber-500/30"
                            : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                    )}
                >
                    {unlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    {unlocked ? "Düzenlemeyi Bitir" : "Düzeni Düzenle"}
                </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 px-6 py-2.5 bg-white border-b border-slate-100 shrink-0 overflow-x-auto no-scrollbar shadow-sm">
                {[
                    { color: '#10b981', label: 'Boş' },
                    { color: '#3b82f6', label: 'Dolu' },
                    { color: '#ef4444', label: 'Hesap' },
                    { color: '#f59e0b', label: 'Rezerve' },
                    { color: '#94a3b8', label: 'Temizlik' },
                ].map(item => (
                    <div key={item.label} className="flex items-center gap-2.5 whitespace-nowrap">
                        <div
                            className="w-3.5 h-3.5 rounded-full shadow-lg"
                            style={{ backgroundColor: item.color, boxShadow: `0 4px 8px ${item.color}40` }}
                        />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</span>
                    </div>
                ))}

                <div className="flex-1" />

                <div className="flex items-center gap-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    {unlocked ? (
                        <div className="flex items-center gap-4 bg-amber-50 px-4 py-1.5 rounded-full border border-amber-100/50 text-amber-700">
                            <span className="flex items-center gap-1.5"><Move className="w-3.5 h-3.5" /> SÜRÜKLE</span>
                            <span className="w-1 h-1 rounded-full bg-amber-300" />
                            <span className="flex items-center gap-1.5"><Maximize2 className="w-3.5 h-3.5" /> SHIFT + SÜRÜKLE BÜYÜT</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 opacity-50" />
                            DÜZENLEMEK İÇİN KİLİDİ AÇIN
                        </div>
                    )}
                </div>
            </div>

            {/* Main area: Canvas + optional List Panel */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Canvas */}
                <div
                    ref={canvasRef}
                    className="flex-1 relative overflow-auto bg-slate-100 min-h-[600px] shadow-inner"
                    style={{
                        backgroundImage: showGrid
                            ? `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm1 1h38v38H1V1z' fill='%23000' fill-opacity='.02' fill-rule='evenodd'/%3E%3C/svg%3E"), radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)`
                            : 'none',
                        backgroundSize: `40px 40px, ${GRID_SIZE}px ${GRID_SIZE}px`,
                    }}
                >
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                        <span className="text-[180px] font-black text-black/[0.03] uppercase tracking-[0.1em] blur-[1px]">
                            {activeFloor}
                        </span>
                    </div>

                    {floorTables.filter(t => !hiddenIds.has(t.id)).map(table => {
                        const pos = layout[table.id] ?? { x: 20, y: 20, w: DEFAULT_SIZE, h: DEFAULT_SIZE, shape: 'square' as ShapeType };
                        return (
                            <DraggableTableCard
                                key={table.id}
                                table={table}
                                position={pos}
                                unlocked={unlocked}
                                isSelected={sourceTableId === table.id}
                                onDragEnd={handleDragEnd}
                                onResize={handleResize}
                                onDoubleClick={selectionMode ? handleTableClick : (t) => { setSettingsTable(t); setSelectedTableId(t.id); }}
                            />
                        );
                    })}
                </div>

                {/* Table List Panel (slides in when unlocked + showList) */}
                {unlocked && showList && (
                    <TableListPanel
                        tables={floorTables}
                        layout={layout}
                        selectedId={selectedTableId}
                        hiddenIds={hiddenIds}
                        onSelect={handleListSelect}
                        onDoubleClick={(t) => {
                            if (selectionMode) handleTableClick(t);
                            else { setSettingsTable(t); setSelectedTableId(t.id); }
                        }}
                        onToggleHidden={toggleHidden}
                        onClose={() => setShowList(false)}
                    />
                )}
            </div>

            {/* PIN Modal */}
            {showPin && (
                <PinModal
                    onSuccess={() => { setShowPin(false); setUnlocked(true); }}
                    onClose={() => setShowPin(false)}
                />
            )}

            {/* Table Settings Popup */}
            {settingsTable && layout[settingsTable.id] && (
                <TableSettingsPopup
                    table={settingsTable}
                    position={layout[settingsTable.id]}
                    onClose={() => { setSettingsTable(null); setSelectedTableId(null); }}
                    onChangeShape={handleChangeShape}
                    onChangeSize={handleChangeSize}
                />
            )}
        </div>
    );
}


