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

  const fieldStyle: React.CSSProperties = {
    background: 'var(--qr-bg)',
    border: '1px solid var(--qr-line)',
    color: 'var(--qr-text)',
  };

  if (done) {
    return (
      <div className="space-y-3 py-16 text-center">
        <Star className="mx-auto h-12 w-12 fill-current" style={{ color: 'var(--qr-gold)' }} />
        <p className="rex-qr-display text-xl font-semibold">{t('thanks')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="rex-qr-display text-2xl font-semibold" style={{ color: 'var(--qr-gold-bright)' }}>
        {t('feedback')}
      </h2>
      {err && (
        <p className="text-sm" style={{ color: 'var(--qr-danger)' }}>
          {err}
        </p>
      )}

      {current && (
        <div
          className="space-y-4 rounded-3xl p-5"
          style={{
            background: 'var(--qr-bg-elevated)',
            border: '1px solid var(--qr-line)',
          }}
        >
          <p className="text-xs" style={{ color: 'var(--qr-muted)' }}>
            {step + 1} / {questions.length}
          </p>
          <p className="text-lg font-semibold">{questionLabel(current, lang)}</p>
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
                className="rex-qr-press p-2"
                style={{
                  color: (ratings[current.code] || 0) >= n ? 'var(--qr-gold)' : 'var(--qr-muted)',
                }}
                aria-label={`${n}`}
              >
                <Star
                  className="h-8 w-8"
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
              className="rex-qr-press flex-1 rounded-xl py-2.5 text-sm disabled:opacity-30"
              style={{ border: '1px solid var(--qr-line)', color: 'var(--qr-muted)' }}
            >
              {t('back')}
            </button>
            <button
              type="button"
              onClick={() => setStep(Math.min(questions.length, step + 1))}
              className="rex-qr-press flex-1 rounded-xl py-2.5 text-sm font-semibold"
              style={{ background: 'var(--qr-bg)', color: 'var(--qr-gold)' }}
            >
              →
            </button>
          </div>
        </div>
      )}

      {step >= questions.length && (
        <div
          className="space-y-3 rounded-3xl p-5"
          style={{
            background: 'var(--qr-bg-elevated)',
            border: '1px solid var(--qr-line)',
          }}
        >
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ad"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Soyad"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefon"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('note')}
            rows={3}
            className="w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitAll()}
            className="rex-qr-press w-full rounded-2xl py-3 font-bold disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, var(--qr-gold) 0%, var(--qr-copper) 100%)',
              color: '#1a120c',
            }}
          >
            {busy ? t('loading') : t('submit')}
          </button>
        </div>
      )}
    </div>
  );
}
