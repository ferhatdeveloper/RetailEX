import { Globe } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { GoToManagementIconButton, shouldShowGoToManagement } from '../../shared/GoToManagementIconButton';
import { CLINIC_CLASSIC_SHELL } from '../clinicShellV2';
import { BeautyShellChromeButtons } from './BeautyShellChrome';

/**
 * Klinik üst çubuğu: yakınlaştırma, V2, dil ve yönetime geç.
 * Geçiş, kabuğun mevcut `onRequestManagementAccess` yoludur.
 */
export function ClinicShellLanguageCluster({
    onOpenLanguage,
    onGoToManagement,
}: {
    onOpenLanguage: () => void;
    onGoToManagement?: () => void;
}) {
    const { t } = useLanguage();
    const shell = CLINIC_CLASSIC_SHELL;
    const showManagement = shouldShowGoToManagement('beauty', Boolean(onGoToManagement));

    return (
        <div className="flex shrink-0 items-center gap-2" data-testid="clinic-language-cluster">
            <BeautyShellChromeButtons />
            <button
                type="button"
                onClick={onOpenLanguage}
                aria-label={t.languageSelectionTitle}
                className="flex items-center justify-center transition-colors"
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
                    e.currentTarget.style.borderColor = shell.accent;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                }}
            >
                <Globe size={14} aria-hidden />
            </button>
            {showManagement && onGoToManagement ? (
                <GoToManagementIconButton variant="clinic" onClick={onGoToManagement} />
            ) : null}
        </div>
    );
}
