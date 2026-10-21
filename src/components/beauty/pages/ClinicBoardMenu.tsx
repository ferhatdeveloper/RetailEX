import { Calendar, Scissors, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { CLINIC_BOARD_MENU, type ClinicBoardSection } from './clinicBoardModel';

const ICONS: Record<ClinicBoardSection, LucideIcon> = {
    appointment: Calendar,
    customer: Users,
    staff: UserRound,
    service: Scissors,
};

type Props = {
    section: ClinicBoardSection;
    onChange: (section: ClinicBoardSection) => void;
};

/** Sayfanın kendi sol menüsü. Kabuk menüsünün yerine geçmez. */
export function ClinicBoardMenu({ section, onChange }: Props) {
    const { tm } = useLanguage();
    return (
        <nav
            aria-label={tm('bClinicBoardNav')}
            data-testid="clinic-board-menu"
            className="flex w-[88px] shrink-0 flex-col items-stretch gap-1 border-r border-[#e6eaf0] bg-white px-2 py-3"
        >
            {CLINIC_BOARD_MENU.map((item) => {
                const Icon = ICONS[item.id];
                const active = section === item.id;
                const label = tm(item.labelKey);
                return (
                    <button
                        key={item.id}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onChange(item.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight transition-colors ${
                            active
                                ? 'bg-[#e8f1ff] text-[#1d4ed8]'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                    >
                        <Icon size={18} aria-hidden />
                        <span>{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
