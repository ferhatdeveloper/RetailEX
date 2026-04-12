import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

interface ModuleWrapperProps {
    title: string;
    onBack: () => void;
    children: React.ReactNode;
}

export const ModuleWrapper: React.FC<ModuleWrapperProps> = ({ title, onBack, children }) => {
    const tmR = useRestaurantModuleTm();
    return (
        <div className="h-full flex flex-col bg-[#f8fafc]">
            {/* Standardized Restaurant Appbar */}
            <header
                className="px-6 py-4 flex items-center gap-6 shadow-xl shrink-0 z-30"
                style={{ backgroundColor: '#2563eb', borderBottom: '1px solid rgba(96,165,250,0.4)' }}
            >
                <button
                    onClick={onBack}
                    className="flex items-center gap-2.5 px-6 py-3 bg-white/15 hover:bg-white/25 text-white rounded-2xl transition-all active:scale-95 border border-white/20 font-black uppercase text-[12px] group shrink-0 shadow-inner"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span>{tmR('resNavBackShort')}</span>
                </button>

                <div className="flex flex-col">
                    <h1 className="text-white font-black text-xl uppercase tracking-tight leading-none">
                        {title}
                    </h1>
                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">
                        {tmR('resModuleShellSubtitle')}
                    </p>
                </div>
            </header>

            {/* Content Area */}
            <main className="flex-1 overflow-hidden min-h-0">
                {children}
            </main>
        </div>
    );
};


