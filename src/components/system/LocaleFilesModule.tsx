import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Languages, Plus, Save, Download, Trash2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { usePermission } from '../../shared/hooks/usePermission';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { PercentBodyModal } from '../shared/PercentBodyModal';
import { localeFilesCopy } from './localeFilesCopy';
import {
  downloadLocaleJson,
  loadLocaleCatalog,
  readLocaleFile,
  writeLocaleFile,
  type LocaleCatalogView,
  type LocaleFileInfo,
} from '../../services/localeJsonApi';
import {
  flattenLocale,
  localeKeyExists,
  localeTextMatches,
  parseLocaleJson,
  prepareLocaleSave,
  splitLocalePath,
  type LocaleLeaf,
} from '../../utils/localeJsonDocument';

interface EditorRow extends LocaleLeaf {
  id: string;
  /** Dosyadan gelen metin. Taslakla kıyas ve arama bunu okur. */
  original: string;
  draft: string;
  isNew?: boolean;
}

interface LocalSelection extends LocaleFileInfo {
  local?: boolean;
}

function rowsFromText(text: string): EditorRow[] {
  return flattenLocale(parseLocaleJson(text)).map((leaf) => ({
    ...leaf,
    id: leaf.path,
    original: leaf.text,
    draft: leaf.text,
  }));
}

export function LocaleFilesModule() {
  const { language } = useLanguage();
  const copy = localeFilesCopy(language);
  const { darkMode } = useTheme();
  const { isAdmin, hasPermission } = usePermission();
  const allowed = isAdmin() || hasPermission('locale-files', 'READ');

  const [catalog, setCatalog] = useState<LocaleCatalogView | null>(null);
  const [selected, setSelected] = useState<LocalSelection | null>(null);
  const [source, setSource] = useState('');
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newText, setNewText] = useState('');
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<LocaleFileInfo | null>(null);

  const dirty = deleted.length > 0 || rows.some((row) => row.isNew || row.draft !== row.original);

  const loadFile = useCallback(
    async (file: LocaleFileInfo, transport: LocaleCatalogView['transport']) => {
      setLoading(true);
      setError('');
      setStatus('');
      try {
        const text = await readLocaleFile(transport, file.root, file.file);
        parseLocaleJson(text);
        setSelected(file);
        setSource(text);
        setRows(rowsFromText(text));
        setDeleted([]);
        setSearch('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void loadLocaleCatalog().then((next) => {
      if (cancelled) return;
      setCatalog(next);
      setLoading(false);
      const first = next.files.find((file) => file.language === 'tr') || next.files[0];
      if (first) void loadFile(first, next.transport);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, loadFile]);

  const requestSelect = (file: LocaleFileInfo) => {
    if (selected?.root === file.root && selected.file === file.file) return;
    if (dirty) {
      setPendingSwitch(file);
      return;
    }
    if (catalog) void loadFile(file, catalog.transport);
  };

  const updateDraft = useCallback((path: string, draft: string) => {
    setRows((prev) => prev.map((row) => (row.path === path ? { ...row, draft } : row)));
  }, []);

  const visibleRows = useMemo(
    () => rows.filter((row) => localeTextMatches(search, row.path, row.original, row.draft)),
    [rows, search],
  );

  const shell = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const line = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputClass = `w-full rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
    darkMode ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;

  const columns = useMemo<ColumnDef<EditorRow>[]>(
    () => [
      {
        id: 'path',
        accessorKey: 'path',
        header: copy.key,
        size: 260,
        cell: ({ row }) => (
          <span className="block truncate font-mono text-[12px]" title={row.original.path}>
            {row.original.path}
          </span>
        ),
      },
      {
        id: 'original',
        accessorKey: 'original',
        header: copy.current,
        size: 280,
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.original} dir="auto">
            {row.original.original}
          </span>
        ),
      },
      {
        id: 'draft',
        accessorFn: (row) => row.draft,
        header: copy.draft,
        size: 300,
        cell: ({ row }) => (
          <input
            dir="auto"
            aria-label={copy.draft}
            value={row.original.draft}
            onChange={(event) => updateDraft(row.original.path, event.target.value)}
            className={inputClass}
          />
        ),
      },
      {
        id: 'removeKey',
        header: copy.remove,
        enableColumnFilter: false,
        enableSorting: false,
        size: 90,
        meta: { defaultVisible: true },
        cell: ({ row }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            onClick={() => setPendingDelete(row.original.path)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {copy.remove}
          </button>
        ),
      },
    ],
    [copy, inputClass, updateDraft],
  );

  const buildText = () =>
    prepareLocaleSave(
      source,
      rows.map((row) => ({ path: row.path, text: row.draft })),
      deleted,
    );

  const onSave = async () => {
    if (!selected) return;
    setError('');
    setStatus('');
    let text = '';
    try {
      text = buildText();
    } catch (err) {
      setError(err instanceof Error ? `${copy.invalid}: ${err.message}` : copy.invalid);
      return;
    }
    const transport = selected.local ? 'local' : catalog?.transport || 'local';
    try {
      if (transport === 'local' || !catalog?.writable) {
        throw new Error(copy.localOnly);
      }
      await writeLocaleFile(transport, selected.root, selected.file, text);
      setSource(text);
      setRows(rowsFromText(text));
      setDeleted([]);
      setStatus(`${copy.saved}: ${selected.relativePath}`);
    } catch (err) {
      setError(err instanceof Error ? `${copy.writeFailed}. ${err.message}` : copy.writeFailed);
    }
  };

  const onDownload = () => {
    if (!selected) return;
    try {
      const text = dirty ? buildText() : source;
      downloadLocaleJson(selected.file, text);
    } catch (err) {
      setError(err instanceof Error ? `${copy.invalid}: ${err.message}` : copy.invalid);
    }
  };

  const onAdd = () => {
    setFormError('');
    let parts: string[];
    try {
      parts = splitLocalePath(newPath);
    } catch {
      setFormError(copy.badPath);
      return;
    }
    const path = parts.join('.');
    if (rows.some((row) => row.path === path)) {
      setFormError(copy.exists);
      return;
    }
    try {
      const tree = parseLocaleJson(source);
      if (!deleted.includes(path) && localeKeyExists(tree, path)) {
        setFormError(copy.exists);
        return;
      }
    } catch {
      setFormError(copy.invalid);
      return;
    }
    setRows((prev) => [
      ...prev,
      { id: path, path, text: '', kind: 'string', original: '', draft: newText, isNew: true },
    ]);
    setAddOpen(false);
    setNewPath('');
    setNewText('');
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const path = pendingDelete;
    setRows((prev) => prev.filter((row) => row.path !== path));
    setDeleted((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setPendingDelete(null);
  };

  const onLocalFile = async (file: File) => {
    const text = await file.text();
    try {
      parseLocaleJson(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.invalid);
      return;
    }
    const info: LocalSelection = {
      root: 'local',
      file: file.name.endsWith('.json') ? file.name : `${file.name}.json`,
      language: file.name.replace(/\.json$/i, ''),
      relativePath: file.name,
      local: true,
    };
    setSelected(info);
    setSource(text);
    setRows(rowsFromText(text));
    setDeleted([]);
    setError('');
    setStatus(copy.localOnly);
  };

  if (!allowed) {
    return (
      <div data-testid="locale-files-denied" className={`h-full p-8 ${shell}`}>
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm text-gray-500">{copy.denied}</p>
      </div>
    );
  }

  return (
    <div data-testid="locale-files-page" className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${shell}`}>
      <header className={`flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3 ${line}`}>
        <Languages className="h-5 w-5 text-blue-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">{copy.title}</h1>
          <p className="truncate text-xs text-gray-500">
            {copy.folder}: {selected?.relativePath || 'mobile/src/i18n/locales'}
            {dirty ? ` · ${copy.dirty}` : ''}
          </p>
        </div>
        <button
          type="button"
          data-testid="locale-files-add"
          onClick={() => {
            setFormError('');
            setAddOpen(true);
          }}
          disabled={!selected}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {copy.add}
        </button>
        <button
          type="button"
          data-testid="locale-files-download"
          onClick={onDownload}
          disabled={!selected}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800"
        >
          <Download className="h-4 w-4" aria-hidden />
          {copy.download}
        </button>
        <button
          type="button"
          data-testid="locale-files-save"
          onClick={() => void onSave()}
          disabled={!selected || !dirty}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          <Save className="h-4 w-4" aria-hidden />
          {copy.save}
        </button>
      </header>

      {(status || error || catalog?.transport === 'local') && (
        <div className={`shrink-0 border-b px-4 py-2 text-sm ${line}`}>
          {error ? <p className="text-red-600">{error}</p> : null}
          {status ? <p className="text-emerald-700">{status}</p> : null}
          {catalog?.transport === 'local' ? <p className="text-amber-700">{copy.localOnly}</p> : null}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={`flex min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r ${line}`}>
          <div className={`shrink-0 border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 ${line}`}>
            {copy.file}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {(catalog?.files || []).length === 0 && !loading ? (
              <p className="px-2 py-3 text-sm text-gray-500">{copy.emptyList}</p>
            ) : null}
            {(catalog?.files || []).map((file) => {
              const active = selected?.root === file.root && selected.file === file.file;
              return (
                <button
                  key={`${file.root}:${file.file}`}
                  type="button"
                  data-testid={`locale-file-${file.file.replace('/', '-')}`}
                  onClick={() => requestSelect(file)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${
                    active
                      ? 'border border-blue-200 bg-blue-50 text-blue-800'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="block text-[11px] uppercase text-gray-400">{file.language}</span>
                  <span className="block truncate font-medium">{file.file}</span>
                </button>
              );
            })}
            <label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-gray-300 px-3 py-2 text-center text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600">
              {copy.pickLocal}
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void onLocalFile(file);
                }}
              />
            </label>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 p-3">
            <input
              data-testid="locale-files-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.search}
              aria-label={copy.search}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-gray-500">{copy.emptyKeeps}</p>
          </div>
          <div data-testid="locale-files-grid" className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3">
            {loading ? (
              <p className="p-4 text-sm text-gray-500">{copy.loading}</p>
            ) : selected ? (
              <DevExDataGrid
                data={visibleRows}
                columns={columns}
                pageSize={50}
                enableFiltering
                enablePagination
                enableExcelExport={false}
                height="100%"
                storageNamespace="locale-files"
              />
            ) : (
              <p className="p-4 text-sm text-gray-500">{copy.noFile}</p>
            )}
          </div>
        </section>
      </div>

      {addOpen && (
        <PercentBodyModal onClose={() => setAddOpen(false)} size="compact" ariaLabel={copy.newTitle}>
          <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
            <h2 className="text-lg font-semibold">{copy.newTitle}</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 p-6">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {copy.newPath}
              <input
                data-testid="locale-files-new-path"
                value={newPath}
                onChange={(event) => setNewPath(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
                placeholder="menu.cash.title"
              />
            </label>
            <p className="text-xs text-slate-500">{copy.newHint}</p>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {copy.newText}
              <input
                data-testid="locale-files-new-text"
                dir="auto"
                value={newText}
                onChange={(event) => setNewText(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
              />
            </label>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-4">
            <button type="button" onClick={() => setAddOpen(false)} className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-600">
              {copy.cancel}
            </button>
            <button type="button" data-testid="locale-files-new-save" onClick={onAdd} className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white">
              {copy.addAction}
            </button>
          </div>
        </PercentBodyModal>
      )}

      {pendingDelete && (
        <PercentBodyModal onClose={() => setPendingDelete(null)} size="compact" ariaLabel={copy.deleteTitle}>
          <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
            <h2 className="text-lg font-semibold">{copy.deleteTitle}</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-6 text-sm text-slate-700">
            <p className="font-mono text-xs text-slate-500">{pendingDelete}</p>
            <p className="mt-3">{copy.deleteBody}</p>
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-4">
            <button type="button" onClick={() => setPendingDelete(null)} className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-600">
              {copy.cancel}
            </button>
            <button type="button" data-testid="locale-files-confirm-delete" onClick={confirmDelete} className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white">
              {copy.confirmDelete}
            </button>
          </div>
        </PercentBodyModal>
      )}

      {pendingSwitch && (
        <PercentBodyModal onClose={() => setPendingSwitch(null)} size="compact" ariaLabel={copy.unsavedTitle}>
          <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
            <h2 className="text-lg font-semibold">{copy.unsavedTitle}</h2>
          </div>
          <div className="p-6 text-sm text-slate-700">{copy.unsavedBody}</div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-4">
            <button type="button" onClick={() => setPendingSwitch(null)} className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-600">
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = pendingSwitch;
                setPendingSwitch(null);
                if (next && catalog) void loadFile(next, catalog.transport);
              }}
              className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white"
            >
              {copy.discard}
            </button>
          </div>
        </PercentBodyModal>
      )}
    </div>
  );
}
