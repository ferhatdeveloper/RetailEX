import React, { useCallback, useEffect, useState } from 'react';
import {
    Card,
    Button,
    Input,
    InputNumber,
    Select,
    Switch,
    Typography,
    Space,
    Tag,
    List,
    Spin,
    Empty,
    Popconfirm,
    Checkbox,
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    SaveOutlined,
    HolderOutlined,
} from '@ant-design/icons';
import { ClipboardList } from 'lucide-react';
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
import {
    RETAILEX_BORDER_SUBTLE,
    RETAILEX_PAGE_BG,
    RETAILEX_PRIMARY,
    RETAILEX_TEXT_PRIMARY,
} from '../../../theme/retailexAntdTheme';
import { RetailExFlatFieldLabel } from '../../shared/RetailExFlatModal';

const LANGS: SatisfactionLangCode[] = ['tr', 'en', 'ar', 'ku'];

const EMPTY_LABELS = (): BeautySatisfactionLabels => ({ tr: '', en: '', ar: '', ku: '' });

export function SatisfactionSurveyManagement() {
    const { tm, t } = useLanguage();
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

    useEffect(() => {
        void load();
    }, [load]);

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
            }),
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

    const questionTypeOptions = [
        { value: 'rating' as const, label: tm('bSurveyTypeRating') },
        { value: 'text' as const, label: tm('bSurveyTypeText') },
        { value: 'yes_no' as const, label: tm('bSurveyTypeYesNo') },
    ];

    return (
        <div className="flex min-h-0 w-full flex-col" style={{ backgroundColor: RETAILEX_PAGE_BG }}>
            <div className="w-full px-4 pb-4 pt-2">
                <Card bordered className="!shadow-none" styles={{ body: { padding: 0 } }}>
                    <div
                        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
                        style={{ borderColor: RETAILEX_BORDER_SUBTLE }}
                    >
                        <Space align="start" size={12}>
                            <div
                                className="flex h-12 w-12 items-center justify-center rounded-xl border"
                                style={{
                                    background: '#f9f0ff',
                                    borderColor: '#d3adf7',
                                    color: RETAILEX_PRIMARY,
                                }}
                                aria-hidden
                            >
                                <ClipboardList className="h-6 w-6" />
                            </div>
                            <div>
                                <Typography.Title
                                    level={5}
                                    className="!mb-0.5 !text-base !font-semibold"
                                    style={{ color: RETAILEX_PRIMARY }}
                                >
                                    {tm('bSatisfactionSurveysTitle')}
                                </Typography.Title>
                                <Typography.Text type="secondary" className="text-xs">
                                    {tm('bSatisfactionSurveysSubtitle')}
                                </Typography.Text>
                            </div>
                        </Space>
                        <Button type="primary" shape="round" icon={<PlusOutlined />} onClick={handleCreateSurvey}>
                            {tm('bSurveyNew')}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-12">
                        <div className="lg:col-span-4">
                            <Card
                                bordered
                                size="small"
                                className="!shadow-none h-full min-h-[200px]"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                                title={
                                    <Typography.Text strong style={{ color: RETAILEX_TEXT_PRIMARY }}>
                                        {tm('bSurveyList')}
                                    </Typography.Text>
                                }
                                styles={{ body: { padding: 0 } }}
                            >
                                {loading ? (
                                    <div className="flex justify-center py-12">
                                        <Spin />
                                    </div>
                                ) : surveys.length === 0 ? (
                                    <Empty className="py-8" description={tm('bSurveyEmpty')} />
                                ) : (
                                    <List
                                        dataSource={surveys}
                                        split
                                        renderItem={s => (
                                            <List.Item
                                                className="!cursor-pointer !px-4 transition-colors hover:bg-slate-50"
                                                style={{
                                                    backgroundColor:
                                                        selectedId === s.id ? 'rgba(114, 46, 209, 0.06)' : undefined,
                                                    borderBlockColor: RETAILEX_BORDER_SUBTLE,
                                                }}
                                                onClick={() => setSelectedId(s.id)}
                                            >
                                                <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                                    <Typography.Text strong className="truncate !text-[#262626]">
                                                        {s.name}
                                                    </Typography.Text>
                                                    {s.is_active ? (
                                                        <Tag color="success" className="!m-0 shrink-0">
                                                            {tm('bSurveyActive')}
                                                        </Tag>
                                                    ) : (
                                                        <Typography.Text type="secondary" className="!text-[10px] shrink-0">
                                                            {tm('bSurveyInactive')}
                                                        </Typography.Text>
                                                    )}
                                                </div>
                                            </List.Item>
                                        )}
                                    />
                                )}
                            </Card>
                        </div>

                        <div className="flex min-h-0 flex-col gap-4 lg:col-span-8">
                            {!selectedId ? (
                                <Card
                                    bordered
                                    className="!shadow-none flex min-h-[320px] flex-1 items-center justify-center"
                                    style={{
                                        borderStyle: 'dashed',
                                        borderColor: RETAILEX_BORDER_SUBTLE,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    <Empty description={tm('bSurveySelectOrCreate')} />
                                </Card>
                            ) : (
                                <>
                                    <Card
                                        bordered
                                        className="!shadow-none"
                                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                                        title={
                                            <Typography.Text strong style={{ color: RETAILEX_TEXT_PRIMARY }}>
                                                {tm('bSurveySettings')}
                                            </Typography.Text>
                                        }
                                        extra={
                                            <Popconfirm
                                                title={tm('bSurveyDeleteConfirm')}
                                                okText={tm('delete')}
                                                cancelText={tm('cancel')}
                                                onConfirm={() => void handleDeleteSurvey(selectedId)}
                                            >
                                                <Button danger type="default" icon={<DeleteOutlined />}>
                                                    {tm('bSurveyDelete')}
                                                </Button>
                                            </Popconfirm>
                                        }
                                    >
                                        <Space direction="vertical" size="middle" className="w-full">
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div>
                                                    <RetailExFlatFieldLabel>{tm('bSurveyName')}</RetailExFlatFieldLabel>
                                                    <Input
                                                        className="!rounded-2xl !px-4 !py-2.5"
                                                        value={surveyName}
                                                        onChange={e => setSurveyName(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <RetailExFlatFieldLabel>{tm('bSurveySortOrder')}</RetailExFlatFieldLabel>
                                                    <InputNumber
                                                        className="w-full !rounded-2xl"
                                                        min={0}
                                                        value={surveyOrder}
                                                        onChange={v => setSurveyOrder(Number(v) || 0)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <Switch checked={surveyActive} onChange={setSurveyActive} />
                                                <Typography.Text type="secondary" className="text-sm">
                                                    {surveyActive ? tm('bSurveyActiveHint') : tm('bSurveyInactiveHint')}
                                                </Typography.Text>
                                            </div>
                                            <Button
                                                type="primary"
                                                icon={<SaveOutlined />}
                                                onClick={() => void handleSaveSurvey()}
                                                disabled={savingSurvey || !surveyName.trim()}
                                                loading={savingSurvey}
                                            >
                                                {savingSurvey ? tm('bSaving') : tm('save')}
                                            </Button>
                                        </Space>
                                    </Card>

                                    <Card
                                        bordered
                                        className="!shadow-none flex min-h-0 flex-1 flex-col overflow-hidden"
                                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                                        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }}
                                        title={
                                            <Space>
                                                <HolderOutlined className="text-slate-400" />
                                                <Typography.Text strong style={{ color: RETAILEX_TEXT_PRIMARY }}>
                                                    {tm('bSurveyQuestions')}
                                                </Typography.Text>
                                            </Space>
                                        }
                                        extra={
                                            <Button
                                                type="primary"
                                                size="small"
                                                icon={<PlusOutlined />}
                                                onClick={() => void handleAddQuestion()}
                                                disabled={!!savingQ}
                                                loading={savingQ === 'new'}
                                            >
                                                {tm('bSurveyAddQuestion')}
                                            </Button>
                                        }
                                    >
                                        <div className="min-h-0 flex-1 overflow-y-auto">
                                            {questions.length === 0 ? (
                                                <Empty className="py-10" description={tm('bSurveyNoQuestions')} />
                                            ) : (
                                                questions.map(q => (
                                                    <div
                                                        key={q.id}
                                                        className="space-y-4 border-b p-5 last:border-b-0"
                                                        style={{ borderColor: RETAILEX_BORDER_SUBTLE }}
                                                    >
                                                        <div className="flex flex-wrap items-end gap-3">
                                                            <div className="min-w-[140px]">
                                                                <RetailExFlatFieldLabel>
                                                                    {tm('bSurveyQuestionType')}
                                                                </RetailExFlatFieldLabel>
                                                                <Select
                                                                    className="w-full [&_.ant-select-selector]:!rounded-xl"
                                                                    value={q.question_type}
                                                                    onChange={v =>
                                                                        updateQuestionLocal(q.id, {
                                                                            question_type: v as SatisfactionQuestionType,
                                                                        })
                                                                    }
                                                                    options={questionTypeOptions}
                                                                />
                                                            </div>
                                                            {q.question_type === 'rating' && (
                                                                <div>
                                                                    <RetailExFlatFieldLabel>
                                                                        {tm('bSurveyScaleMax')}
                                                                    </RetailExFlatFieldLabel>
                                                                    <InputNumber
                                                                        className="!rounded-xl"
                                                                        min={2}
                                                                        max={10}
                                                                        value={q.scale_max}
                                                                        onChange={v =>
                                                                            updateQuestionLocal(q.id, {
                                                                                scale_max: Number(v) || 5,
                                                                            })
                                                                        }
                                                                    />
                                                                </div>
                                                            )}
                                                            <Checkbox
                                                                checked={q.is_required}
                                                                onChange={e =>
                                                                    updateQuestionLocal(q.id, {
                                                                        is_required: e.target.checked,
                                                                    })
                                                                }
                                                            >
                                                                {tm('bSurveyRequired')}
                                                            </Checkbox>
                                                            <div className="flex flex-1 flex-wrap justify-end gap-2">
                                                                <Popconfirm
                                                                    title={t.confirmDelete}
                                                                    okText={tm('delete')}
                                                                    cancelText={tm('cancel')}
                                                                    onConfirm={() => void handleDeleteQuestion(q.id)}
                                                                >
                                                                    <Button danger size="small" icon={<DeleteOutlined />} />
                                                                </Popconfirm>
                                                                <Button
                                                                    type="primary"
                                                                    size="small"
                                                                    onClick={() => void handleSaveQuestion(q)}
                                                                    loading={savingQ === q.id}
                                                                >
                                                                    {savingQ === q.id ? tm('bSaving') : tm('save')}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                            {LANGS.map(lang => (
                                                                <div key={lang}>
                                                                    <RetailExFlatFieldLabel>
                                                                        {tm('bSurveyQuestionText')} ({langLabel(lang)})
                                                                    </RetailExFlatFieldLabel>
                                                                    <Input
                                                                        className="!rounded-xl !px-4 !py-2"
                                                                        value={q.labels_json[lang] ?? ''}
                                                                        onChange={e =>
                                                                            updateLabel(q.id, lang, e.target.value)
                                                                        }
                                                                        dir={lang === 'ar' || lang === 'ku' ? 'rtl' : 'ltr'}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </Card>
                                </>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
