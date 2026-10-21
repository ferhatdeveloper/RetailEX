import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { formatMoneyInteger } from '../../../utils/formatMoney';
import {
    buildClinicBoardColumns,
    CLINIC_BOARD_DAY_START_MIN,
    CLINIC_BOARD_ROW_PX,
    CLINIC_BOARD_SLOT_MIN,
    clinicBoardHourLabels,
    formatBoardMinutes,
} from './clinicBoardModel';

type Props = {
    dayYmd: string;
    staff: BeautySpecialist[];
    appointments: BeautyAppointment[];
    staffFilterId?: string;
    unassignedLabel: string;
    appointmentWord: string;
    emptySlotWord: string;
    locale: string;
};

function tint(hex: string): string {
    const raw = hex.trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 'rgba(37, 99, 235, 0.14)';
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.16)`;
}

/** Saat ekseni ve personel kolonları. HTML tablo kullanılmaz. */
export function ClinicDayBoard({
    dayYmd,
    staff,
    appointments,
    staffFilterId,
    unassignedLabel,
    appointmentWord,
    emptySlotWord,
    locale,
}: Props) {
    const hours = clinicBoardHourLabels();
    const columns = buildClinicBoardColumns({
        staff,
        appointments,
        dayYmd,
        staffFilterId,
        unassignedName: unassignedLabel,
    });
    const boardHeight = hours.length * CLINIC_BOARD_ROW_PX;

    return (
        <div data-testid="clinic-day-board" className="h-full min-h-0 overflow-auto bg-white">
            <div className="min-w-max">
                <div className="sticky top-0 z-10 flex border-b border-[#e6eaf0] bg-white">
                    <div className="w-16 shrink-0" />
                    {columns.map((column) => (
                        <div
                            key={column.id}
                            data-testid={`clinic-board-col-${column.id}`}
                            className="min-w-[180px] flex-1 border-l border-[#eef1f6] px-3 py-2.5"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f1ff] text-xs font-bold text-[#1d4ed8]"
                                    aria-hidden
                                >
                                    {(column.name || '?').slice(0, 1).toLocaleUpperCase('tr-TR')}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-800">{column.name}</p>
                                    <p className="truncate text-[11px] text-slate-400">
                                        {column.appointmentCount} {appointmentWord} · {column.emptySlotCount} {emptySlotWord}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex" style={{ height: boardHeight }}>
                    <div data-testid="clinic-board-hours" className="w-16 shrink-0">
                        {hours.map((label) => (
                            <div
                                key={label}
                                data-testid="clinic-board-hour"
                                className="border-b border-[#eef1f6] px-2 text-[11px] font-medium tabular-nums text-slate-400"
                                style={{ height: CLINIC_BOARD_ROW_PX }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>
                    {columns.map((column) => (
                        <div
                            key={column.id}
                            className="relative min-w-[180px] flex-1 border-l border-[#eef1f6]"
                        >
                            {hours.map((label) => (
                                <div
                                    key={`${column.id}-${label}`}
                                    className="border-b border-[#eef1f6]"
                                    style={{ height: CLINIC_BOARD_ROW_PX }}
                                />
                            ))}
                            {column.blocks.map((block) => {
                                const top = ((block.startMin - CLINIC_BOARD_DAY_START_MIN) / CLINIC_BOARD_SLOT_MIN) * CLINIC_BOARD_ROW_PX;
                                const height = Math.max(
                                    28,
                                    ((block.endMin - block.startMin) / CLINIC_BOARD_SLOT_MIN) * CLINIC_BOARD_ROW_PX - 4,
                                );
                                const width = 100 / block.laneCount;
                                return (
                                    <div
                                        key={block.id}
                                        data-testid={`clinic-board-block-${block.id}`}
                                        className="absolute overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight"
                                        style={{
                                            top,
                                            height,
                                            left: `calc(${block.lane * width}% + 3px)`,
                                            width: `calc(${width}% - 6px)`,
                                            background: tint(block.color),
                                            borderLeft: `3px solid ${block.color}`,
                                            color: '#1e293b',
                                        }}
                                    >
                                        <div className="font-semibold tabular-nums text-slate-500">
                                            {formatBoardMinutes(block.startMin)}
                                        </div>
                                        {block.customerName ? <div className="truncate font-semibold">{block.customerName}</div> : null}
                                        {block.serviceName ? <div className="truncate">{block.serviceName}</div> : null}
                                        <div className="font-semibold tabular-nums">{formatMoneyInteger(block.totalPrice, locale)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
