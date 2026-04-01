import React from 'react';
import { X, RotateCcw, Info, Merge, ArrowRightLeft, FileText } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Table } from '../types';
import { translate } from '../../../shared/i18n';

export type MoveOrMergeMode = 'move' | 'merge' | 'moveItem' | 'moveItems';
/** Taşıma kapsamı: tümü veya işlem numarasına göre (belirli sipariş) */
export type MoveScope = 'all' | { tableId: string };

interface RestaurantMoveTableModalProps {
    currentTable?: Table;
    tables: Table[];
    targetTableId: string | null;
    onTargetSelect: (id: string) => void;
    onClose: () => void;
    /** Tek ürün taşıma modu: sadece hedef masa seçimi + Taşı */
    moveSingleItem?: { itemId: string; itemName: string };
    /** Çoklu ürün taşıma: seçilen kalemlerin id'leri — moveItemIds kullanılırsa moveSingleItem yok sayılır */
    moveItemIds?: string[];
    /** onConfirm(mode, targetTableId, moveScope?) — moveItem/moveItems için sadece (mode, targetTableId) */
    onConfirm: (mode: MoveOrMergeMode, targetTableId: string | null, moveScope?: MoveScope) => void;
    /** Tam ekran (masalar ekranında açıldığında z-[5010], geniş grid) */
    fullScreen?: boolean;
}

export function RestaurantMoveTableModal({
    currentTable,
    tables,
    targetTableId,
    onTargetSelect,
    onClose,
    onConfirm,
    moveSingleItem,
    moveItemIds,
    fullScreen = false
}: RestaurantMoveTableModalProps) {
    const hasMultipleItems = Array.isArray(moveItemIds) && moveItemIds.length > 0;
    const [mode, setMode] = React.useState<MoveOrMergeMode>(hasMultipleItems ? 'moveItems' : moveSingleItem ? 'moveItem' : 'move');
    const [moveScope, setMoveScope] = React.useState<MoveScope>('all');
    const isMoveItems = hasMultipleItems;
    const isMoveItem = !!moveSingleItem && !hasMultipleItems;
    const isMove = mode === 'move';
    const isMerge = mode === 'merge';

    const ordersList = React.useMemo(() => {
        if (!currentTable || !isMove) return [];
        const list: { tableId: string; faturaNo: string }[] = [];
        if (currentTable.faturaNo) list.push({ tableId: currentTable.id, faturaNo: currentTable.faturaNo });
        (currentTable.mergedOrders || []).forEach(m => {
            if (m.faturaNo && m.tableId) list.push({ tableId: m.tableId, faturaNo: m.faturaNo });
        });
        return list;
    }, [currentTable, isMove]);

    const hasMultipleOrders = ordersList.length > 1;

    const handleConfirm = () => {
        if (isMoveItems) {
            onConfirm('moveItems', targetTableId);
            return;
        }
        if (isMoveItem) {
            onConfirm('moveItem', targetTableId);
            return;
        }
        const scope: MoveScope = isMove && hasMultipleOrders && moveScope !== 'all' && moveScope.tableId ? moveScope : 'all';
        onConfirm(mode, targetTableId, scope);
    };

    return (
        <div className={cn(
            "fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300",
            fullScreen ? "z-[5010] p-4" : "z-[5000] p-6"
        )}>
            <div
                className={cn(
                    "bg-white shadow-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col",
                    fullScreen ? "rounded-2xl w-full h-full max-w-5xl max-h-[90vh] border-slate-200" : "rounded-[32px] w-full max-w-lg"
                )}
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Amber Gradient */}
                <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center justify-between relative z-10 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                                <RotateCcw className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight">
                                    {isMoveItems ? 'Ürünleri başka masaya taşı' : isMoveItem ? 'Ürünü başka masaya taşı' : 'Masa taşı / birleştir'}
                                </h3>
                                <p className="text-[10px] text-amber-100 font-bold uppercase tracking-widest mt-0.5">
                                    {isMoveItems ? `${moveItemIds!.length} ürün seçilen masaya taşınacak` : isMoveItem ? (moveSingleItem?.itemName ?? '') : translate('selectTargetTable')}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-90"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="p-8 space-y-6 flex-1 flex flex-col min-h-0">
                    {/* Taşı / Birleştir seçimi — tek/çoklu ürün taşımada gizle */}
                    {!isMoveItem && !isMoveItems && (
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setMode('move')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all",
                                isMove ? "bg-amber-500 text-white shadow-md" : "text-slate-500 hover:bg-white hover:text-slate-700"
                            )}
                        >
                            <ArrowRightLeft className="w-4 h-4" />
                            Taşı
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('merge')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all",
                                isMerge ? "bg-amber-500 text-white shadow-md" : "text-slate-500 hover:bg-white hover:text-slate-700"
                            )}
                        >
                            <Merge className="w-4 h-4" />
                            Birleştir
                        </button>
                    </div>
                    )}

                    {/* Birleştirilmiş masada taşıma: tümünü veya işlem numarasına göre */}
                    {!isMoveItem && !isMoveItems && isMove && hasMultipleOrders && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Taşıma kapsamı</p>
                            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setMoveScope('all')}
                                    className={cn(
                                        "flex-1 py-2.5 rounded-lg font-black text-[10px] uppercase transition-all",
                                        moveScope === 'all' ? "bg-amber-500 text-white shadow" : "text-slate-500 hover:bg-white"
                                    )}
                                >
                                    Tümünü taşı
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMoveScope({ tableId: '' })}
                                    className={cn(
                                        "flex-1 py-2.5 rounded-lg font-black text-[10px] uppercase transition-all flex items-center justify-center gap-1",
                                        moveScope !== 'all' ? "bg-amber-500 text-white shadow" : "text-slate-500 hover:bg-white"
                                    )}
                                >
                                    <FileText className="w-3.5 h-3.5" /> İşlem no
                                </button>
                            </div>
                            {moveScope !== 'all' && (
                                <select
                                    value={typeof moveScope === 'object' ? moveScope.tableId : ''}
                                    onChange={e => { const v = e.target.value; setMoveScope(v ? { tableId: v } : 'all'); }}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[12px] font-bold text-slate-700 bg-white"
                                >
                                    <option value="">İşlem numarası seçin</option>
                                    {ordersList.map(o => (
                                        <option key={o.tableId + o.faturaNo} value={o.tableId}>{o.faturaNo}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-600 shadow-sm">
                            <Info className="w-4 h-4" />
                        </div>
                        <p className="text-[11px] font-bold text-amber-700 leading-tight uppercase tracking-wider">
                            {isMoveItems
                                ? `${moveItemIds!.length} ürün seçilen masaya taşınacak.`
                                : isMoveItem
                                ? `"${moveSingleItem?.itemName}" seçilen masaya taşınacak.`
                                : currentTable
                                    ? (isMove
                                        ? (hasMultipleOrders && moveScope !== 'all' && typeof moveScope === 'object' && moveScope.tableId
                                            ? `Seçilen işlem (${ordersList.find(o => o.tableId === moveScope.tableId)?.faturaNo}) seçilen masaya taşınacak.`
                                            : `Masa ${currentTable.number} siparişi seçilen masaya taşınacak.`)
                                        : `Masa ${currentTable.number} siparişi seçilen masa ile birleştirilecek.`)
                                    : translate('selectTargetTable')}
                        </p>
                    </div>

                    <div className={cn(
                        "grid gap-3 overflow-y-auto pr-2 custom-scrollbar",
                        fullScreen ? "grid-cols-6 sm:grid-cols-8 flex-1 min-h-0 max-h-[50vh]" : "grid-cols-4 max-h-[280px]"
                    )}>
                        {tables.filter(t => t.id !== currentTable?.id).map(t => (
                            <button
                                key={t.id}
                                onClick={() => onTargetSelect(t.id)}
                                className={cn(
                                    "aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-sm",
                                    targetTableId === t.id
                                        ? "bg-amber-50 border-amber-500 text-amber-600 shadow-lg shadow-amber-500/10"
                                        : "bg-slate-50 border-slate-100 text-slate-400 hover:border-amber-200 hover:text-slate-600 hover:bg-white"
                                )}
                            >
                                <span className="text-[9px] font-black opacity-50 uppercase tracking-widest">{translate('product')}</span>
                                <span className="text-xl font-black">{t.number}</span>
                                {t.status !== 'empty' && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-[8px] font-black text-red-500 uppercase">{translate('tableOccupied')}</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] transition-all hover:bg-slate-100 active:scale-95 shadow-sm"
                    >
                        {translate('cancel')}
                    </button>
                    <button
                        disabled={!targetTableId || (!isMoveItem && !isMoveItems && isMove && hasMultipleOrders && moveScope !== 'all' && (!(typeof moveScope === 'object') || !moveScope.tableId))}
                        onClick={handleConfirm}
                        className="flex-1 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black uppercase text-[12px] transition-all shadow-xl shadow-amber-200 disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
                    >
                        {isMoveItems || isMoveItem ? <ArrowRightLeft className="w-4 h-4" /> : isMove ? <ArrowRightLeft className="w-4 h-4" /> : <Merge className="w-4 h-4" />}
                        {isMoveItems || isMoveItem ? 'Taşı' : isMove ? translate('confirmMove') : 'Birleştir'}
                    </button>
                </div>
            </div>
        </div>
    );
}
