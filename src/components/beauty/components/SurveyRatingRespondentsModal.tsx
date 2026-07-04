import React from 'react';
import { Phone, Star, User, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautySurveyResponseRow } from '../../../types/beauty';
import { cn } from '../../ui/utils';

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
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-50/90 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100 sticky top-0 z-10">
                                    <th className="py-2.5 px-3">{tm('bSurveyReportScore')}</th>
                                    <th className="py-2.5 px-3">{tm('customer')}</th>
                                    <th className="py-2.5 px-3">{tm('bSurveyReportCustomerPhone')}</th>
                                    <th className="py-2.5 px-3">{tm('bSurveyReportLastService')}</th>
                                    <th className="py-2.5 px-3">{tm('bSurveyReportLegacyStaff')}</th>
                                    <th className="py-2.5 px-3">{tm('bSurveyReportApptDate')}</th>
                                    <th className="py-2.5 px-3">{tm('bSurveyReportSurveyDate')}</th>
                                    <th className="py-2.5 px-3">{tm('bSurveyReportComment')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const star = questionRating(r) ?? ratingStar(r.overall_rating);
                                    const apptWhen = [
                                        r.appointment_date ?? '',
                                        r.appointment_time ?? '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ');
                                    return (
                                        <tr
                                            key={r.id}
                                            className="border-b border-gray-50 hover:bg-violet-50/25 align-top"
                                        >
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-black tabular-nums',
                                                        starBadgeClass(star),
                                                    )}
                                                >
                                                    <Star size={11} className="fill-current" />
                                                    {star}
                                                    {r.would_recommend ? ' ✓' : ''}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <div className="flex items-start gap-1.5 font-medium text-gray-800">
                                                    <User size={12} className="text-gray-400 mt-0.5 shrink-0" />
                                                    <span>{r.customer_name}</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                                {r.customer_phone ? (
                                                    <a
                                                        href={`tel:${r.customer_phone.replace(/\s/g, '')}`}
                                                        className="inline-flex items-center gap-1 text-violet-700 hover:underline font-semibold"
                                                    >
                                                        <Phone size={11} />
                                                        {r.customer_phone}
                                                    </a>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-gray-700 max-w-[10rem]">
                                                {r.service_name ?? '—'}
                                            </td>
                                            <td className="py-2.5 px-3 text-gray-700">
                                                {r.specialist_name ?? '—'}
                                            </td>
                                            <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                                {apptWhen || '—'}
                                            </td>
                                            <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">
                                                {formatDateTime(r.created_at)}
                                            </td>
                                            <td className="py-2.5 px-3 text-gray-600 max-w-xs">
                                                {r.comment?.trim() || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </PercentBodyModalScrollBody>
        </PercentBodyModal>
    );
}
