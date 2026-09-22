import { create } from 'zustand';

export interface ManagementTab {
  screenId: string;
  title: string;
  openedAt: number;
  lastActiveAt: number;
}

/** Aynı anda açık tutulan maksimum sekme (bellek koruması) */
export const MAX_MANAGEMENT_TABS = 8;

interface ManagementTabsState {
  tabs: ManagementTab[];
  activeScreenId: string;
  /** Aç veya odakla; başlık yoksa screenId kullanılır */
  openTab: (screenId: string, title?: string) => void;
  setActive: (screenId: string) => void;
  closeTab: (screenId: string) => void;
  closeOthers: (keepScreenId: string) => void;
  closeAll: (fallbackScreenId?: string) => void;
  updateTitle: (screenId: string, title: string) => void;
  /** İlk yüklemede tek sekme ile başlat */
  resetWith: (screenId: string, title?: string) => void;
}

function normalizeScreenId(raw: string): string {
  const id = String(raw ?? '').trim();
  if (!id) return 'dashboard';
  return id === 'Dashboard' ? 'dashboard' : id;
}

function pickFallbackActive(tabs: ManagementTab[], closedId: string): string {
  const remaining = tabs.filter((t) => t.screenId !== closedId);
  if (remaining.length === 0) return 'dashboard';
  return [...remaining].sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0].screenId;
}

export const useManagementTabsStore = create<ManagementTabsState>((set, get) => ({
  tabs: [],
  activeScreenId: 'dashboard',

  resetWith: (screenId, title) => {
    const id = normalizeScreenId(screenId);
    const now = Date.now();
    set({
      tabs: [
        {
          screenId: id,
          title: (title && title.trim()) || id,
          openedAt: now,
          lastActiveAt: now,
        },
      ],
      activeScreenId: id,
    });
  },

  openTab: (screenId, title) => {
    const id = normalizeScreenId(screenId);
    if (!id) return;
    const now = Date.now();
    const { tabs } = get();
    const existing = tabs.find((t) => t.screenId === id);

    if (existing) {
      set({
        tabs: tabs.map((t) =>
          t.screenId === id
            ? {
                ...t,
                lastActiveAt: now,
                title: (title && title.trim()) || t.title,
              }
            : t
        ),
        activeScreenId: id,
      });
      return;
    }

    let nextTabs = [...tabs];
    if (nextTabs.length >= MAX_MANAGEMENT_TABS) {
      // En eski, aktif olmayan sekmeyi kapat (LRU)
      const activeId = get().activeScreenId;
      const victims = [...nextTabs]
        .filter((t) => t.screenId !== activeId)
        .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
      const victim = victims[0] ?? nextTabs[0];
      if (victim) {
        nextTabs = nextTabs.filter((t) => t.screenId !== victim.screenId);
      }
    }

    nextTabs.push({
      screenId: id,
      title: (title && title.trim()) || id,
      openedAt: now,
      lastActiveAt: now,
    });

    set({ tabs: nextTabs, activeScreenId: id });
  },

  setActive: (screenId) => {
    const id = normalizeScreenId(screenId);
    const { tabs } = get();
    if (!tabs.some((t) => t.screenId === id)) return;
    const now = Date.now();
    set({
      activeScreenId: id,
      tabs: tabs.map((t) =>
        t.screenId === id ? { ...t, lastActiveAt: now } : t
      ),
    });
  },

  closeTab: (screenId) => {
    const id = normalizeScreenId(screenId);
    const { tabs, activeScreenId } = get();
    if (tabs.length <= 1) return; // Son sekme kapatılamaz
    if (!tabs.some((t) => t.screenId === id)) return;

    const nextTabs = tabs.filter((t) => t.screenId !== id);
    const nextActive =
      activeScreenId === id ? pickFallbackActive(tabs, id) : activeScreenId;

    const now = Date.now();
    set({
      tabs: nextTabs.map((t) =>
        t.screenId === nextActive ? { ...t, lastActiveAt: now } : t
      ),
      activeScreenId: nextActive,
    });
  },

  closeOthers: (keepScreenId) => {
    const id = normalizeScreenId(keepScreenId);
    const { tabs } = get();
    const keep = tabs.find((t) => t.screenId === id);
    if (!keep) return;
    const now = Date.now();
    set({
      tabs: [{ ...keep, lastActiveAt: now }],
      activeScreenId: id,
    });
  },

  closeAll: (fallbackScreenId = 'dashboard') => {
    const id = normalizeScreenId(fallbackScreenId);
    const now = Date.now();
    const { tabs } = get();
    const existing = tabs.find((t) => t.screenId === id);
    set({
      tabs: [
        {
          screenId: id,
          title: existing?.title || id,
          openedAt: existing?.openedAt ?? now,
          lastActiveAt: now,
        },
      ],
      activeScreenId: id,
    });
  },

  updateTitle: (screenId, title) => {
    const id = normalizeScreenId(screenId);
    const trimmed = String(title ?? '').trim();
    if (!trimmed) return;
    set({
      tabs: get().tabs.map((t) =>
        t.screenId === id ? { ...t, title: trimmed } : t
      ),
    });
  },
}));
