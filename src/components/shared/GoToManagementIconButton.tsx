import { LayoutGrid } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export const GO_TO_MANAGEMENT_I18N_KEY = 'goToManagement';

/**
 * Yönetim ekranındayken kısayol gizlenir.
 * Diğer kabuklarda mevcut yönetim okuma yetkisi varsa görünür.
 */
export function shouldShowGoToManagement(currentModule: string, canReadManagement: boolean): boolean {
    return canReadManagement && currentModule !== 'management';
}

/** İkon düğmesi. Metin yok; ipucu ve aria-label çeviriden gelir. */
export function GoToManagementIconButton({
    onClick,
    variant,
    compact = false,
    dense = false,
}: {
    onClick: () => void;
    variant: 'clinic' | 'shell';
    compact?: boolean;
    dense?: boolean;
}) {
    const { tm } = useLanguage();
    const label = tm(GO_TO_MANAGEMENT_I18N_KEY);

    if (variant === 'clinic') {
        return (
            <button
                type="button"
                onClick={onClick}
                title={label}
                aria-label={label}
                data-testid="go-to-management"
                className="flex shrink-0 items-center justify-center transition-colors"
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    color: '#6b7280',
                    cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#7c3aed';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                }}
            >
                <LayoutGrid size={14} aria-hidden />
            </button>
        );
    }

    if (compact) {
        return (
            <button
                type="button"
                onClick={onClick}
                title={label}
                aria-label={label}
                data-testid="go-to-management"
                className={`flex shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 touch-manipulation ${dense ? 'h-8 w-8' : 'h-9 w-9'}`}
            >
                <LayoutGrid className={dense ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            data-testid="go-to-management"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors hover:bg-white/10 active:scale-95 sm:p-2.5"
        >
            <LayoutGrid className="h-4 w-4" aria-hidden />
        </button>
    );
}
