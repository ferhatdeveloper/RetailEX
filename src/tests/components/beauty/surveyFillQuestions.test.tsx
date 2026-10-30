/**
 * Anket doldurma soruları kart / puan / evet-hayır olarak kalır.
 * Soru alanı tablo bileşeniyle çizilmez; cevaplar kayıt yükünde durur.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BeautyFeedbackSurveyModal } from '../../../components/beauty/components/BeautyFeedbackSurveyModal';
import { SatisfactionSurveyManagement } from '../../../components/beauty/components/SatisfactionSurveyManagement';

const { getActive, addFeedback, getSurveys, getQuestions, getCompleted, getFeedbackIds } = vi.hoisted(() => ({
    getActive: vi.fn(),
    addFeedback: vi.fn(),
    getSurveys: vi.fn(),
    getQuestions: vi.fn(),
    getCompleted: vi.fn(),
    getFeedbackIds: vi.fn(),
}));

vi.mock('../../../contexts/LanguageContext', async () => {
    const actual = await vi.importActual<typeof import('../../../locales/module-translations')>(
        '../../../locales/module-translations',
    );
    return {
        useLanguage: () => ({
            language: 'tr' as const,
            t: { confirmDelete: 'Silinsin mi?' },
            tm: (key: string) => actual.translate(key, 'tr'),
            setLanguage: () => undefined,
        }),
    };
});

vi.mock('../../../shared/hooks/usePermission', () => ({
    usePermission: () => ({ hasPermission: () => true }),
}));

vi.mock('../../../services/loggingService', () => ({
    logger: { crudError: vi.fn() },
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../services/beautyService', () => ({
    beautyService: {
        getActiveSatisfactionSurveyWithQuestions: (...args: unknown[]) => getActive(...args),
        addFeedback: (...args: unknown[]) => addFeedback(...args),
        upsertFeedbackForAppointment: vi.fn(),
        getSatisfactionSurveys: (...args: unknown[]) => getSurveys(...args),
        getSatisfactionQuestions: (...args: unknown[]) => getQuestions(...args),
        getCompletedAppointmentsForDay: (...args: unknown[]) => getCompleted(...args),
        getFeedbackAppointmentIds: (...args: unknown[]) => getFeedbackIds(...args),
        updateSatisfactionSurvey: vi.fn(),
        createSatisfactionSurvey: vi.fn(),
        deleteSatisfactionSurvey: vi.fn(),
        createSatisfactionQuestion: vi.fn(),
        updateSatisfactionQuestion: vi.fn(),
        deleteSatisfactionQuestion: vi.fn(),
    },
}));

const labels = { tr: '', en: '', ar: '', ku: '' };

describe('Anket soru formu', () => {
    beforeEach(() => {
        getActive.mockReset();
        addFeedback.mockReset();
        getSurveys.mockReset();
        getQuestions.mockReset();
        getCompleted.mockReset();
        getFeedbackIds.mockReset();
        addFeedback.mockResolvedValue(undefined);
        getSurveys.mockResolvedValue([
            { id: 'sv-1', name: 'Memnuniyet', is_active: true, sort_order: 0 },
        ]);
        getQuestions.mockResolvedValue([
            {
                id: 'q-rating',
                survey_id: 'sv-1',
                sort_order: 0,
                question_type: 'rating',
                scale_max: 5,
                is_required: true,
                labels_json: { ...labels, tr: 'Hizmet puanı' },
            },
        ]);
        getCompleted.mockResolvedValue([
            {
                id: 'apt-1',
                customer_id: 'c1',
                customer_name: 'Ayşe Yılmaz',
                service_name: 'Cilt bakımı',
                appointment_date: '2026-10-30',
                appointment_time: '14:30:00',
            },
        ]);
        getFeedbackIds.mockResolvedValue(new Set<string>());
        getActive.mockResolvedValue({
            survey: { id: 'sv-1', name: 'Memnuniyet', is_active: true, sort_order: 0 },
            questions: [
                {
                    id: 'q-rating',
                    survey_id: 'sv-1',
                    sort_order: 0,
                    question_type: 'rating',
                    scale_max: 5,
                    is_required: true,
                    labels_json: { ...labels, tr: 'Hizmet puanı' },
                },
                {
                    id: 'q-yes',
                    survey_id: 'sv-1',
                    sort_order: 1,
                    question_type: 'yes_no',
                    scale_max: 2,
                    is_required: true,
                    labels_json: { ...labels, tr: 'Tekrar gelir misiniz?' },
                },
                {
                    id: 'q-text',
                    survey_id: 'sv-1',
                    sort_order: 2,
                    question_type: 'text',
                    scale_max: 0,
                    is_required: false,
                    labels_json: { ...labels, tr: 'Yorumunuz' },
                },
            ],
        });
    });

    it('doldurma sorularını tablo yerine puan, evet-hayır ve metin olarak çizer', async () => {
        render(
            <BeautyFeedbackSurveyModal
                open
                onClose={() => undefined}
                customerId="c1"
                customerName="Ayşe Yılmaz"
                variant="standalone"
            />,
        );

        expect(await screen.findByText('Hizmet puanı')).toBeInTheDocument();
        expect(screen.getByText('Tekrar gelir misiniz?')).toBeInTheDocument();
        expect(screen.getByText('Yorumunuz')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hizmet puanı 3' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Evet' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hayır' })).toBeInTheDocument();
        expect(document.querySelector('table')).toBeNull();
        expect(document.body.textContent).not.toContain('DevExDataGrid');
    });

    it('gönderince soru metni ve cevapları kayıt yükünde tutar', async () => {
        render(
            <BeautyFeedbackSurveyModal
                open
                onClose={() => undefined}
                customerId="c1"
                variant="standalone"
            />,
        );

        await screen.findByText('Hizmet puanı');
        fireEvent.click(screen.getByRole('button', { name: 'Hizmet puanı 4' }));
        fireEvent.click(screen.getByRole('button', { name: 'Hayır' }));
        const boxes = screen.getAllByRole('textbox');
        fireEvent.change(boxes[0], { target: { value: 'Çok iyi' } });
        fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));

        await waitFor(() => expect(addFeedback).toHaveBeenCalledTimes(1));
        const payload = addFeedback.mock.calls[0][0] as {
            survey_answers: Array<{ question_id: string; rating?: number; yes_no?: boolean; text?: string; label_snapshot?: string }>;
        };
        expect(payload.survey_answers).toEqual([
            { question_id: 'q-rating', rating: 4, label_snapshot: 'Hizmet puanı' },
            { question_id: 'q-yes', yes_no: false, label_snapshot: 'Tekrar gelir misiniz?' },
            { question_id: 'q-text', text: 'Çok iyi', label_snapshot: 'Yorumunuz' },
        ]);
    });

    it('soru düzenleme alanını tablo bileşeniyle çizmez', async () => {
        render(<SatisfactionSurveyManagement />);

        expect(await screen.findByDisplayValue('Hizmet puanı')).toBeInTheDocument();
        expect(screen.getByText('Zorunlu')).toBeInTheDocument();
        expect(screen.getByText(/Ayşe Yılmaz/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Anket yap' })).toBeInTheDocument();
        expect(document.querySelector('table')).toBeNull();
    });
});
