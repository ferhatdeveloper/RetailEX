import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Template,
  TemplateType,
  TemplateUsageScope,
} from '../core/types/templates';
import { DEFAULT_TEMPLATES } from '../core/types/templates';
import { loadTemplateCatalog, saveTemplateCatalog } from '../services/templateCatalogService';

interface TemplateState {
  templates: Template[];
  activeTemplate: Template | null;
  loadedFromDatabase: boolean;
  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, template: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;
  setActiveTemplate: (template: Template | null) => void;
  duplicateTemplate: (id: string) => void;
  loadTemplatesFromDatabase: (force?: boolean) => Promise<void>;
  persistTemplatesToDatabase: () => Promise<void>;
  setTemplateDefaultForScope: (templateId: string, scope: TemplateUsageScope) => Promise<void>;
  getTemplatesByType: (type: TemplateType) => Template[];
  getTemplatesByFormat: (format: string) => Template[];
  getTemplatesForScope: (type: TemplateType, scope?: TemplateUsageScope) => Template[];
  resolveTemplateForScope: (type: TemplateType, scope?: TemplateUsageScope) => Template | null;
}

const normalizeTemplate = (template: Template): Template => ({
  ...template,
  engine: template.engine ?? 'fastreport-like',
  usageScopes: template.usageScopes?.length ? template.usageScopes : ['global'],
  defaultScopes: template.defaultScopes?.length ? template.defaultScopes : [],
});

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      templates: DEFAULT_TEMPLATES.map(normalizeTemplate),
      activeTemplate: null,
      loadedFromDatabase: false,
      
      setTemplates: (templates) => set({ templates: templates.map(normalizeTemplate) }),
      
      addTemplate: (template) => set((state) => ({
        templates: [...state.templates, normalizeTemplate(template)]
      })),
      
      updateTemplate: (id, templateUpdate) => set((state) => ({
        templates: state.templates.map(t => 
          t.id === id
            ? normalizeTemplate({ ...t, ...templateUpdate, updatedAt: new Date().toISOString() })
            : t
        ),
        activeTemplate: state.activeTemplate?.id === id 
          ? normalizeTemplate({ ...state.activeTemplate, ...templateUpdate, updatedAt: new Date().toISOString() })
          : state.activeTemplate
      })),
      
      deleteTemplate: (id) => set((state) => ({
        templates: state.templates.filter(t => t.id !== id),
        activeTemplate: state.activeTemplate?.id === id ? null : state.activeTemplate
      })),
      
      setActiveTemplate: (template) => set({ activeTemplate: template ? normalizeTemplate(template) : null }),
      
      duplicateTemplate: (id) => set((state) => {
        const template = state.templates.find(t => t.id === id);
        if (!template) return state;
        
        const duplicated: Template = {
          ...template,
          id: `template-${Date.now()}`,
          name: `${template.name} (Kopya)`,
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        return {
          templates: [...state.templates, normalizeTemplate(duplicated)]
        };
      }),

      loadTemplatesFromDatabase: async (force = false) => {
        if (!force && get().loadedFromDatabase) return;
        const fromDb = await loadTemplateCatalog();
        set({
          templates: fromDb.map(normalizeTemplate),
          loadedFromDatabase: true,
        });
      },

      persistTemplatesToDatabase: async () => {
        await saveTemplateCatalog(get().templates.map(normalizeTemplate));
      },

      setTemplateDefaultForScope: async (templateId, scope) => {
        const target = get().templates.find((t) => t.id === templateId);
        if (!target) return;
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.type !== target.type) return t;
            const current = new Set(t.defaultScopes ?? []);
            current.delete(scope);
            if (t.id === templateId) current.add(scope);
            return normalizeTemplate({
              ...t,
              defaultScopes: Array.from(current),
              updatedAt: new Date().toISOString(),
            });
          }),
        }));
        await get().persistTemplatesToDatabase();
      },
      
      getTemplatesByType: (type) => {
        const { templates } = get();
        return templates.filter(t => t.type === type);
      },
      
      getTemplatesByFormat: (format) => {
        const { templates } = get();
        return templates.filter(t => t.format === format);
      },

      getTemplatesForScope: (type, scope) => {
        const { templates } = get();
        const byType = templates.filter((t) => t.type === type).map(normalizeTemplate);
        if (!scope) return byType;
        return byType.filter((t) => {
          const scopes = t.usageScopes ?? ['global'];
          return scopes.includes(scope) || scopes.includes('global');
        });
      },

      resolveTemplateForScope: (type, scope) => {
        const candidates = get().getTemplatesForScope(type, scope);
        if (candidates.length === 0) return null;
        const scopedDefault = scope
          ? candidates.find((t) => (t.defaultScopes ?? []).includes(scope))
          : null;
        if (scopedDefault) return scopedDefault;
        const globalDefault = candidates.find((t) => t.isDefault);
        if (globalDefault) return globalDefault;
        return candidates[0] ?? null;
      },
    }),
    {
      name: 'retailos-templates-storage',
      partialize: (state) => ({
        templates: state.templates,
        activeTemplate: state.activeTemplate,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<TemplateState> | undefined;
        const templates = persisted?.templates?.map(normalizeTemplate) ?? currentState.templates;
        const activeTemplate = persisted?.activeTemplate ? normalizeTemplate(persisted.activeTemplate) : currentState.activeTemplate;
        return {
          ...currentState,
          ...persisted,
          templates,
          activeTemplate,
        };
      },
    }
  )
);


