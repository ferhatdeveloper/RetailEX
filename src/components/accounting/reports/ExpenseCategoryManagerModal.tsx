import { useMemo, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import {
  expenseCategoryAddedByLabel,
  expenseCategoryAllowsEdit,
  resolveExpenseCategoryLabel,
  type ExpenseCategoryLabelSource,
} from '../../../utils/expenseCategoryLabel';

export type ExpenseCategoryManagerRow = ExpenseCategoryLabelSource & {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_by_name?: string | null;
};

type ExpenseCategoryManagerModalProps = {
  categories: ExpenseCategoryManagerRow[];
  onClose: () => void;
  onCreate: (name: string) => Promise<boolean> | boolean;
  onRename: (id: string, name: string, isActive: boolean) => Promise<boolean> | boolean;
  onRemove: (id: string) => Promise<void> | void;
};

const columnHelper = createColumnHelper<ExpenseCategoryManagerRow>();

export function ExpenseCategoryManagerModal({
  categories,
  onClose,
  onCreate,
  onRename,
  onRemove,
}: ExpenseCategoryManagerModalProps) {
  const { tm } = useLanguage();
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameDraftRef = useRef('');
  const statusDraftRef = useRef(true);

  const title = tm('expenseCategoryManagerTitle');
  const labelOf = (value: string) =>
    resolveExpenseCategoryLabel(value, { translate: tm, categories });

  const beginRename = (row: ExpenseCategoryManagerRow) => {
    if (!expenseCategoryAllowsEdit(row)) return;
    renameDraftRef.current = labelOf(row.name || row.code);
    statusDraftRef.current = row.is_active !== false;
    setRenamingId(row.id);
  };

  const commitRename = async (id: string) => {
    const name = renameDraftRef.current.trim();
    if (!name) return;
    setSaving(true);
    try {
      const ok = await onRename(id, name, statusDraftRef.current);
      if (ok) setRenamingId(null);
    } finally {
      setSaving(false);
    }
  };

  const submitNew = async () => {
    const name = draftName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const ok = await onCreate(name);
      if (ok) setDraftName('');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => {
    const header = (text: string) => text.toLocaleUpperCase('tr-TR');
    return [
      columnHelper.accessor((row) => labelOf(row.name || row.code), {
        id: 'categoryName',
        header: header(tm('category')),
        cell: ({ row, getValue }) => {
          const cat = row.original;
          if (renamingId === cat.id) {
            return (
              <input
                aria-label={tm('expenseCategoryRenameField')}
                defaultValue={labelOf(cat.name || cat.code)}
                autoFocus
                onChange={(e) => {
                  renameDraftRef.current = e.target.value;
                }}
                className="w-full min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900"
              />
            );
          }
          return <span>{getValue()}</span>;
        },
        meta: { defaultVisible: true },
      }),
      columnHelper.display({
        id: 'categoryKind',
        header: header(tm('expenseCategoryColumnType')),
        cell: ({ row }) => {
          const addedBy = expenseCategoryAddedByLabel(row.original, {
            system: tm('expenseCategorySystem'),
            unknownUser: tm('expenseCategoryUser'),
          });
          const system = !expenseCategoryAllowsEdit(row.original);
          return (
            <span className={system ? 'text-xs font-semibold text-violet-600' : 'text-xs font-semibold text-sky-700'}>
              {addedBy}
            </span>
          );
        },
        meta: { defaultVisible: true },
      }),
      columnHelper.display({
        id: 'categoryLive',
        header: header(tm('status')),
        cell: ({ row }) => {
          const cat = row.original;
          if (renamingId === cat.id) {
            return (
              <select
                aria-label={tm('status')}
                defaultValue={cat.is_active !== false ? 'active' : 'passive'}
                onChange={(e) => {
                  statusDraftRef.current = e.target.value === 'active';
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
              >
                <option value="active">{tm('active')}</option>
                <option value="passive">{tm('passive')}</option>
              </select>
            );
          }
          return (
            <span
              className={
                cat.is_active
                  ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600'
                  : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500'
              }
            >
              {cat.is_active ? tm('active') : tm('passive')}
            </span>
          );
        },
        meta: { defaultVisible: true },
      }),
      columnHelper.display({
        id: 'categoryRowAction',
        header: header(tm('expenseCategoryColumnAction')),
        cell: ({ row }) => {
          const cat = row.original;
          if (!expenseCategoryAllowsEdit(cat)) {
            return <span aria-hidden="true">—</span>;
          }
          if (renamingId === cat.id) {
            return (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void commitRename(cat.id)}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  {tm('save')}
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  className="text-xs font-semibold text-slate-500 hover:underline"
                >
                  {tm('giveUp')}
                </button>
              </span>
            );
          }
          return (
            <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => beginRename(cat)}
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                {tm('expenseCategoryRename')}
              </button>
              <button
                type="button"
                onClick={() => void onRemove(cat.id)}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                {tm('delete')}
              </button>
            </span>
          );
        },
        meta: { defaultVisible: true },
      }),
    ];
  }, [categories, onRemove, onRename, renamingId, tm]);

  return (
    <PercentBodyModal nested onClose={onClose} size="list" ariaLabel={title}>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white shrink-0 sm:px-8 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25 active:scale-[0.98]"
            aria-label={tm('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitNew();
              }
            }}
            placeholder={tm('expenseCategoryNewNamePlaceholder')}
            aria-label={tm('expenseCategoryNewNamePlaceholder')}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => void submitNew()}
            disabled={saving || !draftName.trim()}
            className="shrink-0 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98]"
          >
            + {tm('add')}
          </button>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-5 sm:p-8">
        <DevExDataGrid
          data={categories}
          columns={columns}
          pageSize={50}
          enablePagination={false}
          enableFiltering
          enableExcelExport={false}
          enableColumnVisibility={false}
          enableRefresh={false}
          enablePrint={false}
          autoFooterSums={false}
          storageNamespace="expense_category_manager"
        />
      </PercentBodyModalScrollBody>

      <p className="shrink-0 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs leading-relaxed text-slate-500 sm:px-8">
        {tm('expenseCategorySystemNote')}
      </p>
    </PercentBodyModal>
  );
}
