import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Template } from '../core/types/templates';
import { DEFAULT_TEMPLATES } from '../core/types/templates';

interface TemplateState {
  templates: Template[];
  activeTemplate: Template | null;
  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, template: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;
  setActiveTemplate: (template: Template | null) => void;
  duplicateTemplate: (id: string) => void;
  getTemplatesByType: (type: 'invoice' | 'label') => Template[];
  getTemplatesByFormat: (format: string) => Template[];
}

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      templates: DEFAULT_TEMPLATES,
      activeTemplate: null,
      
      setTemplates: (templates) => set({ templates }),
      
      addTemplate: (template) => set((state) => ({
        templates: [...state.templates, template]
      })),
      
      updateTemplate: (id, templateUpdate) => set((state) => ({
        templates: state.templates.map(t => 
          t.id === id ? { ...t, ...templateUpdate, updatedAt: new Date().toISOString() } : t
        ),
        activeTemplate: state.activeTemplate?.id === id 
          ? { ...state.activeTemplate, ...templateUpdate, updatedAt: new Date().toISOString() }
          : state.activeTemplate
      })),
      
      deleteTemplate: (id) => set((state) => ({
        templates: state.templates.filter(t => t.id !== id),
        activeTemplate: state.activeTemplate?.id === id ? null : state.activeTemplate
      })),
      
      setActiveTemplate: (template) => set({ activeTemplate: template }),
      
      duplicateTemplate: (id) => set((state) => {
        const template = state.templates.find(t => t.id === id);
        if (!template) return state;
        
        const duplicated: Template = {
          ...template,
          id: `template-${Date.now()}`,
          name: `${template.name} (Kopya)`,
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        return {
          templates: [...state.templates, duplicated]
        };
      }),
      
      getTemplatesByType: (type) => {
        const { templates } = get();
        return templates.filter(t => t.type === type);
      },
      
      getTemplatesByFormat: (format) => {
        const { templates } = get();
        return templates.filter(t => t.format === format);
      }
    }),
    {
      name: 'retailos-templates-storage',
    }
  )
);

