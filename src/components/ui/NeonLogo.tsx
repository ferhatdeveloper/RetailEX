import React from 'react';

/** Mağaza: Asin · Restoran: Asin · Klinik: Asin (opsiyonel satır etiketi) */
export type NeonLogoProductLine = 'retail' | 'restaurant' | 'clinic';

interface NeonLogoProps {
    className?: string;
    variant?: 'full' | 'icon' | 'badge';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    productLine?: NeonLogoProductLine;
    /** true ise markanın altında soluk satır etiketi (Retail / Rest / Clinic) */
    showLineLabel?: boolean;
}

const LINE_LABELS: Record<NeonLogoProductLine, string> = {
    retail: 'Retail',
    restaurant: 'Rest',
    clinic: 'Clinic',
};

const GRADIENT_ID = 'asinLogoGrad';
const GLOW_ID = 'asinLogoGlow';

export const NeonLogo: React.FC<NeonLogoProps> = ({
    className = '',
    variant = 'full',
    size = 'md',
    productLine = 'retail',
    showLineLabel = false,
}) => {
    const sizeClasses = {
        sm: 'text-lg',
        md: 'text-2xl',
        lg: 'text-4xl',
        xl: 'text-6xl',
    };

    const iconSizes = {
        sm: 'w-6 h-6',
        md: 'w-10 h-10',
        lg: 'w-16 h-16',
        xl: 'w-24 h-24',
    };

    const labelSizes = {
        sm: 'text-[9px]',
        md: 'text-[10px]',
        lg: 'text-xs',
        xl: 'text-sm',
    };

    return (
        <div
            className={`flex items-center gap-3 font-bold tracking-tight select-none ${className}`}
            style={{ color: 'inherit' }}
        >
                    {/* Ink → Teal geometric mark */}
            <div className={`relative flex items-center justify-center ${iconSizes[size]}`}>
                <div
                    className="absolute inset-0 rounded-full opacity-25 blur-[20px]"
                    style={{ background: 'var(--asin-accent, #1FA8A0)' }}
                />

                <svg
                    viewBox="0 0 100 100"
                    className="w-full h-full relative z-10"
                    style={{ filter: 'drop-shadow(0 2px 10px rgba(31, 168, 160, 0.35))' }}
                    aria-hidden
                >
                    <defs>
                        <linearGradient id={GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#F3F5F7" />
                            <stop offset="100%" stopColor="#1FA8A0" />
                        </linearGradient>
                        <filter id={GLOW_ID}>
                            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Outer hexagon */}
                    <path
                        d="M50 5 L89 27.5 L89 72.5 L50 95 L11 72.5 L11 27.5 Z"
                        fill="none"
                        stroke="#1FA8A0"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        className="opacity-55"
                    />

                    {/* Inner "A" monogram */}
                    <path
                        d="M50 28 L72 72 H62 L56 58 H44 L38 72 H28 L50 28 Z M47 50 H53 L50 42 Z"
                        fill={`url(#${GRADIENT_ID})`}
                        filter={`url(#${GLOW_ID})`}
                    />

                    {/* Teal accent bar */}
                    <rect
                        x="74"
                        y="38"
                        width="6"
                        height="28"
                        fill="#1FA8A0"
                        rx="2"
                        className="opacity-95"
                    />
                </svg>
            </div>

            {/* Wordmark — Outfit; renk currentColor (parent className ile override, örn. text-white) */}
            {variant === 'full' && (
                <div className="flex flex-col items-start leading-none">
                    <span
                        className={`font-asin-brand relative inline-block ${sizeClasses[size]} font-semibold tracking-tight text-current`}
                    >
                        Asin
                        <span
                            className="absolute left-0 right-0 -bottom-0.5 h-[2px] rounded-full opacity-80"
                            style={{ background: 'var(--asin-accent, #1FA8A0)' }}
                            aria-hidden
                        />
                    </span>
                    {showLineLabel && (
                        <span
                            className={`mt-1 font-medium uppercase tracking-widest text-[var(--asin-text-muted,#5A6B78)] ${labelSizes[size]}`}
                        >
                            {LINE_LABELS[productLine]}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};
