import type { LucideIcon } from 'lucide-react';
import { Calendar, LayoutDashboard, Scissors, Settings2, UserCog, Users } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { canAccessBeautyTab } from '../clinicShellNavConfig';
import { usePermission } from '../../../shared/hooks/usePermission';

/** V2 dar şerit. Sekme kimlikleri mevcut klinik ekranlarıdır. */
export const CLINIC_V2_RAIL_ITEMS: ReadonlyArray<{
    id: string;
    labelKey: string;
    icon: LucideIcon;
    color: string;
}> = [
    { id: 'calendar', labelKey: 'bClinicV2RailAppointment', icon: Calendar, color: '#2563eb' },
    { id: 'clients', labelKey: 'bClinicV2RailClients', icon: Users, color: '#0ea5e9' },
    { id: 'staff', labelKey: 'bClinicV2RailStaff', icon: UserCog, color: '#7c3aed' },
    { id: 'services', labelKey: 'bClinicV2RailService', icon: Scissors, color: '#d97706' },
    { id: 'clinic_ops', labelKey: 'bClinicV2RailSettings', icon: Settings2, color: '#475569' },
];

type Props = {
    activeTab: string;
    onSelect: (tabId: string) => void;
    isMobile: boolean;
    mobileOpen: boolean;
};

export function ClinicV2SideRail({ activeTab, onSelect, isMobile, mobileOpen }: Props) {
    const { tm } = useLanguage();
    const { hasPermission } = usePermission();
    const items = CLINIC_V2_RAIL_ITEMS.filter((item) => canAccessBeautyTab(hasPermission, item.id));
    const homeSelected = activeTab === 'dashboard';

    return (
        <aside
            aria-label={tm('bClinicV2Toggle')}
            className={isMobile ? 'fixed inset-y-0 left-0 z-[60]' : 'shrink-0'}
            style={{
                width: 76,
                transform: isMobile && !mobileOpen ? 'translateX(-100%)' : undefined,
                background: '#ffffff',
                borderRight: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 6px',
                gap: 4,
            }}
        >
            <RailButton
                label={tm('dashboard')}
                icon={LayoutDashboard}
                color="#2563eb"
                selected={homeSelected}
                iconOnly
                onClick={() => onSelect('dashboard')}
            />
            <div style={{ width: 28, height: 1, background: '#e5e7eb', margin: '4px 0 6px' }} />
            <nav className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {items.map((item) => {
                    const selected = activeTab === item.id || (item.id === 'calendar' && activeTab === 'clinic_board');
                    return (
                        <RailButton
                            key={item.id}
                            label={tm(item.labelKey)}
                            icon={item.icon}
                            color={item.color}
                            selected={selected}
                            onClick={() => onSelect(item.id)}
                        />
                    );
                })}
            </nav>
        </aside>
    );
}

function RailButton({
    label,
    icon: Icon,
    color,
    selected,
    onClick,
    iconOnly,
}: {
    label: string;
    icon: LucideIcon;
    color: string;
    selected: boolean;
    onClick: () => void;
    iconOnly?: boolean;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={selected}
            onClick={onClick}
            className="flex w-full flex-col items-center justify-center"
            style={{
                gap: 2,
                minHeight: iconOnly ? 40 : 52,
                borderRadius: 10,
                border: '1px solid transparent',
                background: selected ? '#eff6ff' : 'transparent',
                color: selected ? '#1d4ed8' : '#64748b',
                cursor: 'pointer',
                padding: '4px 2px',
            }}
        >
            <Icon size={18} color={selected ? '#1d4ed8' : color} aria-hidden />
            {iconOnly ? null : (
                <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.15, textAlign: 'center' }}>{label}</span>
            )}
        </button>
    );
}
