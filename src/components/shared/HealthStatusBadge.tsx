import React from 'react';

interface HealthStatusBadgeProps {
    status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'MAINTENANCE';
    text?: string;
    showDot?: boolean;
}

const HealthStatusBadge: React.FC<HealthStatusBadgeProps> = ({ status, text, showDot = true }) => {
    const getStatusStyles = () => {
        switch (status) {
            case 'ONLINE':
                return {
                    bg: 'bg-emerald-500/10',
                    text: 'text-emerald-500',
                    dot: 'bg-emerald-500',
                    label: text || 'Canlı'
                };
            case 'ERROR':
                return {
                    bg: 'bg-rose-500/10',
                    text: 'text-rose-500',
                    dot: 'bg-rose-500',
                    label: text || 'Hata'
                };
            case 'MAINTENANCE':
                return {
                    bg: 'bg-amber-500/10',
                    text: 'text-amber-500',
                    dot: 'bg-amber-500',
                    label: text || 'Bakım'
                };
            default:
                return {
                    bg: 'bg-slate-500/10',
                    text: 'text-slate-500',
                    dot: 'bg-slate-500',
                    label: text || 'Çevrimdışı'
                };
        }
    };

    const styles = getStatusStyles();

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${styles.bg} ${styles.text} transition-all duration-300`}>
            {showDot && (
                <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]`}></span>
            )}
            {styles.label}
        </span>
    );
};

export default HealthStatusBadge;
