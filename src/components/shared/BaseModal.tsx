import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
}

export function BaseModal({
    isOpen,
    onClose,
    title,
    children,
    footer,
    maxWidth = 'max-w-lg'
}: BaseModalProps) {
    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity"
                onClick={onClose}
            ></div>

            {/* Modal Container */}
            <div className={`relative w-full ${maxWidth} bg-[var(--surface-modal)] rounded-lg shadow-2xl transform transition-all flex flex-col max-h-[95vh] border border-[var(--border-subtle)]`}>
                {/* Header - Flat Blue Style */}
                <div className="flex items-center justify-between px-4 py-3 bg-blue-600 rounded-t-lg">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white hover:bg-white/10 p-1 rounded transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto text-foreground">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-input)]/50 rounded-b-lg">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}



