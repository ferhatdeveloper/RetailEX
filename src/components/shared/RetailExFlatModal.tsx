import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { MODAL_OVERLAY_Z } from './FullscreenBodyPortal';
import { ASIN_MODAL_HEADER_CLASS, ASIN_MODAL_PRIMARY_BTN_CLASS } from './PercentBodyModal';

export type RetailExFlatModalProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    /** Başlık satırında ikon (örn. lucide) */
    headerIcon?: React.ReactNode;
    children: React.ReactNode;
    /** Tailwind max-width sınıfı */
    maxWidthClass?: string;
    /** Dışarı (boş alan) tıklanınca kapat */
    closeOnBackdrop?: boolean;
    cancelLabel?: string;
    confirmLabel?: string;
    onConfirm?: () => void | Promise<void>;
    confirmDisabled?: boolean;
    confirmLoading?: boolean;
    /** Verilirse varsayılan İptal/Kaydet footer yerine bu render edilir */
    footer?: React.ReactNode;
};

const overlayCls =
    'fixed inset-0 overflow-y-auto overflow-x-hidden bg-black/60 backdrop-blur-md animate-in fade-in duration-200';

/**
 * POS ödeme modalı / ui-flat-modal-standard ile aynı kabuk: Asin ink başlık, gövde scroll, alt çubuk.
 */
export function RetailExFlatModal({
    open,
    onClose,
    title,
    subtitle,
    headerIcon,
    children,
    maxWidthClass = 'max-w-lg',
    closeOnBackdrop = true,
    cancelLabel = 'İptal',
    confirmLabel = 'Kaydet',
    onConfirm,
    confirmDisabled = false,
    confirmLoading = false,
    footer,
}: RetailExFlatModalProps) {
    const { darkMode } = useTheme();
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onEsc);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onEsc);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    const boxBase =
        'w-full rounded-[2rem] max-h-[min(90vh,100dvh)] min-h-0 overflow-hidden shadow-xl border flex flex-col animate-in zoom-in-95 duration-200';
    const boxLight = 'bg-white border-slate-200/80';
    const boxDark = 'bg-gray-900 border-gray-700';

    const headerBase = `px-6 py-5 sm:px-8 sm:py-6 ${ASIN_MODAL_HEADER_CLASS} border-b`;
    const headerLight = 'border-transparent';
    const headerDark = 'border-gray-700';

    const bodyBase =
        'flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 sm:p-8';
    const bodyLight = 'text-slate-800';
    const bodyDark = 'text-gray-100';

    const footerWrap =
        'p-5 sm:p-6 border-t flex gap-3 sm:gap-4 shrink-0 flex-col-reverse sm:flex-row';
    const footerLight = 'border-slate-100 bg-slate-50/50';
    const footerDark = 'border-gray-700 bg-gray-800/50';

    const cancelBtn =
        'flex-1 py-3.5 rounded-2xl border-2 font-bold uppercase text-sm tracking-wider transition-colors active:scale-[0.98] disabled:opacity-50';
    const cancelLight =
        'border-slate-200 text-slate-600 hover:bg-slate-100';
    const cancelDark =
        'border-gray-600 text-gray-200 hover:bg-gray-700';

    const primaryBtn =
        `flex-1 py-3.5 rounded-2xl font-bold uppercase text-sm tracking-wider shadow-lg transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 ${ASIN_MODAL_PRIMARY_BTN_CLASS}`;
    const primaryLight =
        'shadow-[0_4px_12px_rgb(14_36_51/0.12)]';
    const primaryDark =
        'shadow-[0_4px_12px_rgb(0_0_0/0.35)]';

    const showDefaultFooter = footer === undefined && onConfirm !== undefined;

    const node = (
        <div className={overlayCls} style={{ zIndex: MODAL_OVERLAY_Z }}>
            <div
                className="flex min-h-[100dvh] min-h-screen w-full items-center justify-center p-3 py-6 sm:p-4"
                onClick={() => closeOnBackdrop && onClose()}
                role="presentation"
            >
                <div
                    className={`${boxBase} ${darkMode ? boxDark : boxLight} ${maxWidthClass}`}
                    onClick={e => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                >
                    <div className={`${headerBase} ${darkMode ? headerDark : headerLight}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    {headerIcon ? (
                                        <span className="shrink-0 text-white/95 [&_svg]:h-5 [&_svg]:w-5">
                                            {headerIcon}
                                        </span>
                                    ) : null}
                                    <h2
                                        id={titleId}
                                        className="text-lg sm:text-xl font-black uppercase tracking-tight truncate"
                                    >
                                        {title}
                                    </h2>
                                </div>
                                {subtitle ? (
                                    <p className="text-[var(--asin-accent-muted,#D5F0EE)] text-[11px] font-semibold uppercase tracking-wider mt-1 opacity-90 line-clamp-2 dark:text-gray-300">
                                        {subtitle}
                                    </p>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                                aria-label="Kapat"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className={`${bodyBase} ${darkMode ? bodyDark : bodyLight}`}>{children}</div>

                    {footer !== undefined ? (
                        <div className={`${footerWrap} ${darkMode ? footerDark : footerLight}`}>{footer}</div>
                    ) : showDefaultFooter ? (
                        <div className={`${footerWrap} ${darkMode ? footerDark : footerLight}`}>
                            <button
                                type="button"
                                onClick={onClose}
                                className={`${cancelBtn} ${darkMode ? cancelDark : cancelLight}`}
                                disabled={confirmLoading}
                            >
                                {cancelLabel}
                            </button>
                            <button
                                type="button"
                                onClick={() => void onConfirm?.()}
                                disabled={confirmDisabled || confirmLoading}
                                className={`${primaryBtn} ${darkMode ? primaryDark : primaryLight}`}
                            >
                                {confirmLoading ? (
                                    <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
                                ) : null}
                                {confirmLabel}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );

    return createPortal(node, document.body);
}

/** Flat modal gövdesinde form etiketleri — ui-flat-modal-standard */
export function RetailExFlatFieldLabel({
    children,
    required,
    className = '',
    useSentenceCase = false,
}: {
    children: React.ReactNode;
    required?: boolean;
    className?: string;
    /** true: normal yazım, biraz daha büyük — uzun formlarda okunabilirlik */
    useSentenceCase?: boolean;
}) {
    const variantClass = useSentenceCase
        ? 'text-xs font-semibold text-slate-600 dark:text-slate-300 normal-case tracking-normal mb-1.5 block'
        : 'text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block';
    return (
        <span className={`${variantClass} ${className}`}>
            {children}
            {required ? <span className="text-red-500 ml-0.5">*</span> : null}
        </span>
    );
}
