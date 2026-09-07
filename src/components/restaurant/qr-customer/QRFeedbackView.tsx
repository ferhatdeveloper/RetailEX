import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useQrCustomer } from './QRCustomerLayout';
import {
  qrPublicApi,
  questionLabel,
  type QrPublicFeedbackQuestion,
} from './qrPublicApi';

export function QRFeedbackView() {
  const { tenantCode, tableToken, lang, t } = useQrCustomer();
  const [questions, setQuestions] = useState<QrPublicFeedbackQuestion[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await qrPublicApi.getFeedbackQuestions(tenantCode);
        if (!cancelled) setQuestions(res.questions || []);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantCode]);

  const current = questions[step];

  const submitAll = async () => {
    setBusy(true);
    setErr(null);
    try {
      const payload = questions
        .filter((q) => ratings[q.code] != null)
        .map((q) => ({
          questionCode: q.code,
          questionId: q.id,
          rating: ratings[q.code],
        }));
      await qrPublicApi.submitFeedback(tenantCode, {
        tableToken: tableToken || undefined,
        ratings: payload,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      setDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-16 space-y-3">
        <Star className="w-12 h-12 text-amber-400 mx-auto fill-amber-400" />
        <p className="text-lg font-semibold">{t('thanks')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-amber-400">{t('feedback')}</h2>
      {err && <p className="text-rose-400 text-sm">{err}</p>}

      {current && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
          <p className="text-xs text-slate-500">
            {step + 1} / {questions.length}
          </p>
          <p className="text-lg font-semibold text-slate-100">
            {questionLabel(current, lang)}
          </p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setRatings((r) => ({ ...r, [current.code]: n }));
                  if (step < questions.length - 1) setStep(step + 1);
                  else setStep(questions.length);
                }}
                className={
                  (ratings[current.code] || 0) >= n
                    ? 'p-2 text-amber-400'
                    : 'p-2 text-slate-600 hover:text-amber-300'
                }
                aria-label={`${n}`}
              >
                <Star
                  className="w-8 h-8"
                  fill={(ratings[current.code] || 0) >= n ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep(Math.max(0, step - 1))}
              className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm disabled:opacity-30"
            >
              {t('back')}
            </button>
            <button
              type="button"
              onClick={() =>
                setStep(Math.min(questions.length, step + 1))
              }
              className="flex-1 py-2 rounded-xl bg-slate-800 text-amber-400 text-sm font-semibold"
            >
              →
            </button>
          </div>
        </div>
      )}

      {step >= questions.length && (
        <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ad"
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Soyad"
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefon"
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm"
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('note')}
            rows={3}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitAll()}
            className="w-full py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold disabled:opacity-40"
          >
            {busy ? t('loading') : t('submit')}
          </button>
        </div>
      )}
    </div>
  );
}
