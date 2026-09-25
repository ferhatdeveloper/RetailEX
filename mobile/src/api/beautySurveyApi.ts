import { pgQuery } from './pgClient';
import {
  postgrestDelete,
  postgrestGet,
  postgrestPatch,
  postgrestPost,
} from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import {
  beautyAppointmentsTable,
  beautyCustomerFeedbackTable,
  beautySatisfactionQuestionsTable,
  beautySatisfactionSurveysTable,
  customersTable,
  firmNr,
  newUuid,
  periodNr,
} from './erpTables';
import type { BeautyAppointment } from './beautyApi';

const BEAUTY_SCHEMA = { schema: 'beauty' as const };

function beautyBare(sqlName: string): string {
  return sqlName.replace(/^beauty\./, '');
}

function surveysPath(fn = firmNr()): string {
  return `/${beautyBare(beautySatisfactionSurveysTable(fn))}`;
}

function questionsPath(fn = firmNr()): string {
  return `/${beautyBare(beautySatisfactionQuestionsTable(fn))}`;
}

function feedbackPath(fn = firmNr(), pn = periodNr()): string {
  return `/${beautyBare(beautyCustomerFeedbackTable(fn, pn))}`;
}

function apptPath(fn = firmNr(), pn = periodNr()): string {
  return `/${beautyBare(beautyAppointmentsTable(fn, pn))}`;
}

function pgUuidOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function isUuid(raw: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(raw || '').trim(),
  );
}

export type SatisfactionLangCode = 'tr' | 'en' | 'ar' | 'ku';
export type SatisfactionQuestionType = 'rating' | 'text' | 'yes_no';
export type BeautySatisfactionLabels = Partial<Record<SatisfactionLangCode, string>>;

export type BeautySatisfactionSurvey = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type BeautySatisfactionQuestion = {
  id: string;
  survey_id: string;
  sort_order: number;
  question_type: SatisfactionQuestionType | string;
  scale_max: number;
  is_required: boolean;
  labels_json: BeautySatisfactionLabels;
  created_at?: string;
  updated_at?: string;
};

export type BeautySurveyAnswer = {
  question_id: string;
  rating?: number;
  text?: string;
  yes_no?: boolean;
  label_snapshot?: string;
};

export type BeautyCustomerFeedbackInput = {
  appointment_id?: string | null;
  customer_id?: string | null;
  service_rating?: number;
  staff_rating?: number;
  cleanliness_rating?: number;
  overall_rating?: number;
  comment?: string | null;
  would_recommend?: boolean;
  survey_id?: string | null;
  survey_answers?: BeautySurveyAnswer[] | null;
};

export type SurveyResultsSummary = {
  response_count: number;
  avg_overall: number;
  recommend_pct: number;
  responses: Array<{
    id: string;
    created_at: string | null;
    customer_id: string | null;
    customer_name: string;
    overall_rating: number;
    would_recommend: boolean;
    comment: string | null;
    appointment_id: string | null;
  }>;
};

export function parseSatisfactionLabels(raw: unknown): BeautySatisfactionLabels {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: BeautySatisfactionLabels = {};
  for (const k of ['tr', 'en', 'ar', 'ku'] as const) {
    if (typeof o[k] === 'string') out[k] = o[k];
  }
  return out;
}

function mapSurvey(r: Record<string, unknown>): BeautySatisfactionSurvey {
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    is_active: r.is_active === true || r.is_active === 'true' || r.is_active === 1,
    sort_order: Number(r.sort_order) || 0,
    created_at: r.created_at != null ? String(r.created_at) : undefined,
    updated_at: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

function mapQuestion(r: Record<string, unknown>): BeautySatisfactionQuestion {
  return {
    id: String(r.id ?? ''),
    survey_id: String(r.survey_id ?? ''),
    sort_order: Number(r.sort_order) || 0,
    question_type: String(r.question_type ?? 'rating'),
    scale_max: Math.max(2, Number(r.scale_max) || 5),
    is_required: !(r.is_required === false || r.is_required === 0 || String(r.is_required).toLowerCase() === 'false'),
    labels_json: parseSatisfactionLabels(r.labels_json),
    created_at: r.created_at != null ? String(r.created_at) : undefined,
    updated_at: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

function parseSurveyAnswers(raw: unknown): BeautySurveyAnswer[] | null {
  if (raw == null) return null;
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v)) return null;
  return v as BeautySurveyAnswer[];
}

export async function fetchSatisfactionSurveys(): Promise<BeautySatisfactionSurvey[]> {
  return runDataTransport({
    label: 'fetchSatisfactionSurveys',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        surveysPath(),
        { select: '*', order: 'sort_order.asc,created_at.asc', limit: 500 },
        BEAUTY_SCHEMA,
      );
      return (Array.isArray(rows) ? rows : []).map(mapSurvey);
    },
    viaBridge: async () => {
      const t = beautySatisfactionSurveysTable();
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM ${t} ORDER BY sort_order ASC, created_at ASC`,
      );
      return res.rows.map(mapSurvey);
    },
  });
}

export async function fetchSatisfactionQuestions(
  surveyId: string,
): Promise<BeautySatisfactionQuestion[]> {
  if (!surveyId) return [];
  return runDataTransport({
    label: 'fetchSatisfactionQuestions',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        questionsPath(),
        {
          select: '*',
          survey_id: `eq.${surveyId}`,
          order: 'sort_order.asc,created_at.asc',
          limit: 500,
        },
        BEAUTY_SCHEMA,
      );
      return (Array.isArray(rows) ? rows : []).map(mapQuestion);
    },
    viaBridge: async () => {
      const t = beautySatisfactionQuestionsTable();
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM ${t} WHERE survey_id = $1 ORDER BY sort_order ASC, created_at ASC`,
        [surveyId],
      );
      return res.rows.map(mapQuestion);
    },
  });
}

export async function getActiveSatisfactionSurveyWithQuestions(): Promise<{
  survey: BeautySatisfactionSurvey | null;
  questions: BeautySatisfactionQuestion[];
}> {
  return runDataTransport({
    label: 'getActiveSatisfactionSurveyWithQuestions',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        surveysPath(),
        {
          select: '*',
          is_active: 'eq.true',
          order: 'sort_order.asc,created_at.asc',
          limit: 1,
        },
        BEAUTY_SCHEMA,
      );
      const survey = Array.isArray(rows) && rows[0] ? mapSurvey(rows[0]) : null;
      if (!survey) return { survey: null, questions: [] };
      const questions = await fetchSatisfactionQuestions(survey.id);
      return { survey, questions };
    },
    viaBridge: async () => {
      const t = beautySatisfactionSurveysTable();
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM ${t} WHERE is_active = true ORDER BY sort_order ASC, created_at ASC LIMIT 1`,
      );
      const survey = res.rows[0] ? mapSurvey(res.rows[0]) : null;
      if (!survey) return { survey: null, questions: [] };
      const questions = await fetchSatisfactionQuestions(survey.id);
      return { survey, questions };
    },
  });
}

async function deactivateOtherSatisfactionSurveys(exceptId: string): Promise<void> {
  await runDataTransport({
    label: 'deactivateOtherSatisfactionSurveys',
    viaRest: async () => {
      await postgrestPatch(
        `${surveysPath()}?id=neq.${encodeURIComponent(exceptId)}&is_active=eq.true`,
        { is_active: false, updated_at: new Date().toISOString() },
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const t = beautySatisfactionSurveysTable();
      await pgQuery(
        `UPDATE ${t} SET is_active = false, updated_at = NOW() WHERE id <> $1 AND is_active = true`,
        [exceptId],
      );
    },
  });
}

export async function createSatisfactionSurvey(
  data: Partial<BeautySatisfactionSurvey>,
): Promise<string> {
  const id = newUuid();
  await runDataTransport({
    label: 'createSatisfactionSurvey',
    viaRest: async () => {
      await postgrestPost(
        surveysPath(),
        [
          {
            id,
            name: data.name ?? 'Anket',
            is_active: data.is_active ?? false,
            sort_order: data.sort_order ?? 0,
          },
        ],
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const t = beautySatisfactionSurveysTable();
      await pgQuery(
        `INSERT INTO ${t} (id, name, is_active, sort_order) VALUES ($1,$2,$3,$4)`,
        [id, data.name ?? 'Anket', data.is_active ?? false, data.sort_order ?? 0],
      );
    },
  });
  if (data.is_active) await deactivateOtherSatisfactionSurveys(id);
  return id;
}

export async function updateSatisfactionSurvey(
  id: string,
  data: Partial<BeautySatisfactionSurvey>,
): Promise<void> {
  await runDataTransport({
    label: 'updateSatisfactionSurvey',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        surveysPath(),
        { select: '*', id: `eq.${id}`, limit: 1 },
        BEAUTY_SCHEMA,
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return;
      const merged = {
        name: data.name !== undefined ? data.name : String(row.name ?? ''),
        is_active:
          data.is_active !== undefined
            ? data.is_active
            : row.is_active === true || row.is_active === 'true' || row.is_active === 1,
        sort_order:
          data.sort_order !== undefined ? data.sort_order : Number(row.sort_order) || 0,
      };
      await postgrestPatch(
        `${surveysPath()}?id=eq.${encodeURIComponent(id)}`,
        { ...merged, updated_at: new Date().toISOString() },
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );
      if (merged.is_active) await deactivateOtherSatisfactionSurveys(id);
    },
    viaBridge: async () => {
      const t = beautySatisfactionSurveysTable();
      const { rows } = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM ${t} WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      if (!row) return;
      const merged = {
        name: data.name !== undefined ? data.name : String(row.name ?? ''),
        is_active:
          data.is_active !== undefined
            ? data.is_active
            : row.is_active === true || row.is_active === 'true' || row.is_active === 1,
        sort_order:
          data.sort_order !== undefined ? data.sort_order : Number(row.sort_order) || 0,
      };
      await pgQuery(
        `UPDATE ${t} SET name = $2, is_active = $3, sort_order = $4, updated_at = NOW() WHERE id = $1`,
        [id, merged.name, merged.is_active, merged.sort_order],
      );
      if (merged.is_active) await deactivateOtherSatisfactionSurveys(id);
    },
  });
}

export async function deleteSatisfactionSurvey(id: string): Promise<void> {
  await runDataTransport({
    label: 'deleteSatisfactionSurvey',
    viaRest: async () => {
      await postgrestDelete(`${surveysPath()}?id=eq.${encodeURIComponent(id)}`, {
        ...BEAUTY_SCHEMA,
        prefer: 'return=minimal',
      });
    },
    viaBridge: async () => {
      const t = beautySatisfactionSurveysTable();
      await pgQuery(`DELETE FROM ${t} WHERE id = $1`, [id]);
    },
  });
}

export async function createSatisfactionQuestion(
  data: Partial<BeautySatisfactionQuestion> & { survey_id: string },
): Promise<string> {
  if (!data.survey_id) throw new Error('createSatisfactionQuestion: survey_id gerekli');
  const id = newUuid();
  const labels = data.labels_json ?? {};
  await runDataTransport({
    label: 'createSatisfactionQuestion',
    viaRest: async () => {
      await postgrestPost(
        questionsPath(),
        [
          {
            id,
            survey_id: data.survey_id,
            sort_order: data.sort_order ?? 0,
            question_type: data.question_type ?? 'rating',
            scale_max: data.scale_max ?? 5,
            is_required: data.is_required ?? true,
            labels_json: labels,
          },
        ],
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const t = beautySatisfactionQuestionsTable();
      await pgQuery(
        `INSERT INTO ${t}
           (id, survey_id, sort_order, question_type, scale_max, is_required, labels_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          id,
          data.survey_id,
          data.sort_order ?? 0,
          data.question_type ?? 'rating',
          data.scale_max ?? 5,
          data.is_required ?? true,
          JSON.stringify(labels),
        ],
      );
    },
  });
  return id;
}

export async function updateSatisfactionQuestion(
  id: string,
  data: Partial<BeautySatisfactionQuestion>,
): Promise<void> {
  await runDataTransport({
    label: 'updateSatisfactionQuestion',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        questionsPath(),
        { select: '*', id: `eq.${id}`, limit: 1 },
        BEAUTY_SCHEMA,
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return;
      const curLabels = parseSatisfactionLabels(row.labels_json);
      await postgrestPatch(
        `${questionsPath()}?id=eq.${encodeURIComponent(id)}`,
        {
          sort_order: data.sort_order !== undefined ? data.sort_order : Number(row.sort_order) || 0,
          question_type:
            data.question_type !== undefined ? data.question_type : String(row.question_type ?? 'rating'),
          scale_max: data.scale_max !== undefined ? data.scale_max : Number(row.scale_max) || 5,
          is_required:
            data.is_required !== undefined
              ? data.is_required
              : !(
                  row.is_required === false ||
                  row.is_required === 0 ||
                  String(row.is_required).toLowerCase() === 'false'
                ),
          labels_json: data.labels_json !== undefined ? data.labels_json : curLabels,
          updated_at: new Date().toISOString(),
        },
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const t = beautySatisfactionQuestionsTable();
      const { rows } = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM ${t} WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      if (!row) return;
      const curLabels = parseSatisfactionLabels(row.labels_json);
      const mergedLabels = data.labels_json !== undefined ? data.labels_json : curLabels;
      await pgQuery(
        `UPDATE ${t}
         SET sort_order = $2, question_type = $3, scale_max = $4, is_required = $5,
             labels_json = $6::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          data.sort_order !== undefined ? data.sort_order : Number(row.sort_order) || 0,
          data.question_type !== undefined ? data.question_type : String(row.question_type ?? 'rating'),
          data.scale_max !== undefined ? data.scale_max : Number(row.scale_max) || 5,
          data.is_required !== undefined
            ? data.is_required
            : !(
                row.is_required === false ||
                row.is_required === 0 ||
                String(row.is_required).toLowerCase() === 'false'
              ),
          JSON.stringify(mergedLabels),
        ],
      );
    },
  });
}

export async function deleteSatisfactionQuestion(id: string): Promise<void> {
  await runDataTransport({
    label: 'deleteSatisfactionQuestion',
    viaRest: async () => {
      await postgrestDelete(`${questionsPath()}?id=eq.${encodeURIComponent(id)}`, {
        ...BEAUTY_SCHEMA,
        prefer: 'return=minimal',
      });
    },
    viaBridge: async () => {
      const t = beautySatisfactionQuestionsTable();
      await pgQuery(`DELETE FROM ${t} WHERE id = $1`, [id]);
    },
  });
}

export async function addFeedback(feedback: BeautyCustomerFeedbackInput): Promise<void> {
  const id = newUuid();
  const rawAnswers =
    feedback.survey_answers && feedback.survey_answers.length ? feedback.survey_answers : null;
  await runDataTransport({
    label: 'addFeedback',
    viaRest: async () => {
      await postgrestPost(
        feedbackPath(),
        [
          {
            id,
            appointment_id: pgUuidOrNull(feedback.appointment_id),
            customer_id: pgUuidOrNull(feedback.customer_id),
            service_rating: feedback.service_rating ?? 5,
            staff_rating: feedback.staff_rating ?? 5,
            cleanliness_rating: feedback.cleanliness_rating ?? 5,
            overall_rating: feedback.overall_rating ?? 5,
            comment: feedback.comment ?? null,
            would_recommend: feedback.would_recommend ?? true,
            survey_id: pgUuidOrNull(feedback.survey_id),
            survey_answers: rawAnswers,
          },
        ],
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const table = beautyCustomerFeedbackTable();
      await pgQuery(
        `INSERT INTO ${table}
           (id, appointment_id, customer_id, service_rating, staff_rating,
            cleanliness_rating, overall_rating, comment, would_recommend,
            survey_id, survey_answers)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          id,
          feedback.appointment_id ?? null,
          feedback.customer_id ?? null,
          feedback.service_rating ?? 5,
          feedback.staff_rating ?? 5,
          feedback.cleanliness_rating ?? 5,
          feedback.overall_rating ?? 5,
          feedback.comment ?? null,
          feedback.would_recommend ?? true,
          feedback.survey_id ?? null,
          rawAnswers ? JSON.stringify(rawAnswers) : null,
        ],
      );
    },
  });
}

async function getFeedbackForAppointment(
  appointmentId: string,
): Promise<(BeautyCustomerFeedbackInput & { id: string }) | null> {
  return runDataTransport({
    label: 'getFeedbackForAppointment',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        feedbackPath(),
        {
          select: '*',
          appointment_id: `eq.${appointmentId}`,
          order: 'created_at.desc',
          limit: 1,
        },
        BEAUTY_SCHEMA,
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      return {
        id: String(row.id),
        appointment_id: row.appointment_id != null ? String(row.appointment_id) : null,
        customer_id: row.customer_id != null ? String(row.customer_id) : null,
        service_rating: Number(row.service_rating) || 5,
        staff_rating: Number(row.staff_rating) || 5,
        cleanliness_rating: Number(row.cleanliness_rating) || 5,
        overall_rating: Number(row.overall_rating) || 5,
        comment: row.comment != null ? String(row.comment) : null,
        would_recommend: !(row.would_recommend === false || row.would_recommend === 0),
        survey_id: row.survey_id != null ? String(row.survey_id) : null,
        survey_answers: parseSurveyAnswers(row.survey_answers),
      };
    },
    viaBridge: async () => {
      const table = beautyCustomerFeedbackTable();
      const { rows } = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE appointment_id=$1 ORDER BY created_at DESC NULLS LAST LIMIT 1`,
        [appointmentId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: String(row.id),
        appointment_id: row.appointment_id != null ? String(row.appointment_id) : null,
        customer_id: row.customer_id != null ? String(row.customer_id) : null,
        service_rating: Number(row.service_rating) || 5,
        staff_rating: Number(row.staff_rating) || 5,
        cleanliness_rating: Number(row.cleanliness_rating) || 5,
        overall_rating: Number(row.overall_rating) || 5,
        comment: row.comment != null ? String(row.comment) : null,
        would_recommend: !(row.would_recommend === false || row.would_recommend === 0),
        survey_id: row.survey_id != null ? String(row.survey_id) : null,
        survey_answers: parseSurveyAnswers(row.survey_answers),
      };
    },
  });
}

export async function upsertFeedbackForAppointment(
  feedback: BeautyCustomerFeedbackInput & { appointment_id: string; customer_id: string },
): Promise<void> {
  const existing = await getFeedbackForAppointment(feedback.appointment_id);
  const mergedAnswers =
    feedback.survey_answers !== undefined
      ? feedback.survey_answers && feedback.survey_answers.length
        ? feedback.survey_answers
        : null
      : existing?.survey_answers ?? null;

  if (!existing?.id) {
    await addFeedback({ ...feedback, survey_answers: mergedAnswers ?? feedback.survey_answers });
    return;
  }

  await runDataTransport({
    label: 'upsertFeedbackForAppointment',
    viaRest: async () => {
      await postgrestPatch(
        `${feedbackPath()}?id=eq.${encodeURIComponent(existing.id)}`,
        {
          service_rating: feedback.service_rating ?? existing.service_rating ?? 5,
          staff_rating: feedback.staff_rating ?? existing.staff_rating ?? 5,
          cleanliness_rating: feedback.cleanliness_rating ?? existing.cleanliness_rating ?? 5,
          overall_rating: feedback.overall_rating ?? existing.overall_rating ?? 5,
          comment: feedback.comment ?? existing.comment ?? null,
          would_recommend: feedback.would_recommend ?? existing.would_recommend ?? true,
          survey_id: pgUuidOrNull(feedback.survey_id ?? existing.survey_id ?? null),
          survey_answers: mergedAnswers,
        },
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const table = beautyCustomerFeedbackTable();
      await pgQuery(
        `UPDATE ${table} SET
           service_rating = $2,
           staff_rating = $3,
           cleanliness_rating = $4,
           overall_rating = $5,
           comment = $6,
           would_recommend = $7,
           survey_id = $8,
           survey_answers = $9::jsonb
         WHERE id = $1`,
        [
          existing.id,
          feedback.service_rating ?? existing.service_rating ?? 5,
          feedback.staff_rating ?? existing.staff_rating ?? 5,
          feedback.cleanliness_rating ?? existing.cleanliness_rating ?? 5,
          feedback.overall_rating ?? existing.overall_rating ?? 5,
          feedback.comment ?? existing.comment ?? null,
          feedback.would_recommend ?? existing.would_recommend ?? true,
          feedback.survey_id ?? existing.survey_id ?? null,
          mergedAnswers ? JSON.stringify(mergedAnswers) : null,
        ],
      );
    },
  });
}

export async function getFeedbackAppointmentIds(ids: string[]): Promise<Set<string>> {
  const validIds = (ids ?? [])
    .map((id) => String(id).trim())
    .filter((id) => isUuid(id))
    .slice(0, 500);
  if (!validIds.length) return new Set();

  return runDataTransport({
    label: 'getFeedbackAppointmentIds',
    viaRest: async () => {
      const out = new Set<string>();
      const chunkSize = 80;
      for (let i = 0; i < validIds.length; i += chunkSize) {
        const chunk = validIds.slice(i, i + chunkSize);
        try {
          const rows = await postgrestGet<{ appointment_id: string | null }[]>(
            feedbackPath(),
            {
              select: 'appointment_id',
              appointment_id: `in.(${chunk.join(',')})`,
              limit: chunk.length,
            },
            BEAUTY_SCHEMA,
          );
          if (Array.isArray(rows)) {
            for (const r of rows) {
              const aid = String(r.appointment_id ?? '').trim();
              if (aid) out.add(aid);
            }
          }
        } catch (e) {
          rethrowTransportInfra(e, 'getFeedbackAppointmentIds.chunk');
        }
      }
      return out;
    },
    viaBridge: async () => {
      const table = beautyCustomerFeedbackTable();
      const inList = validIds.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await pgQuery<{ appointment_id: string }>(
        `SELECT DISTINCT appointment_id::text AS appointment_id
         FROM ${table}
         WHERE appointment_id IN (${inList})`,
        validIds,
      );
      return new Set(
        rows.map((r) => String(r.appointment_id ?? '').trim()).filter(Boolean),
      );
    },
  });
}

/** Tamamlanmış randevular — gün (YYYY-MM-DD) */
export async function fetchCompletedAppointmentsForDay(
  ymd: string,
): Promise<BeautyAppointment[]> {
  const day = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];

  return runDataTransport({
    label: 'fetchCompletedAppointmentsForDay',
    viaRest: async (): Promise<BeautyAppointment[]> => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        apptPath(),
        {
          select:
            'id,client_id,service_id,specialist_id,appointment_date,appointment_time,status,total_price,notes',
          appointment_date: `eq.${day}`,
          status: 'eq.completed',
          order: 'appointment_time.asc',
          limit: 200,
        },
        BEAUTY_SCHEMA,
      );
      const list = Array.isArray(rows) ? rows : [];
      const clientIds = Array.from(
        new Set(list.map((r) => String(r.client_id || '')).filter(Boolean)),
      );
      const customerMap = new Map<string, string>();
      if (clientIds.length) {
        try {
          const custTable = customersTable().replace(/^public\./, '');
          const custs = await postgrestGet<Record<string, unknown>[]>(
            `/${custTable}`,
            { id: `in.(${clientIds.join(',')})`, select: 'id,name' },
            { schema: 'public' },
          );
          for (const c of Array.isArray(custs) ? custs : []) {
            customerMap.set(String(c.id), String(c.name ?? ''));
          }
        } catch (e) {
          rethrowTransportInfra(e, 'fetchCompletedAppointmentsForDay.customers');
        }
      }
      return list.map((a) => {
        const date = a.appointment_date != null ? String(a.appointment_date) : day;
        const timeRaw = a.appointment_time != null ? String(a.appointment_time) : '';
        const time = timeRaw.slice(0, 5);
        const notes = a.notes != null ? String(a.notes) : null;
        const clientId = a.client_id != null ? String(a.client_id) : null;
        const nameFromNotes = notes?.includes(' — ')
          ? notes.split(' — ')[0]?.trim()
          : notes?.trim() || null;
        return {
          id: String(a.id ?? ''),
          client_id: clientId,
          customer_name: (clientId && customerMap.get(clientId)) || nameFromNotes || 'Müşteri',
          service_name: null,
          specialist_name: null,
          starts_at: `${date} ${timeRaw}`.trim() || null,
          status: 'completed',
          total_price: Number(a.total_price) || 0,
          notes,
          service_id: a.service_id != null ? String(a.service_id) : null,
          specialist_id: a.specialist_id != null ? String(a.specialist_id) : null,
          appointment_date: date,
          appointment_time: time || null,
        } as BeautyAppointment;
      });
    },
    viaBridge: async (): Promise<BeautyAppointment[]> => {
      const fn = firmNr();
      const pn = periodNr();
      const appt = beautyAppointmentsTable(fn, pn);
      const cust = customersTable(fn);
      const res = await pgQuery<BeautyAppointment>(
        `SELECT a.id,
                a.client_id::text AS client_id,
                COALESCE(c.name, NULLIF(TRIM(a.notes), ''), 'Müşteri') AS customer_name,
                NULL::text AS service_name,
                NULL::text AS specialist_name,
                (a.appointment_date::text || ' ' || COALESCE(a.appointment_time::text, '')) AS starts_at,
                a.status,
                COALESCE(a.total_price, 0)::float8 AS total_price,
                a.notes,
                a.service_id::text AS service_id,
                a.specialist_id::text AS specialist_id,
                a.appointment_date::text AS appointment_date,
                COALESCE(to_char(a.appointment_time, 'HH24:MI'), '') AS appointment_time
         FROM ${appt} a
         LEFT JOIN ${cust} c ON c.id = a.client_id
         WHERE a.appointment_date = $1::date
           AND LOWER(COALESCE(a.status, '')) = 'completed'
         ORDER BY a.appointment_time ASC NULLS LAST
         LIMIT 200`,
        [day],
      );
      return res.rows;
    },
  });
}

export async function fetchSurveyResultsSummary(
  startYmd: string,
  endYmd: string,
  surveyId?: string | null,
): Promise<SurveyResultsSummary> {
  const start = String(startYmd || '').trim();
  const end = String(endYmd || '').trim();
  const empty: SurveyResultsSummary = {
    response_count: 0,
    avg_overall: 0,
    recommend_pct: 0,
    responses: [],
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return empty;
  }

  type RawFb = {
    id: string;
    created_at: string | null;
    customer_id: string | null;
    overall_rating: number;
    would_recommend: boolean;
    comment: string | null;
    appointment_id: string | null;
    customer_name?: string;
  };

  const rows = await runDataTransport({
    label: 'fetchSurveyResultsSummary',
    viaRest: async () => {
      const q: Record<string, string | number> = {
        select: 'id,created_at,customer_id,overall_rating,would_recommend,comment,appointment_id,survey_id',
        order: 'created_at.desc',
        limit: 200,
        and: `(created_at.gte.${start},created_at.lt.${end}T23:59:59.999Z)`,
      };
      if (surveyId) q.survey_id = `eq.${surveyId}`;
      const fbRows = await postgrestGet<Record<string, unknown>[]>(
        feedbackPath(),
        q,
        BEAUTY_SCHEMA,
      );
      const list = Array.isArray(fbRows) ? fbRows : [];
      const custIds = Array.from(
        new Set(list.map((r) => String(r.customer_id || '')).filter(Boolean)),
      );
      const nameMap = new Map<string, string>();
      if (custIds.length) {
        try {
          const custTable = customersTable().replace(/^public\./, '');
          const custs = await postgrestGet<Record<string, unknown>[]>(
            `/${custTable}`,
            { id: `in.(${custIds.join(',')})`, select: 'id,name' },
            { schema: 'public' },
          );
          for (const c of Array.isArray(custs) ? custs : []) {
            nameMap.set(String(c.id), String(c.name ?? ''));
          }
        } catch (e) {
          rethrowTransportInfra(e, 'fetchSurveyResultsSummary.customers');
        }
      }
      return list.map((r): RawFb => {
        const cid = r.customer_id != null ? String(r.customer_id) : null;
        return {
          id: String(r.id ?? ''),
          created_at: r.created_at != null ? String(r.created_at) : null,
          customer_id: cid,
          overall_rating: Number(r.overall_rating) || 0,
          would_recommend: !(r.would_recommend === false || r.would_recommend === 0),
          comment: r.comment != null ? String(r.comment) : null,
          appointment_id: r.appointment_id != null ? String(r.appointment_id) : null,
          customer_name: (cid && nameMap.get(cid)) || 'Müşteri',
        };
      });
    },
    viaBridge: async () => {
      const fb = beautyCustomerFeedbackTable();
      const cust = customersTable();
      const params: unknown[] = [start, end];
      let surveySql = '';
      if (surveyId) {
        params.push(surveyId);
        surveySql = ` AND f.survey_id = $${params.length}::uuid`;
      }
      const res = await pgQuery<RawFb>(
        `SELECT f.id::text AS id,
                f.created_at::text AS created_at,
                f.customer_id::text AS customer_id,
                COALESCE(f.overall_rating, 0)::float8 AS overall_rating,
                COALESCE(f.would_recommend, true) AS would_recommend,
                f.comment,
                f.appointment_id::text AS appointment_id,
                COALESCE(c.name, 'Müşteri') AS customer_name
         FROM ${fb} f
         LEFT JOIN ${cust} c ON c.id = f.customer_id
         WHERE f.created_at >= $1::date
           AND f.created_at < ($2::date + INTERVAL '1 day')
           ${surveySql}
         ORDER BY f.created_at DESC
         LIMIT 200`,
        params,
      );
      return res.rows;
    },
  });

  const response_count = rows.length;
  const ratingSum = rows.reduce((s, r) => s + (Number(r.overall_rating) || 0), 0);
  const recommendCount = rows.filter((r) => r.would_recommend).length;
  return {
    response_count,
    avg_overall:
      response_count > 0 ? Math.round((ratingSum / response_count) * 10) / 10 : 0,
    recommend_pct:
      response_count > 0 ? Math.round((recommendCount / response_count) * 100) : 0,
    responses: rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      customer_id: r.customer_id,
      customer_name: r.customer_name || 'Müşteri',
      overall_rating: Number(r.overall_rating) || 0,
      would_recommend: Boolean(r.would_recommend),
      comment: r.comment,
      appointment_id: r.appointment_id,
    })),
  };
}
