// Campaign Store with SQL Integration
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Campaign } from '../core/types';
import { campaignsAPI } from '../services/api/index';

interface CampaignState {
  campaigns: Campaign[];
  isLoading: boolean;
  error: string | null;
  lastSync: number | null;

  // Actions
  setCampaigns: (campaigns: Campaign[]) => void;
  loadCampaigns: () => Promise<void>;
  loadActiveCampaigns: () => Promise<void>;
  addCampaign: (campaign: Campaign) => Promise<void>;
  updateCampaign: (id: string, campaign: Partial<Campaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  setActiveStatus: (id: string, isActive: boolean) => Promise<void>;
  syncWithServer: () => Promise<void>;
}

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set, get) => ({
      campaigns: [],
      isLoading: false,
      error: null,
      lastSync: null,

      setCampaigns: (campaigns) => set({ campaigns, lastSync: Date.now() }),

      loadCampaigns: async () => {
        set({ isLoading: true, error: null });
        try {
          const campaigns = await campaignsAPI.getAll();
          set({ campaigns, isLoading: false, lastSync: Date.now() });
        } catch (error) {
          console.error('[CampaignStore] Error loading campaigns:', error);
          set({ isLoading: false, error: 'Failed to load campaigns' });
        }
      },

      loadActiveCampaigns: async () => {
        set({ isLoading: true, error: null });
        try {
          const campaigns = await campaignsAPI.getActive();
          set({ campaigns, isLoading: false, lastSync: Date.now() });
        } catch (error) {
          console.error('[CampaignStore] Error loading active campaigns:', error);
          set({ isLoading: false, error: 'Failed to load active campaigns' });
        }
      },

      addCampaign: async (campaign) => {
        set({ isLoading: true, error: null });
        try {
          const newCampaign = await campaignsAPI.create(campaign);
          if (newCampaign) {
            set((state) => ({
              campaigns: [...state.campaigns, newCampaign],
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to create campaign');
          }
        } catch (error) {
          console.error('[CampaignStore] Error adding campaign:', error);
          set({ isLoading: false, error: 'Failed to add campaign' });
        }
      },

      updateCampaign: async (id, campaignUpdate) => {
        set({ isLoading: true, error: null });
        try {
          const updatedCampaign = await campaignsAPI.update(id, campaignUpdate);
          if (updatedCampaign) {
            set((state) => ({
              campaigns: state.campaigns.map(c =>
                c.id === id ? updatedCampaign : c
              ),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to update campaign');
          }
        } catch (error) {
          console.error('[CampaignStore] Error updating campaign:', error);
          set({ isLoading: false, error: 'Failed to update campaign' });
        }
      },

      deleteCampaign: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const success = await campaignsAPI.delete(id);
          if (success) {
            set((state) => ({
              campaigns: state.campaigns.filter(c => c.id !== id),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to delete campaign');
          }
        } catch (error) {
          console.error('[CampaignStore] Error deleting campaign:', error);
          set({ isLoading: false, error: 'Failed to delete campaign' });
        }
      },

      setActiveStatus: async (id, isActive) => {
        set({ isLoading: true, error: null });
        try {
          const success = await campaignsAPI.setActive(id, isActive);
          if (success) {
            set((state) => ({
              campaigns: state.campaigns.map(c =>
                c.id === id ? { ...c, isActive } : c
              ),
              isLoading: false,
              lastSync: Date.now()
            }));
          } else {
            throw new Error('Failed to update campaign status');
          }
        } catch (error) {
          console.error('[CampaignStore] Error updating campaign status:', error);
          set({ isLoading: false, error: 'Failed to update campaign status' });
        }
      },

      syncWithServer: async () => {
        const { lastSync } = get();
        const now = Date.now();

        // Sync only if last sync was more than 5 minutes ago
        if (lastSync && (now - lastSync) < 5 * 60 * 1000) {
          console.log('[CampaignStore] Skipping sync - too recent');
          return;
        }

        console.log('[CampaignStore] Syncing with server...');
        await get().loadCampaigns();
      }
    }),
    {
      name: 'retailos-campaigns-storage',
      partialize: (state) => ({
        campaigns: state.campaigns,
        lastSync: state.lastSync
      })
    }
  )
);

// Auto-load campaigns on first mount
if (typeof window !== 'undefined') {
  const store = useCampaignStore.getState();
  if (store.campaigns.length === 0) {
    store.loadCampaigns();
  }
}

