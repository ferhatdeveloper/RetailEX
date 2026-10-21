import { Search } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

const LINE = '#e6ebf2';

export function ClinicV2SearchGrafanaBar({
    query,
    onQueryChange,
}: {
    query: string;
    onQueryChange: (value: string) => void;
}) {
    const { tm } = useLanguage();

    return (
        <div className="flex flex-col gap-3">
            <section
                data-testid="clinic-v2-search-row"
                className="flex flex-wrap items-center gap-2 bg-white px-3 py-2"
                style={{ borderRadius: 16, border: `1px solid ${LINE}` }}
            >
                <span className="flex items-center gap-1 text-xs font-extrabold text-slate-600">
                    <Search size={14} aria-hidden />
                    {tm('bClinicV2SearchLabel')}
                </span>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    aria-label={tm('bClinicV2SearchLabel')}
                    placeholder={tm('bClinicV2SearchPlaceholder')}
                    className="min-w-[12rem] flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none"
                    style={{ borderColor: LINE }}
                />
            </section>
        </div>
    );
}
