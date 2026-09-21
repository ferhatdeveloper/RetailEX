import React, { useMemo } from 'react';
import { Phone, Star, User, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautySurveyResponseRow } from '../../../types/beauty';
import { cn } from '../../ui/utils';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

export type SurveyRatingDrillDown = {
    star: number;
    questionId?: string;
    questionLabel?: string;
};

function ratingStar(value: number): number {
    return Math.min(5, Math.max(1, Math.round(value)));
}

function starBadgeClass(star: number): string {
    if (star >= 5) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (star >= 4) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (star >= 3) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
}

export function filterSurveyResponsesForDrillDown(
    responses: BeautySurveyResponseRow[],
    drill: SurveyRatingDrillDown,
): BeautySurveyResponseRow[] {
    if (drill.questionId) {
        return responses.filter((r) =>
            r.survey_answers.some(
                (a) =>
                    String(a.question_id) === drill.questionId &&
                    typeof a.rating === 'number' &&
                    ratingStar(a.rating) === drill.star,
            ),
        );
    }
    return responses.filter((r) => ratingStar(r.overall_rating) === drill.star);
}

type Props = {
    drill: SurveyRatingDrillDown | null;
    rows: BeautySurveyResponseRow[];
    onClose: () => void;
};

export function SurveyRatingRespondentsModal({ drill, rows, onClose }: Props) {
    const { tm } = useLanguage();
    if (!drill) return null;

    const formatDateTime = (iso: string) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
        return d.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const title = drill.questionLabel
        ? tm('bSurveyReportStarDrillQuestion')
              .replace('{star}', String(drill.star))
              .replace('{question}', drill.questionLabel)
        : tm('bSurveyReportStarDrillOverall').replace('{star}', String(drill.star));

    const questionRating = (r: BeautySurveyResponseRow): number | null => {
        if (!drill.questionId) return ratingStar(r.overall_rating);
        const ans = r.survey_answers.find((a) => String(a.question_id) === drill.questionId);
        return typeof ans?.rating === 'number' ? ratingStar(ans.rating) : null;
    };

    type DrillGridRow = BeautySurveyResponseRow & { display_star: number; appt_when: string };

    const gridRows = useMemo<DrillGridRow[]>(
        () =>
            rows.map((r) => ({
                ...r,
                display_star: questionRating(r) ?? ratingStar(r.overall_rating),
                appt_when: [r.appointment_date ?? '', r.appointment_time ?? ''].filter(Boolean).join(' ') || '—',
            })),
        [rows, drill.questionId],
    );

    const gridColumns = useMemo<ReportColumnTableCol<DrillGridRow>[]>(
        () => [
            {
                key: 'display_star',
                header: tm('bSurveyReportScore'),
                type: 'number',
                size: 90,
                cell: (r) => (
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-black tabular-nums',
                            starBadgeClass(r.display_star),
                        )}
                    >
                        <Star size={11} className="fill-current" />
                        {r.display_star}
                        {r.would_recommend ? ' ✓' : ''}
                    </span>
                ),
            },
            {
                key: 'customer_name',
                header: tm('customer'),
                size: 160,
                cell: (r) => (
                    <div className="flex items-start gap-1.5 font-medium text-gray-800">
                        <User size={12} className="text-gray-400 mt-0.5 shrink-0" />
                        <span>{r.customer_name}</span>
                    </div>
                ),
            },
            {
                key: 'customer_phone',
                header: tm('bSurveyReportCustomerPhone'),
                size: 140,
                cell: (r) =>
                    r.customer_phone ? (
                        <a
                            href={`tel:${r.customer_phone.replace(/\s/g, '')}`}
                            className="inline-flex items-center gap-1 text-violet-700 hover:underline font-semibold"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Phone size={11} />
                            {r.customer_phone}
                        </a>
                    ) : (
                        '—'
                    ),
            },
            {
                key: 'service_name',
                header: tm('bSurveyReportLastService'),
                size: 160,
                cell: (r) => r.service_name ?? '—',
            },
            {
                key: 'specialist_name',
                header: tm('bSurveyReportLegacyStaff'),
                size: 140,
                cell: (r) => r.specialist_name ?? '—',
            },
            { key: 'appt_when', header: tm('bSurveyReportApptDate'), size: 140 },
            {
                key: 'created_at',
                header: tm('bSurveyReportSurveyDate'),
                size: 140,
                cell: (r) => formatDateTime(r.created_at),
            },
            {
                key: 'comment',
                header: tm('bSurveyReportComment'),
                size: 200,
                cell: (r) => r.comment?.trim() || '—',
            },
        ],
        [tm],
    );

    return (
        <PercentBodyModal onClose={onClose} size="wide" ariaLabel={title}>
            <div
                className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0"
                style={{
                    background: 'linear-gradient(135deg, #f5f3ff 0%, #fff 60%)',
                }}
            >
                <div className="min-w-0">
                    <p className="text-[10px] font-black text-violet-500 uppercase tracking-[0.16em]">
                        {tm('bSurveyReportStarDrillTitle')}
                    </p>
                    <h2 className="text-sm font-black text-gray-900 mt-1 truncate">{title}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {tm('bSurveyReportStarDrillCount').replace('{count}', String(rows.length))}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center"
                    aria-label={tm('close')}
                >
                    <X size={16} />
                </button>
            </div>

            <PercentBodyModalScrollBody className="p-0">
                {rows.length === 0 ? (
                    <p className="text-sm text-gray-500 py-12 text-center px-5">
                        {tm('bSurveyReportNoData')}
                    </p>
                ) : (
                    <div className="p-4 min-h-[320px]">
                        <ReportColumnTable
                            data={gridRows}
                            columns={gridColumns}
                            height="min(70vh, 640px)"
                            storageNamespace="beauty-survey-rating-drill"
                        />
                    </div>
                )}
            </PercentBodyModalScrollBody>
        </PercentBodyModal>
    );
}
