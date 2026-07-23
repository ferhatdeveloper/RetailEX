import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, StickyNote, MessageCircle } from 'lucide-react';
import type {
  BeautyFollowUpReminder,
  BeautyFollowUpReminderAction,
  BeautyFollowUpReminderStatus,
} from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';

export interface FollowUpReminderActionModalProps {
  open: boolean;
  reminder: BeautyFollowUpReminder | null;
  onClose: () => void;
  onSaved: () => void;
  onWhatsApp?: () => void;
  whatsAppSending?: boolean;
  labels: {
    title: string;
    status: string;
    statusDue: string;
    statusPostponed: string;
    statusContacted: string;
    statusOther: string;
    statusDismissed: string;
    note: string;
    notePlaceholder: string;
    postponeDate: string;
    naturalDueLabel: string;
    showNaturalWhenPostponed: string;
    showNaturalWhenPostponedHint: string;
    cancel: string;
    save: string;
    saving: string;
    whatsApp?: string;
  };
}

const NOTE_TEXTAREA_CLASS =
  'w-full px-4 py-3 border border-slate-200 rounded-2xl text-slate-800 font-medium outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white';

export function FollowUpReminderActionModal({
  open,
  reminder,
  onClose,
  onSaved,
  onWhatsApp,
  whatsAppSending = false,
  labels,
}: FollowUpReminderActionModalProps) {
  const [status, setStatus] = useState<BeautyFollowUpReminderStatus>('due');
  const [note, setNote] = useState('');
  const [postponedDate, setPostponedDate] = useState('');
  const [showNaturalWhenPostponed, setShowNaturalWhenPostponed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !reminder) return;
    setStatus(reminder.follow_up_status ?? 'due');
    setNote(reminder.note ?? '');
    const natural = reminder.natural_due_date ?? reminder.due_date;
    const postponed =
      reminder.postponed_due_date ??
      (reminder.follow_up_status === 'postponed' && !reminder.is_natural_shadow
        ? reminder.due_date
        : natural);
    setPostponedDate(postponed);
    setShowNaturalWhenPostponed(Boolean(reminder.show_natural_when_postponed));
  }, [open, reminder]);

  if (!open || !reminder || typeof document === 'undefined') return null;

  const naturalDue = reminder.natural_due_date ?? reminder.due_date;
  const hasPhone = String(reminder.customer_phone ?? '').replace(/\D/g, '').length >= 10;

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedNote = note.trim();
      let effectiveStatus = status;
      if (trimmedNote && status === 'due') {
        effectiveStatus = 'other';
      }
      const payload: BeautyFollowUpReminderAction = {
        customer_id: reminder.customer_id,
        service_id: reminder.service_id,
        product_id: reminder.product_id,
        reminder_kind: reminder.reminder_kind === 'product' ? 'product' : 'service',
        last_completed_date: reminder.last_completed_date,
        natural_due_date: naturalDue,
        reminder_days: reminder.reminder_days,
        customer_name: reminder.customer_name,
        customer_phone: reminder.customer_phone,
        service_name: reminder.service_name,
        product_name: reminder.product_name,
        status: effectiveStatus,
        note: trimmedNote || undefined,
        postponed_due_date:
          effectiveStatus === 'postponed' && postponedDate.trim() ? postponedDate.trim() : undefined,
        show_natural_when_postponed:
          effectiveStatus === 'postponed' ? showNaturalWhenPostponed : undefined,
      };
      await beautyService.upsertFollowUpReminderAction(payload);
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[2147483646] overflow-y-auto overflow-x-hidden bg-black/60 backdrop-blur-md">
      <div className="flex min-h-[100dvh] min-h-screen w-full items-center justify-center p-4 py-6">
        <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[min(90vh,100dvh)] min-h-0 overflow-hidden shadow-xl border border-slate-200/80 flex flex-col">
          <div className="bg-gradient-to-r from-[var(--asin-primary,#0E2433)] to-[var(--asin-primary-hover,#163A52)] px-6 py-5 text-white shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-black uppercase tracking-tight truncate">{labels.title}</h2>
                <p className="text-[var(--asin-accent-muted,#D5F0EE)] text-xs font-semibold mt-1 truncate">{reminder.customer_name}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                {labels.status}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BeautyFollowUpReminderStatus)}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-slate-800 font-medium outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
              >
                <option value="due">{labels.statusDue}</option>
                <option value="postponed">{labels.statusPostponed}</option>
                <option value="contacted">{labels.statusContacted}</option>
                <option value="other">{labels.statusOther}</option>
                <option value="dismissed">{labels.statusDismissed}</option>
              </select>
            </div>
            {status === 'postponed' && (
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {labels.postponeDate}
                </label>
                <input
                  type="date"
                  value={postponedDate}
                  min={naturalDue}
                  onChange={(e) => setPostponedDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-slate-800 font-medium outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {labels.naturalDueLabel.replace('{date}', naturalDue)}
                </p>
                <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showNaturalWhenPostponed}
                    onChange={(e) => setShowNaturalWhenPostponed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold text-slate-600">
                      {labels.showNaturalWhenPostponed}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      {labels.showNaturalWhenPostponedHint}
                    </span>
                  </span>
                </label>
              </div>
            )}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <StickyNote className="w-3.5 h-3.5" />
                {labels.note}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={labels.notePlaceholder}
                className={NOTE_TEXTAREA_CLASS}
                style={{
                  touchAction: 'auto',
                  WebkitUserSelect: 'text',
                  userSelect: 'text',
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                autoComplete="off"
                spellCheck
              />
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-3 shrink-0">
            {onWhatsApp && hasPhone ? (
              <button
                type="button"
                onClick={onWhatsApp}
                disabled={saving || whatsAppSending}
                className="w-full rounded-2xl border-2 border-emerald-200 bg-emerald-50 text-emerald-800 font-bold uppercase text-sm tracking-wider py-3 hover:bg-emerald-100 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                {whatsAppSending ? '…' : (labels.whatsApp ?? 'Mesaj')}
              </button>
            ) : null}
            <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || (status === 'postponed' && !postponedDate.trim())}
              className="flex-1 rounded-2xl bg-[var(--asin-accent,#1FA8A0)] text-white font-bold uppercase text-sm tracking-wider py-3 hover:bg-[#178f88] disabled:opacity-50"
            >
              {saving ? labels.saving : labels.save}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
