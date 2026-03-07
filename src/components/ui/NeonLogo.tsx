import React from 'react';

interface NeonLogoProps {
    className?: string;
    variant?: 'full' | 'icon' | 'badge';
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const NeonLogo: React.FC<NeonLogoProps> = ({ className = '', variant = 'full', size = 'md' }) => {
    // Sizes
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

    return (
        <div className={`flex items-center gap-3 font-bold tracking-tight select-none ${className}`}>
            {/* Abstract Geometric Icon */}
            <div className={`relative flex items-center justify-center ${iconSizes[size]}`}>
                <div className="absolute inset-0 bg-blue-500 blur-[20px] opacity-20 rounded-full"></div>

                <svg viewBox="0 0 100 100" className="w-full h-full relative z-10 drop-shadow-[0_2px_10px_rgba(59,130,246,0.3)]">
                    <defs>
                        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" /> {/* Blue 500 */}
                            <stop offset="100%" stopColor="#8b5cf6" /> {/* Violet 500 */}
                        </linearGradient>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Outer Hexagon / Frame */}
                    <path
                        d="M50 5 L89 27.5 L89 72.5 L50 95 L11 72.5 L11 27.5 Z"
                        fill="none"
                        stroke="url(#logoGrad)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        className="opacity-40"
                    />

                    {/* Inner Core Shape (Abstract EX) */}
                    <path
                        d="M35 35 L65 35 L65 45 L45 45 L45 55 L65 55 L65 65 L35 65 Z"
                        fill="url(#logoGrad)"
                        className="animate-pulse"
                        filter="url(#glow)"
                    />

                    {/* Dynamic Accents */}
                    <rect x="70" y="35" width="8" height="30" fill="url(#logoGrad)" rx="2" className="opacity-80" />
                </svg>
            </div>

            {/* Premium Typography */}
            {variant === 'full' && (
                <div className={`flex items-baseline ${sizeClasses[size]} tracking-tight`}>
                    <span className="text-white font-extrabold">Retail</span>
                    <span className="text-blue-500 font-black italic ml-0.5">Ex</span>
                </div>
            )}
        </div>
    );
};


