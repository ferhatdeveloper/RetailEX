import { useMemo, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import {
  expenseCategoryAllowsEdit,
  resolveExpenseCategoryLabel,
  type ExpenseCategoryLabelSource,
} from '../../../utils/expenseCategoryLabel';

export type ExpenseCategoryManagerRow = ExpenseCategoryLabelSource & {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type ExpenseCategoryManagerModalProps = {
  categories: ExpenseCategoryManagerRow[];
  onClose: () => void;
  onCreate: (name: string) => Promise<boolean> | boolean;
  onRename: (id: string, name: string) => Promise<boolean> | boolean;
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

  const title = tm('expenseCategoryManagerTitle');
  const labelOf = (value: string) =>
    resolveExpenseCategoryLabel(value, { translate: tm, categories });

  const beginRename = (row: ExpenseCategoryManagerRow) => {
    if (!expenseCategoryAllowsEdit(row)) return;
    renameDraftRef.current = labelOf(row.name || row.code);
    setRenamingId(row.id);
  };

  const commitRename = async (id: string) => {
    const name = renameDraftRef.current.trim();
    if (!name) return;
    setSaving(true);
    try {
      const ok = await onRename(id, name);
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
      columnHelper.accessor('name', {
        id: 'categoryName',
        header: header(tm('category')),
        cell: ({ row }) => {
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
          return <span>{labelOf(cat.name || cat.code)}</span>;
        },
        meta: { defaultVisible: true },
      }),
      columnHelper.display({
        id: 'categoryKind',
        header: header(tm('expenseCategoryColumnType')),
        cell: ({ row }) => {
          const system = !expenseCategoryAllowsEdit(row.original);
          return (
            <span className={system ? 'text-xs font-semibold text-violet-600' : 'text-xs font-semibold text-sky-700'}>
              {system ? tm('expenseCategorySystem') : tm('expenseCategoryUser')}
            </span>
          );
        },
        meta: { defaultVisible: true },
      }),
      columnHelper.display({
        id: 'categoryLive',
        header: header(tm('active')),
        cell: ({ row }) => (
          <span
            className={
              row.original.is_active
                ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600'
                : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500'
            }
          >
            {row.original.is_active ? tm('active') : tm('passive')}
          </span>
        ),
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
  }, [categories, onRemove, renamingId, tm]);

  return (
    <PercentBodyModal nested onClose={onClose} size="list" ariaLabel={title}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label={tm('close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-4">
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
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => void submitNew()}
            disabled={saving || !draftName.trim()}
            className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
          >
            + {tm('add')}
          </button>
        </div>
      </div>

      <PercentBodyModalScrollBody className="px-5 py-4">
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

      <p className="shrink-0 border-t border-slate-200 px-5 py-3 text-xs leading-relaxed text-slate-500">
        {tm('expenseCategorySystemNote')}
      </p>
    </PercentBodyModal>
  );
}
