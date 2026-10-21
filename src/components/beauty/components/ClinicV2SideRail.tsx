import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    Activity, Apple, Baby, Banknote, BarChart3, Box, Calendar, ChevronLeft, ChevronRight,
    ClipboardList, Layers, LayoutDashboard, Megaphone, Package, Scissors, Settings2, Share2, Smile, UserCog, Users,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { canAccessBeautyTab } from '../clinicShellNavConfig';
import { SHARE_OPEN_SLOTS_LABEL_KEY, SHARE_OPEN_SLOTS_TAB_ID } from '../share-slots/shareSlotsStory';
import { usePermission } from '../../../shared/hooks/usePermission';
import type { ClinicErpSpecialty } from '../../../types/beauty';

/** Dar/geniş tercih. V1 menüsünden bağımsız. */
export const CLINIC_V2_RAIL_EXPANDED_KEY = 'retailex_clinic_v2_rail_expanded';

export type ClinicV2RailLeaf = {
    id: string;
    labelKey: string;
    icon: LucideIcon;
    color: string;
};

export type ClinicV2RailGroup = {
    id: string;
    shortKey: string;
    titleKey: string;
    icon: LucideIcon;
    color: string;
    items: ClinicV2RailLeaf[];
};

/**
 * RandevuNet açık menü sırası. Karşılığı olmayan maddeler yok.
 * Çok çocuklu gruplar geniş halde başlık + alt madde gösterir.
 */
export const CLINIC_V2_RAIL_GROUPS: readonly ClinicV2RailGroup[] = [
    {
        id: 'home',
        shortKey: 'bClinicV2RailHome',
        titleKey: 'bClinicV2RailHome',
        icon: LayoutDashboard,
        color: '#2563eb',
        items: [
            { id: 'dashboard', labelKey: 'bClinicV2RailHome', icon: LayoutDashboard, color: '#2563eb' },
        ],
    },
    {
        id: 'appointments',
        shortKey: 'bClinicV2RailAppointment',
        titleKey: 'bClinicV2RailAppointment',
        icon: Calendar,
        color: '#2563eb',
        items: [
            { id: 'calendar', labelKey: 'bClinicV2RailCalendar', icon: Calendar, color: '#2563eb' },
            { id: 'clinic_board', labelKey: 'bClinicBoardNav', icon: Calendar, color: '#0ea5e9' },
            { id: SHARE_OPEN_SLOTS_TAB_ID, labelKey: SHARE_OPEN_SLOTS_LABEL_KEY, icon: Share2, color: '#2563eb' },
        ],
    },
    {
        id: 'customers',
        shortKey: 'bClinicV2RailClients',
        titleKey: 'bClinicV2RailClients',
        icon: Users,
        color: '#0ea5e9',
        items: [
            { id: 'clients', labelKey: 'bClinicV2RailClients', icon: Users, color: '#0ea5e9' },
            { id: 'leads', labelKey: 'bShellNavLeads', icon: Megaphone, color: '#0284c7' },
            { id: 'surveys', labelKey: 'bSatisfactionSurveysTitle', icon: ClipboardList, color: '#0369a1' },
        ],
    },
    {
        id: 'catalog',
        shortKey: 'bClinicV2RailService',
        titleKey: 'bShellNavServices',
        icon: Scissors,
        color: '#d97706',
        items: [
            { id: 'services', labelKey: 'bShellNavServices', icon: Scissors, color: '#d97706' },
            { id: 'packages', labelKey: 'bShellNavPackages', icon: Package, color: '#ea580c' },
            { id: 'product_sales', labelKey: 'bShellNavProductSales', icon: Package, color: '#c2410c' },
            { id: 'service_recipes', labelKey: 'bShellNavServiceRecipes', icon: Layers, color: '#b45309' },
            { id: 'devices', labelKey: 'bShellNavDevices', icon: Box, color: '#a16207' },
        ],
    },
    {
        id: 'staff',
        shortKey: 'bClinicV2RailStaff',
        titleKey: 'bClinicV2RailStaff',
        icon: UserCog,
        color: '#7c3aed',
        items: [
            { id: 'staff', labelKey: 'bShellNavStaff', icon: UserCog, color: '#7c3aed' },
        ],
    },
    {
        id: 'expenses',
        shortKey: 'bClinicV2RailExpenseShort',
        titleKey: 'bShellNavExpenses',
        icon: Banknote,
        color: '#059669',
        items: [
            { id: 'expenses', labelKey: 'bShellNavExpenses', icon: Banknote, color: '#059669' },
        ],
    },
    {
        id: 'reports',
        shortKey: 'bClinicV2RailReportShort',
        titleKey: 'bShellNavReports',
        icon: BarChart3,
        color: '#ea580c',
        items: [
            { id: 'reports', labelKey: 'bShellNavReports', icon: BarChart3, color: '#ea580c' },
        ],
    },
    {
        id: 'settings',
        shortKey: 'bClinicV2RailSettings',
        titleKey: 'bClinicV2RailSettings',
        icon: Settings2,
        color: '#475569',
        items: [
            { id: 'clinic_ops', labelKey: 'bClinicV2RailSettings', icon: Settings2, color: '#475569' },
        ],
    },
];

function specialtyGroup(specialty: ClinicErpSpecialty | undefined): ClinicV2RailGroup | null {
    if (specialty === 'dental') {
        return {
            id: 'clinical',
            shortKey: 'bShellNavDental',
            titleKey: 'bShellNavDental',
            icon: Smile,
            color: '#0ea5e9',
            items: [{ id: 'dental_chart', labelKey: 'bShellNavDental', icon: Smile, color: '#0ea5e9' }],
        };
    }
    if (specialty === 'physiotherapy') {
        return {
            id: 'clinical',
            shortKey: 'bShellNavPhysio',
            titleKey: 'bShellNavPhysio',
            icon: Activity,
            color: '#0ea5e9',
            items: [{ id: 'physio_body', labelKey: 'bShellNavPhysio', icon: Activity, color: '#0ea5e9' }],
        };
    }
    if (specialty === 'obstetrics') {
        return {
            id: 'clinical',
            shortKey: 'bShellNavObstetrics',
            titleKey: 'bShellNavObstetrics',
            icon: Baby,
            color: '#0ea5e9',
            items: [{ id: 'obstetrics', labelKey: 'bShellNavObstetrics', icon: Baby, color: '#0ea5e9' }],
        };
    }
    if (specialty === 'dietitian') {
        return {
            id: 'clinical',
            shortKey: 'bShellNavDietitian',
            titleKey: 'bShellNavDietitian',
            icon: Apple,
            color: '#0ea5e9',
            items: [{ id: 'dietitian', labelKey: 'bShellNavDietitian', icon: Apple, color: '#0ea5e9' }],
        };
    }
    return null;
}

export function clinicV2RailGroups(specialty?: ClinicErpSpecialty): ClinicV2RailGroup[] {
    const clinical = specialtyGroup(specialty);
    if (!clinical) return [...CLINIC_V2_RAIL_GROUPS];
    const next = [...CLINIC_V2_RAIL_GROUPS];
    const afterAppt = next.findIndex((group) => group.id === 'appointments');
    next.splice(afterAppt + 1, 0, clinical);
    return next;
}

function readExpanded(): boolean {
    try {
        return localStorage.getItem(CLINIC_V2_RAIL_EXPANDED_KEY) === '1';
    } catch {
        return false;
    }
}

type Props = {
    activeTab: string;
    onSelect: (tabId: string) => void;
    isMobile: boolean;
    mobileOpen: boolean;
    specialty?: ClinicErpSpecialty;
};

export function ClinicV2SideRail({ activeTab, onSelect, isMobile, mobileOpen, specialty }: Props) {
    const { tm } = useLanguage();
    const { hasPermission } = usePermission();
    const [expanded, setExpanded] = useState(readExpanded);

    const groups = clinicV2RailGroups(specialty)
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => canAccessBeautyTab(hasPermission, item.id)),
        }))
        .filter((group) => group.items.length > 0);

    const toggle = () => {
        setExpanded((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(CLINIC_V2_RAIL_EXPANDED_KEY, next ? '1' : '0');
            } catch {
                /* depolama kapalı */
            }
            return next;
        });
    };

    return (
        <aside
            aria-label={tm('bClinicV2Toggle')}
            data-testid="clinic-v2-rail"
            data-expanded={expanded ? '1' : '0'}
            className={isMobile ? 'fixed inset-y-0 left-0 z-[60]' : 'shrink-0'}
            style={{
                width: expanded ? 232 : 76,
                transform: isMobile && !mobileOpen ? 'translateX(-100%)' : undefined,
                background: '#ffffff',
                borderRight: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                padding: expanded ? '8px 10px' : '8px 6px',
                gap: 2,
            }}
        >
            <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? tm('bClinicV2RailCollapse') : tm('bClinicV2RailExpand')}
                onClick={toggle}
                className="flex items-center justify-center"
                style={{
                    height: 36,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                    marginBottom: 6,
                    gap: 8,
                }}
            >
                {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                {expanded ? <span style={{ fontSize: 12, fontWeight: 700 }}>{tm('bClinicV2RailCollapse')}</span> : null}
            </button>
            <nav className="flex w-full flex-1 flex-col overflow-y-auto" style={{ scrollbarWidth: 'none', gap: expanded ? 8 : 4 }}>
                {groups.map((group) => {
                    const groupOn = group.items.some((item) => item.id === activeTab);
                    if (!expanded) {
                        const primary = group.items[0];
                        return (
                            <RailButton
                                key={group.id}
                                label={tm(group.shortKey)}
                                icon={group.icon}
                                color={group.color}
                                selected={groupOn}
                                collapsed
                                onClick={() => onSelect(primary.id)}
                            />
                        );
                    }
                    if (group.items.length === 1) {
                        const item = group.items[0];
                        return (
                            <RailButton
                                key={group.id}
                                label={tm(item.labelKey)}
                                icon={item.icon}
                                color={item.color}
                                selected={activeTab === item.id}
                                onClick={() => onSelect(item.id)}
                            />
                        );
                    }
                    return (
                        <div key={group.id}>
                            <p
                                data-testid={`clinic-v2-group-${group.id}`}
                                style={{
                                    margin: '4px 6px 2px',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: '#94a3b8',
                                }}
                            >
                                {tm(group.titleKey)}
                            </p>
                            {group.items.map((item) => (
                                <RailButton
                                    key={item.id}
                                    label={tm(item.labelKey)}
                                    icon={item.icon}
                                    color={item.color}
                                    selected={activeTab === item.id}
                                    onClick={() => onSelect(item.id)}
                                />
                            ))}
                        </div>
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
    collapsed,
}: {
    label: string;
    icon: LucideIcon;
    color: string;
    selected: boolean;
    onClick: () => void;
    collapsed?: boolean;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={selected}
            onClick={onClick}
            className="flex w-full items-center"
            style={{
                gap: collapsed ? 2 : 8,
                minHeight: collapsed ? 52 : 36,
                flexDirection: collapsed ? 'column' : 'row',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 10,
                border: '1px solid transparent',
                background: selected ? '#eff6ff' : 'transparent',
                color: selected ? '#1d4ed8' : '#334155',
                cursor: 'pointer',
                padding: collapsed ? '4px 2px' : '6px 8px',
            }}
        >
            <Icon size={18} color={selected ? '#1d4ed8' : color} aria-hidden />
            <span style={{ fontSize: collapsed ? 10 : 13, fontWeight: 700, lineHeight: 1.15, textAlign: collapsed ? 'center' : 'left' }}>
                {label}
            </span>
        </button>
    );
}
