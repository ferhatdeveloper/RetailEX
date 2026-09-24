import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import { TemplateDesigner } from '../../modules/TemplateDesigner';
import {
  FullscreenBodyPortal,
  MODAL_OVERLAY_NESTED_Z,
} from '../../shared/FullscreenBodyPortal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { ERP_SETTINGS } from '../../../services/postgres';
import { convertTemplateToReportTemplate } from '../../../services/templateRenderService';
import type { PatientFileCustomerLike } from '../../../services/templateRenderService';
import { logger } from '../../../services/loggingService';
import type { Template, TemplateUsageScope } from '../../../core/types/templates';
import { TEMPLATE_FORMATS } from '../../../core/types/templates';
import { customerAPI } from '../../../services/api/customers';
import {
  getPreferredPatientFileTemplateId,
  listPatientFileTemplates,
  PATIENT_FILE_PRINT_SCOPE,
  preparePatientFilePrintContext,
  resolvePatientFileTemplateId,
} from '../../../utils/patientFilePrint';

export type PatientFilePrintCustomer = PatientFileCustomerLike & {
  name?: string | null;
  id?: string;
};

export type PatientFilePrintModalProps = {
  /** Tek müşteri (geriye dönük) */
  customer?: PatientFilePrintCustomer;
  /** Toplu yazdırma kuyruğu — verilirse `customer` yok sayılır */
  customers?: PatientFilePrintCustomer[];
  onClose: () => void;
};

async function loadLiveCustomer(
  fallback: PatientFilePrintCustomer,
): Promise<PatientFileCustomerLike> {
  const id = fallback.id != null ? String(fallback.id).trim() : '';
  if (!id) return fallback;
  try {
    const fresh = await customerAPI.getById(id);
    if (!fresh) return fallback;
    return {
      id: fresh.id,
      code: fresh.code ?? fallback.code,
      name: fresh.name ?? fallback.name,
      phone: fresh.phone ?? fallback.phone,
      phone2: fresh.phone2 ?? fallback.phone2,
      email: fresh.email ?? fallback.email,
      address: fresh.address ?? fallback.address,
      city: fresh.city ?? fallback.city,
      file_id: fresh.file_id ?? fallback.file_id,
      age: fresh.age ?? fallback.age,
      birth_date: fresh.birth_date ?? fallback.birth_date,
      occupation: fresh.occupation ?? fallback.occupation,
      gender: fresh.gender ?? fallback.gender,
      customer_tier: fresh.customer_tier ?? fallback.customer_tier,
      heard_from: fresh.heard_from ?? fallback.heard_from,
      notes: fresh.notes ?? fallback.notes,
      balance: fresh.balance ?? fallback.balance,
      points: fresh.points ?? fallback.points,
      tax_nr: fresh.tax_number ?? fresh.taxNumber ?? fallback.tax_nr,
      created_at: fresh.created_at ?? fallback.created_at,
    };
  } catch (e) {
    logger.warn('PatientFilePrintModal', 'live customer refresh failed, using list row', e);
    return fallback;
  }
}

/**
 * Hasta dosyası yazdırma ekranı: her zaman canlı müşteri verisi ile önizleme;
 * tek veya toplu kuyruk; şablon seçilebilir / düzenlenebilir.
 */
export function PatientFilePrintModal({ customer, customers, onClose }: PatientFilePrintModalProps) {
  const { tm } = useLanguage();
  const {
    templates,
    loadTemplatesFromDatabase,
    getTemplatesForScope,
    setActiveTemplate,
    addTemplate,
    updateTemplate,
    setTemplateDefaultForScope,
    persistTemplatesToDatabase,
  } = useTemplateStore();

  const queue = useMemo((): PatientFilePrintCustomer[] => {
    if (customers && customers.length > 0) return customers;
    if (customer) return [customer];
    return [];
  }, [customer, customers]);

  const [loading, setLoading] = useState(true);
  const [liveCustomers, setLiveCustomers] = useState<PatientFileCustomerLike[]>([]);
  const [contexts, setContexts] = useState<Record<string, unknown>[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [editingDesign, setEditingDesign] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);

  const scopedTemplates = useMemo(
    () => listPatientFileTemplates(getTemplatesForScope, templates),
    [getTemplatesForScope, templates],
  );

  const selectedTemplate = useMemo(
    () => scopedTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [scopedTemplates, selectedTemplateId],
  );

  const templateForPrint = useMemo(() => {
    if (!selectedTemplate) return null;
    return templates.find((t) => t.id === selectedTemplate.id) ?? selectedTemplate;
  }, [templates, selectedTemplate]);

  const reportTemplate = useMemo(
    () => (templateForPrint ? convertTemplateToReportTemplate(templateForPrint) : null),
    [templateForPrint],
  );

  const ensurePatientFileScope = (tpl: Template): Template => {
    const scopes = new Set<TemplateUsageScope>(
      tpl.usageScopes?.length ? tpl.usageScopes : ['global'],
    );
    scopes.add(PATIENT_FILE_PRINT_SCOPE);
    return { ...tpl, usageScopes: Array.from(scopes) };
  };

  const queueKey = useMemo(
    () => queue.map((c) => String(c.id ?? c.name ?? '')).join('|'),
    [queue],
  );

  const refreshLiveContext = useCallback(async () => {
    if (queue.length === 0) {
      setLiveCustomers([]);
      setContexts([]);
      return [];
    }
    const lives = await Promise.all(queue.map((c) => loadLiveCustomer(c)));
    const ctxs = await Promise.all(
      lives.map((live) => preparePatientFilePrintContext(live, ERP_SETTINGS.firmNr)),
    );
    setLiveCustomers(lives);
    setContexts(ctxs);
    return ctxs;
  }, [queue]);

  const bootstrap = useCallback(async () => {
    if (queue.length === 0) {
      toast.error(tm('bPatientFilePrintError'));
      onClose();
      return;
    }
    setLoading(true);
    try {
      await loadTemplatesFromDatabase(true);
      await refreshLiveContext();
      const preferred = await getPreferredPatientFileTemplateId(ERP_SETTINGS.firmNr);
      const list = listPatientFileTemplates(
        useTemplateStore.getState().getTemplatesForScope,
        useTemplateStore.getState().templates,
      );
      const id = resolvePatientFileTemplateId(
        list,
        useTemplateStore.getState().resolveTemplateForScope,
        preferred,
      );
      setSelectedTemplateId(id);
      if (!id) {
        toast.error(tm('bPatientFileNoTemplate'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || tm('bPatientFilePrintError'));
      logger.error('PatientFilePrintModal', 'bootstrap failed', e);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [loadTemplatesFromDatabase, onClose, queue.length, refreshLiveContext, tm]);

  useEffect(() => {
    void bootstrap();
    // queueKey değişince yeniden yükle
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap zaten queue’a bağlı
  }, [bootstrap, queueKey]);

  const openDesigner = (tpl?: Template | null) => {
    const target = tpl ?? selectedTemplate;
    if (!target) {
      const size = TEMPLATE_FORMATS.A4;
      const created: Template = ensurePatientFileScope({
        id: `template-${Date.now()}`,
        name: tm('bPatientFileDesignName'),
        description: tm('bPatientFileDesignDesc'),
        type: 'invoice',
        format: 'A4',
        width: size.width,
        height: size.height,
        orientation: 'portrait',
        engine: 'fastreport-like',
        usageScopes: [PATIENT_FILE_PRINT_SCOPE, 'global'],
        defaultScopes: [PATIENT_FILE_PRINT_SCOPE],
        margin: { top: 12, right: 12, bottom: 12, left: 12 },
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        elements: [],
      });
      addTemplate(created);
      setActiveTemplate(created);
      setSelectedTemplateId(created.id);
      setEditingDesign(true);
      return;
    }
    const fromStore =
      useTemplateStore.getState().templates.find((t) => t.id === target.id) ?? target;
    const patched = ensurePatientFileScope(fromStore);
    updateTemplate(patched.id, { usageScopes: patched.usageScopes });
    setActiveTemplate({ ...patched });
    setEditingDesign(true);
  };

  const closeDesigner = async () => {
    try {
      await persistTemplatesToDatabase();
    } catch (e) {
      logger.error('PatientFilePrintModal', 'persist after design failed', e);
      toast.error(tm('bPatientFileSaveError'));
    }
    const id = selectedTemplateId;
    const list = listPatientFileTemplates(
      useTemplateStore.getState().getTemplatesForScope,
      useTemplateStore.getState().templates,
    );
    if (id && !list.some((t) => t.id === id)) {
      setSelectedTemplateId(list[0]?.id ?? null);
    }
    await refreshLiveContext();
    setEditingDesign(false);
    toast.success(tm('bPatientFileDesignSaved'));
  };

  const onToggleMakeDefault = async (checked: boolean) => {
    setMakeDefault(checked);
    if (!checked || !selectedTemplate) return;
    try {
      await setTemplateDefaultForScope(selectedTemplate.id, PATIENT_FILE_PRINT_SCOPE);
      toast.success(tm('bPatientFileDefaultSaved'));
    } catch (e) {
      logger.error('PatientFilePrintModal', 'set default failed', e);
    }
  };

  const firstLive = liveCustomers[0];
  const firstContext = contexts[0] ?? null;
  const subtitle =
    contexts.length > 1
      ? tm('bBulkPrintPatientFileCount').replace('{count}', String(contexts.length))
      : String(firstLive?.name || queue[0]?.name || tm('bPrintPatientFile'));

  if (editingDesign) {
    return (
      <FullscreenBodyPortal
        zIndex={MODAL_OVERLAY_NESTED_Z}
        className="bg-white flex flex-col min-h-0"
        role="dialog"
        aria-modal
        aria-label={tm('bEditPatientFileDesign')}
      >
        <div className="h-[100dvh] w-full min-h-0 flex flex-col overflow-hidden">
          <TemplateDesigner
            type="invoice"
            livePreviewData={firstContext}
            onClose={() => void closeDesigner()}
          />
        </div>
      </FullscreenBodyPortal>
    );
  }

  if (loading || contexts.length === 0) {
    return (
      <FullscreenBodyPortal
        className="bg-gray-900/40 backdrop-blur-sm flex items-center justify-center"
        role="dialog"
        aria-modal
        aria-label={tm('bPrintPatientFile')}
      >
        <div className="rounded-2xl bg-white px-8 py-6 text-sm font-semibold text-slate-700 shadow-xl">
          {tm('bPatientFilePreparing')}
        </div>
      </FullscreenBodyPortal>
    );
  }

  if (!selectedTemplate || !reportTemplate) {
    return (
      <FullscreenBodyPortal
        className="bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4"
        role="dialog"
        aria-modal
        aria-label={tm('bPrintPatientFile')}
        onClick={onClose}
      >
        <div
          className="max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-slate-700">{tm('bPatientFileNoTemplate')}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border-2 border-slate-200 py-2.5 text-sm font-bold text-slate-600"
            >
              {tm('cancel')}
            </button>
            <button
              type="button"
              onClick={() => openDesigner(null)}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white"
            >
              {tm('bEditPatientFileDesign')}
            </button>
          </div>
        </div>
      </FullscreenBodyPortal>
    );
  }

  return (
    <ReportViewerModule
      template={reportTemplate}
      data={firstContext}
      dataPages={contexts}
      onClose={onClose}
      subtitle={subtitle}
      chromeExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[10rem] max-w-[14rem]">
            <select
              value={selectedTemplate.id}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-9 text-xs font-semibold text-gray-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
              aria-label={tm('bPatientFileSelectDesign')}
            >
              {scopedTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => void onToggleMakeDefault(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-violet-600"
            />
            {tm('bPatientFileMakeDefault')}
          </label>
          <button
            type="button"
            onClick={() => openDesigner(selectedTemplate)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            {tm('bEditPatientFileDesign')}
          </button>
        </div>
      }
    />
  );
}
