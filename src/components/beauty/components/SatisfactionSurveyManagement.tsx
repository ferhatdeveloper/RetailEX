import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Save, ClipboardList, ToggleLeft, ToggleRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import type {
    BeautySatisfactionSurvey,
    BeautySatisfactionQuestion,
    BeautySatisfactionLabels,
    SatisfactionLangCode,
    SatisfactionQuestionType,
} from '../../../types/beauty';
import '../ClinicStyles.css';

const LANGS: SatisfactionLangCode[] = ['tr', 'en', 'ar', 'ku'];

const EMPTY_LABELS = (): BeautySatisfactionLabels => ({ tr: '', en: '', ar: '', ku: '' });

export function SatisfactionSurveyManagement() {
    const { tm } = useLanguage();
    const [surveys, setSurveys] = useState<BeautySatisfactionSurvey[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [surveyName, setSurveyName] = useState('');
    const [surveyActive, setSurveyActive] = useState(false);
    const [surveyOrder, setSurveyOrder] = useState(0);
    const [questions, setQuestions] = useState<BeautySatisfactionQuestion[]>([]);
    const [savingSurvey, setSavingSurvey] = useState(false);
    const [savingQ, setSavingQ] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await beautyService.getSatisfactionSurveys();
            setSurveys(list);
            setSelectedId(cur => {
                if (cur && list.some(s => s.id === cur)) return cur;
                return list.length ? list[0].id : null;
            });
        } catch (e) {
            logger.crudError('SatisfactionSurveyManagement', 'load', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!selectedId) {
            setSurveyName('');
            setSurveyActive(false);
            setSurveyOrder(0);
            setQuestions([]);
            return;
        }
        const s = surveys.find(x => x.id === selectedId);
        if (s) {
            setSurveyName(s.name);
            setSurveyActive(s.is_active);
            setSurveyOrder(s.sort_order ?? 0);
        }
        void (async () => {
            try {
                const q = await beautyService.getSatisfactionQuestions(selectedId);
                setQuestions(q);
            } catch (e) {
                logger.crudError('SatisfactionSurveyManagement', 'loadQuestions', e);
                setQuestions([]);
            }
        })();
    }, [selectedId, surveys]);

    const handleSaveSurvey = async () => {
        if (!selectedId || !surveyName.trim()) return;
        setSavingSurvey(true);
        try {
            await beautyService.updateSatisfactionSurvey(selectedId, {
                name: surveyName.trim(),
                is_active: surveyActive,
                sort_order: surveyOrder,
            });
            await load();
        } catch (e) {
            logger.crudError('SatisfactionSurveyManagement', 'saveSurvey', e);
        } finally {
            setSavingSurvey(false);
        }
    };

    const handleCreateSurvey = async () => {
        try {
            const id = await beautyService.createSatisfactionSurvey({
                name: tm('bSurveyDefaultName'),
                is_active: false,
                sort_order: surveys.length,
            });
            await load();
            setSelectedId(id);
        } catch (e) {
            logger.crudError('SatisfactionSurveyManagement', 'createSurvey', e);
        }
    };

    const handleDeleteSurvey = async (id: string) => {
        if (!window.confirm(tm('bSurveyDeleteConfirm'))) return;
        try {
            await beautyService.deleteSatisfactionSurvey(id);
            if (selectedId === id) setSelectedId(null);
            await load();
        } catch (e) {
            logger.crudError('SatisfactionSurveyManagement', 'deleteSurvey', e);
        }
    };

    const handleAddQuestion = async () => {
        if (!selectedId) return;
        setSavingQ('new');
        try {
            await beautyService.createSatisfactionQuestion({
                survey_id: selectedId,
                sort_order: questions.length,
                question_type: 'rating',
                scale_max: 5,
                is_required: true,
                labels_json: { ...EMPTY_LABELS(), tr: tm('bSurveyNewQuestionTr') },
            });
            const q = await beautyService.getSatisfactionQuestions(selectedId);
            setQuestions(q);
        } catch (e) {
            logger.crudError('SatisfactionSurveyManagement', 'addQuestion', e);
        } finally {
            setSavingQ(null);
        }
    };

    const handleSaveQuestion = async (q: BeautySatisfactionQuestion) => {
        setSavingQ(q.id);
        try {
            await beautyService.updateSatisfactionQuestion(q.id, {
                sort_order: q.sort_order,
                question_type: q.question_type as SatisfactionQuestionType,
                scale_max: q.scale_max,
                is_required: q.is_required,
                labels_json: q.labels_json,
            });
            const list = await beautyService.getSatisfactionQuestions(selectedId!);
            setQuestions(list);
        } catch (e) {
            logger.crudError('SatisfactionSurveyManagement', 'saveQuestion', e);
        } finally {
            setSavingQ(null);
        }
    };

    const handleDeleteQuestion = async (id: string) => {
        try {
            await beautyService.deleteSatisfactionQuestion(id);
            if (selectedId) {
                const list = await beautyService.getSatisfactionQuestions(selectedId);
                setQuestions(list);
            }
        } catch (e) {
            logger.crudError('SatisfactionSurveyManagement', 'deleteQuestion', e);
        }
    };

    const updateQuestionLocal = (id: string, patch: Partial<BeautySatisfactionQuestion>) => {
        setQuestions(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
    };

    const updateLabel = (qid: string, lang: SatisfactionLangCode, value: string) => {
        setQuestions(prev =>
            prev.map(x => {
                if (x.id !== qid) return x;
                return { ...x, labels_json: { ...x.labels_json, [lang]: value } };
            })
        );
    };

    const langLabel = (code: SatisfactionLangCode) => {
        const m: Record<SatisfactionLangCode, string> = {
            tr: 'TR',
            en: 'EN',
            ar: 'AR',
            ku: 'KU',
        };
        return m[code];
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        <ClipboardList className="text-purple-600" size={26} />
                        {tm('bSatisfactionSurveysTitle')}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">{tm('bSatisfactionSurveysSubtitle')}</p>
                </div>
                <Button
                    onClick={handleCreateSurvey}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl"
                >
                    <Plus size={18} className="mr-2" />
                    {tm('bSurveyNew')}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 space-y-2">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 font-bold text-sm text-gray-700">
                            {tm('bSurveyList')}
                        </div>
                        {loading ? (
                            <div className="p-6 text-center text-gray-400 text-sm">{tm('bLoading')}</div>
                        ) : surveys.length === 0 ? (
                            <div className="p-6 text-center text-gray-400 text-sm">{tm('bSurveyEmpty')}</div>
                        ) : (
                            <ul className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                                {surveys.map(s => (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(s.id)}
                                            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                                                selectedId === s.id ? 'bg-purple-50' : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <span className="font-semibold text-gray-900 truncate">{s.name}</span>
                                            {s.is_active ? (
                                                <span className="text-[10px] font-black uppercase text-green-700 bg-green-100 px-2 py-0.5 rounded">
                                                    {tm('bSurveyActive')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-gray-400">{tm('bSurveyInactive')}</span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-8 space-y-4">
                    {!selectedId ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
                            {tm('bSurveySelectOrCreate')}
                        </div>
                    ) : (
                        <>
                            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="text-lg font-bold text-gray-900">{tm('bSurveySettings')}</h2>
                                    <Button
                                        variant="outline"
                                        className="text-red-600 border-red-200"
                                        onClick={() => handleDeleteSurvey(selectedId)}
                                    >
                                        <Trash2 size={16} className="mr-1" />
                                        {tm('bSurveyDelete')}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                                            {tm('bSurveyName')}
                                        </label>
                                        <Input
                                            value={surveyName}
                                            onChange={e => setSurveyName(e.target.value)}
                                            className="mt-1 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                                            {tm('bSurveySortOrder')}
                                        </label>
                                        <Input
                                            type="number"
                                            value={surveyOrder}
                                            onChange={e => setSurveyOrder(Number(e.target.value) || 0)}
                                            className="mt-1 rounded-xl"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSurveyActive(a => !a)}
                                    className="flex items-center gap-2 text-sm font-bold text-gray-700"
                                >
                                    {surveyActive ? <ToggleRight className="text-green-600" size={28} /> : <ToggleLeft className="text-gray-400" size={28} />}
                                    {surveyActive ? tm('bSurveyActiveHint') : tm('bSurveyInactiveHint')}
                                </button>
                                <Button
                                    onClick={handleSaveSurvey}
                                    disabled={savingSurvey || !surveyName.trim()}
                                    className="bg-purple-600 hover:bg-purple-700"
                                >
                                    <Save size={16} className="mr-2" />
                                    {savingSurvey ? tm('bSaving') : tm('save')}
                                </Button>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2 font-bold text-gray-800">
                                        <GripVertical size={18} className="text-gray-400" />
                                        {tm('bSurveyQuestions')}
                                    </div>
                                    <Button size="sm" onClick={handleAddQuestion} disabled={!!savingQ} className="bg-purple-600">
                                        <Plus size={14} className="mr-1" />
                                        {tm('bSurveyAddQuestion')}
                                    </Button>
                                </div>
                                <div className="divide-y divide-gray-50 max-h-[min(70vh,900px)] overflow-y-auto">
                                    {questions.map(q => (
                                        <div key={q.id} className="p-5 space-y-4 bg-white">
                                            <div className="flex flex-wrap gap-3 items-end">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-500 uppercase">
                                                        {tm('bSurveyQuestionType')}
                                                    </label>
                                                    <select
                                                        value={q.question_type}
                                                        onChange={e =>
                                                            updateQuestionLocal(q.id, {
                                                                question_type: e.target.value as SatisfactionQuestionType,
                                                            })
                                                        }
                                                        className="mt-1 block h-10 rounded-xl border border-gray-200 px-3 text-sm"
                                                    >
                                                        <option value="rating">{tm('bSurveyTypeRating')}</option>
                                                        <option value="text">{tm('bSurveyTypeText')}</option>
                                                        <option value="yes_no">{tm('bSurveyTypeYesNo')}</option>
                                                    </select>
                                                </div>
                                                {q.question_type === 'rating' && (
                                                    <div>
                                                        <label className="text-[10px] font-black text-gray-500 uppercase">
                                                            {tm('bSurveyScaleMax')}
                                                        </label>
                                                        <Input
                                                            type="number"
                                                            min={2}
                                                            max={10}
                                                            value={q.scale_max}
                                                            onChange={e =>
                                                                updateQuestionLocal(q.id, {
                                                                    scale_max: Number(e.target.value) || 5,
                                                                })
                                                            }
                                                            className="mt-1 w-24 rounded-xl"
                                                        />
                                                    </div>
                                                )}
                                                <label className="flex items-center gap-2 text-sm cursor-pointer pb-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={q.is_required}
                                                        onChange={e =>
                                                            updateQuestionLocal(q.id, { is_required: e.target.checked })
                                                        }
                                                    />
                                                    {tm('bSurveyRequired')}
                                                </label>
                                                <div className="flex-1" />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-red-600"
                                                    onClick={() => handleDeleteQuestion(q.id)}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveQuestion(q)}
                                                    disabled={savingQ === q.id}
                                                    className="bg-purple-600"
                                                >
                                                    {savingQ === q.id ? tm('bSaving') : tm('save')}
                                                </Button>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {LANGS.map(lang => (
                                                    <div key={lang}>
                                                        <label className="text-[10px] font-black text-gray-500 uppercase">
                                                            {tm('bSurveyQuestionText')} ({langLabel(lang)})
                                                        </label>
                                                        <Input
                                                            value={q.labels_json[lang] ?? ''}
                                                            onChange={e => updateLabel(q.id, lang, e.target.value)}
                                                            dir={lang === 'ar' || lang === 'ku' ? 'rtl' : 'ltr'}
                                                            className="mt-1 rounded-xl"
                                                            placeholder=""
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {questions.length === 0 && (
                                        <div className="p-8 text-center text-gray-400 text-sm">{tm('bSurveyNoQuestions')}</div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
