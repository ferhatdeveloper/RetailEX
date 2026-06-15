import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { BeautyFollowUpReminder } from '../../../types/beauty';
import { MesajBildirimModule } from '../../modules/MesajBildirimModule';

export interface FollowUpMesajBildirimModalProps {
  open: boolean;
  onClose: () => void;
  followUpReminders: BeautyFollowUpReminder[];
  dateStart: string;
  dateEnd: string;
  title: string;
}

export function FollowUpMesajBildirimModal({
  open,
  onClose,
  followUpReminders,
  dateStart,
  dateEnd,
  title,
}: FollowUpMesajBildirimModalProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483645] flex flex-col bg-black/50 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide truncate">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {dateStart} — {dateEnd}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50">
        <MesajBildirimModule
          embedded
          onClose={onClose}
          followUpReminders={followUpReminders}
          dateStart={dateStart}
          dateEnd={dateEnd}
        />
      </div>
    </div>,
    document.body,
  );
}
