import { create } from 'zustand';
import { AppointmentStatus } from '../../../types/beauty';
import type {
    BeautyAppointment, BeautySpecialist, BeautyService,
    BeautyPackage, BeautyDevice, BeautyLead, BeautyBodyRegion,
    BeautyCustomer, BeautyPackagePurchase,
} from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';
import { logger } from '../../../services/loggingService';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { ERP_SETTINGS } from '../../../services/postgres';

/** Stale loadServices yanıtlarının boş listeyle üzerine yazmasını önler. */
let servicesLoadSeq = 0;

interface BeautyState {
    // Data
    appointments:       BeautyAppointment[];
    specialists:        BeautySpecialist[];
    services:           BeautyService[];
    packages:           BeautyPackage[];
    devices:            BeautyDevice[];
    leads:              BeautyLead[];
    bodyRegions:        BeautyBodyRegion[];
    customers:          BeautyCustomer[];
    isLoading:          boolean;
    error:              string | null;
    /** Son yüklenen randevu aralığı (yenileme / kayıt sonrası aynı görünümü korumak için). */
    lastAppointmentRange: { start: string; end: string } | null;
    /**
     * Paket → hizmet × personel × yüzde satırları. 177 migration global
     * `service_staff_commissions` tablosunu kullanır; paket başına hangi
     * eşleşmelerin pakete eklendiğini client tarafında tutuyoruz (paket_id
     * bağlamı olmadan da commission hesaplanabilir).
     */
    packageCommissions: Record<string, Array<{
        service_id: string;
        staff_id: string;
        percent: number;
    }>>;

    // Appointment actions
    loadAppointments:       (date: string) => Promise<void>;
    loadAppointmentsInRange:(start: string, end: string) => Promise<void>;
    createAppointment:      (data: Partial<BeautyAppointment>) => Promise<string>;
    updateAppointment:      (id: string, data: Partial<BeautyAppointment>) => Promise<void>;
    updateAppointmentStatus:(id: string, status: AppointmentStatus) => Promise<void>;

    // Specialist actions
    loadSpecialists:    () => Promise<void>;
    createSpecialist:   (data: Partial<BeautySpecialist>) => Promise<void>;
    updateSpecialist:   (id: string, data: Partial<BeautySpecialist>) => Promise<void>;
    toggleSpecialist:   (id: string, active: boolean) => Promise<void>;

    // Service actions
    loadServices:       () => Promise<void>;
    createService:      (data: Partial<BeautyService>) => Promise<void>;
    updateService:      (id: string, data: Partial<BeautyService>) => Promise<void>;
    deleteService:      (id: string) => Promise<void>;

    // Package actions
    loadPackages:       () => Promise<void>;
    createPackage:      (data: Partial<BeautyPackage>) => Promise<string>;
    updatePackage:      (id: string, data: Partial<BeautyPackage>) => Promise<void>;
    deletePackage:      (id: string) => Promise<void>;
    /**
     * Bir pakete (veya taslak pakete) hizmet × personel × yüzde satırı ekler.
     * 177 migration global `service_staff_commissions` tablosunu yazar; liste
     * client state'te paket_id başına gruplanır.
     * `pkgId === null` ise henüz paket kaydedilmemiş taslak ekleme yapılır
     * (form state'inden ayrı bir taslak listesi olarak tutulur).
     */
    addPackageCommissionRow: (
        pkgId: string | null,
        row: { service_id: string; staff_id: string; percent: number },
    ) => Promise<void>;
    removePackageCommissionRow: (
        pkgId: string | null,
        idx: number,
    ) => Promise<void>;
    updatePackageCommissionRow: (
        pkgId: string | null,
        idx: number,
        percent: number,
    ) => Promise<void>;
    /**
     * Mevcut paket için kaydedilmiş yüzdeleri yükler. Henüz DB'de paket
     * başına bir eşleme yok; bu fonksiyon yalnızca `pkgId` null değilse ve
     * DB'de commission satırı varsa getirir, yoksa boş liste döner.
     */
    loadPackageCommissions: (pkgId: string) => Promise<void>;

    // Device actions
    loadDevices:        () => Promise<void>;
    createDevice:       (data: Partial<BeautyDevice>) => Promise<void>;
    updateDevice:       (id: string, data: Partial<BeautyDevice>) => Promise<void>;

    // Lead actions
    loadLeads:          () => Promise<void>;
    createLead:         (data: Partial<BeautyLead>) => Promise<void>;
    updateLead:         (id: string, data: Partial<BeautyLead>) => Promise<void>;
    convertLead:        (leadId: string) => Promise<void>;

    // Customer actions
    loadCustomers:      () => Promise<void>;
    createCustomer:     (data: Partial<BeautyCustomer>) => Promise<void>;
    updateCustomer:     (id: string, data: Partial<BeautyCustomer>) => Promise<void>;

    // Static data
    loadBodyRegions:    () => Promise<void>;
}

export const useBeautyStore = create<BeautyState>()((set, get) => ({
    appointments:   [],
    specialists:    [],
    services:       [],
    packages:       [],
    devices:        [],
    leads:          [],
    bodyRegions:    [],
    customers:      [],
    isLoading:      false,
    error:          null,
    lastAppointmentRange: null,
    packageCommissions: {},

    // -------------------------------------------------------------------------
    // Appointments
    // -------------------------------------------------------------------------
    loadAppointmentsInRange: async (start, end) => {
        set({ isLoading: true, error: null, lastAppointmentRange: { start, end } });
        try {
            const appointments = await beautyService.getAppointmentsInRange(start, end);
            set({ appointments });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    loadAppointments: async (date) => {
        await get().loadAppointmentsInRange(date, date);
    },

    createAppointment: async (data) => {
        try {
            const createdId = await beautyService.createAppointment(data);
            const r = get().lastAppointmentRange;
            const fallback = data.date ?? data.appointment_date ?? formatLocalYmd(new Date());
            if (r) await get().loadAppointmentsInRange(r.start, r.end);
            else await get().loadAppointmentsInRange(fallback, fallback);
            return createdId;
        } catch (e: any) {
            logger.crudError('BeautyStore', 'createAppointment', e);
            throw e;
        }
    },

    updateAppointment: async (id, data) => {
        try {
            await beautyService.updateAppointment(id, data);
            const r = get().lastAppointmentRange;
            const fallback = data.date ?? data.appointment_date ?? formatLocalYmd(new Date());
            if (r) await get().loadAppointmentsInRange(r.start, r.end);
            else await get().loadAppointmentsInRange(fallback, fallback);
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updateAppointment', e, { id });
            throw e;
        }
    },

    updateAppointmentStatus: async (id, status) => {
        try {
            const updatedAt = new Date().toISOString();
            await beautyService.updateAppointmentStatus(id, status);
            // Anlık KPI / liste güncellemesi (dashboard vb.)
            set((state) => ({
                appointments: state.appointments.map(a => a.id === id ? { ...a, status, updated_at: updatedAt } : a),
            }));
            // Sunucu ile hizala — ClinicDashboard KPI ve takvim yenilensin
            const r = get().lastAppointmentRange;
            if (r) await get().loadAppointmentsInRange(r.start, r.end);
            else await get().loadAppointments(formatLocalYmd(new Date()));
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updateAppointmentStatus', e, { id, status });
            throw e;
        }
    },

    // -------------------------------------------------------------------------
    // Specialists
    // -------------------------------------------------------------------------
    loadSpecialists: async () => {
        set({ isLoading: true });
        try {
            const specialists = await beautyService.getSpecialists();
            set({ specialists });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    createSpecialist: async (data) => {
        try {
            await beautyService.createSpecialist(data);
            await get().loadSpecialists();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'createSpecialist', e);
            throw e;
        }
    },

    updateSpecialist: async (id, data) => {
        try {
            await beautyService.updateSpecialist(id, data);
            await get().loadSpecialists();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updateSpecialist', e, { id });
            throw e;
        }
    },

    toggleSpecialist: async (id, active) => {
        try {
            await beautyService.toggleSpecialist(id, active);
            set((state) => ({
                specialists: state.specialists.map(s => s.id === id ? { ...s, is_active: active } : s),
            }));
        } catch (e: any) {
            logger.crudError('BeautyStore', 'toggleSpecialist', e, { id, active });
            throw e;
        }
    },

    // -------------------------------------------------------------------------
    // Services
    // -------------------------------------------------------------------------
    loadServices: async () => {
        const seq = ++servicesLoadSeq;
        set({ isLoading: true, error: null });
        try {
            const firmNr = String(ERP_SETTINGS.firmNr ?? '').trim();
            if (import.meta.env.DEV) {
                console.log('[BeautyStore] loadServices firmNr=', firmNr || '(boş)');
            }
            const services = await beautyService.getServices();
            if (seq !== servicesLoadSeq) return;
            set({ services, error: null, isLoading: false });
        } catch (e: any) {
            if (seq !== servicesLoadSeq) return;
            set({ error: e?.message || String(e), isLoading: false });
        }
    },

    createService: async (data) => {
        try {
            await beautyService.createService(data);
            await get().loadServices();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'createService', e);
            throw e;
        }
    },

    updateService: async (id, data) => {
        try {
            await beautyService.updateService(id, data);
            await get().loadServices();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updateService', e, { id });
            throw e;
        }
    },

    deleteService: async (id) => {
        try {
            await beautyService.deleteService(id);
            set((state) => ({ services: state.services.filter(s => s.id !== id) }));
        } catch (e: any) {
            logger.crudError('BeautyStore', 'deleteService', e, { id });
            throw e;
        }
    },

    // -------------------------------------------------------------------------
    // Packages
    // -------------------------------------------------------------------------
    loadPackages: async () => {
        try {
            const packages = await beautyService.getPackages();
            set({ packages });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        }
    },

    createPackage: async (data) => {
        try {
            const newId = await beautyService.createPackage(data);
            await get().loadPackages();
            return newId;
        } catch (e: any) {
            logger.crudError('BeautyStore', 'createPackage', e);
            throw e;
        }
    },

    updatePackage: async (id, data) => {
        try {
            await beautyService.updatePackage(id, data);
            await get().loadPackages();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updatePackage', e, { id });
            throw e;
        }
    },

    deletePackage: async (id) => {
        try {
            await beautyService.deletePackage(id);
            set((state) => ({
                packages: state.packages.filter(p => p.id !== id),
                packageCommissions: Object.fromEntries(
                    Object.entries(state.packageCommissions).filter(([k]) => k !== id),
                ),
            }));
        } catch (e: any) {
            logger.crudError('BeautyStore', 'deletePackage', e, { id });
            throw e;
        }
    },

    addPackageCommissionRow: async (pkgId, row) => {
        const sid = String(row.service_id ?? '').trim();
        const stid = String(row.staff_id ?? '').trim();
        if (!sid || !stid) return;
        const pct = Math.max(0, Math.min(100, Number(row.percent ?? 0) || 0));
        // 177 migration: yüzdeyi global service_staff_commissions tablosuna yaz
        try {
            if (pct <= 0) {
                await beautyService.deleteServiceStaffCommission(sid, stid).catch(() => undefined);
            } else {
                await beautyService.upsertServiceStaffCommission(sid, stid, pct);
            }
        } catch (e: any) {
            logger.crudError('BeautyStore', 'addPackageCommissionRow', e, { row });
            throw e;
        }
        // Paket başına listeyi client state'te güncelle
        if (pkgId == null) {
            // Taslak liste (henüz paket kaydedilmemiş)
            set((state) => {
                const draft = state.packageCommissions['__draft__'] ?? [];
                const exists = draft.some(
                    r => r.service_id === sid && r.staff_id === stid,
                );
                if (exists) return {};
                return { packageCommissions: { ...state.packageCommissions, '__draft__': [...draft, { service_id: sid, staff_id: stid, percent: pct }] } };
            });
        } else {
            set((state) => {
                const list = state.packageCommissions[pkgId] ?? [];
                const exists = list.some(
                    r => r.service_id === sid && r.staff_id === stid,
                );
                if (exists) return {};
                return { packageCommissions: { ...state.packageCommissions, [pkgId]: [...list, { service_id: sid, staff_id: stid, percent: pct }] } };
            });
        }
    },

    removePackageCommissionRow: async (pkgId, idx) => {
        type Row = { service_id: string; staff_id: string; percent: number };
        const key = pkgId == null ? '__draft__' : pkgId;
        let removed: Row | undefined;
        const currentList: Array<{ service_id: string; staff_id: string; percent: number }>
            = get().packageCommissions[key] ?? [];
        if (idx < 0 || idx >= currentList.length) return;
        removed = currentList[idx] as Row;
        set((state) => {
            const list = state.packageCommissions[key] ?? [];
            if (idx < 0 || idx >= list.length) return {};
            return {
                packageCommissions: {
                    ...state.packageCommissions,
                    [key]: list.filter((_, i) => i !== idx),
                },
            };
        });
        // DB'den de kaldır (yüzde > 0 ise — 177 migration)
        if (removed && Number(removed.percent) > 0) {
            try {
                await beautyService.deleteServiceStaffCommission(removed.service_id, removed.staff_id);
            } catch (e: any) {
                logger.crudError('BeautyStore', 'removePackageCommissionRow', e, { removed });
            }
        }
    },

    updatePackageCommissionRow: async (pkgId, idx, percent) => {
        type Row = { service_id: string; staff_id: string; percent: number };
        const key = pkgId == null ? '__draft__' : pkgId;
        const currentList: Array<{ service_id: string; staff_id: string; percent: number }>
            = get().packageCommissions[key] ?? [];
        if (idx < 0 || idx >= currentList.length) return;
        const next = Math.max(0, Math.min(100, Number(percent) || 0));
        const updated: Row = { ...(currentList[idx] as Row), percent: next };
        set((state) => {
            const list = state.packageCommissions[key] ?? [];
            if (idx < 0 || idx >= list.length) return {};
            return {
                packageCommissions: {
                    ...state.packageCommissions,
                    [key]: list.map((r, i) => i === idx ? { ...r, percent: next } : r),
                },
            };
        });
        try {
            if (Number(updated.percent) <= 0) {
                await beautyService.deleteServiceStaffCommission(updated.service_id, updated.staff_id);
            } else {
                await beautyService.upsertServiceStaffCommission(updated.service_id, updated.staff_id, Number(updated.percent));
            }
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updatePackageCommissionRow', e, { updated });
        }
    },

    loadPackageCommissions: async (pkgId) => {
        // 177 migration paket_id içermez; paket başına gösterim için client
        // state zaten dolu. Yine de taslak temizliği yapalım.
        if (!pkgId) return;
        set((state) => {
            if (!state.packageCommissions['__draft__']) return {};
            const next = { ...state.packageCommissions };
            delete next['__draft__'];
            return { packageCommissions: next };
        });
    },

    // -------------------------------------------------------------------------
    // Devices
    // -------------------------------------------------------------------------
    loadDevices: async () => {
        set({ isLoading: true });
        try {
            const devices = await beautyService.getDevices();
            set({ devices });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    createDevice: async (data) => {
        try {
            await beautyService.createDevice(data);
            await get().loadDevices();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'createDevice', e);
            throw e;
        }
    },

    updateDevice: async (id, data) => {
        try {
            await beautyService.updateDevice(id, data);
            await get().loadDevices();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updateDevice', e, { id });
            throw e;
        }
    },

    // -------------------------------------------------------------------------
    // Leads
    // -------------------------------------------------------------------------
    loadLeads: async () => {
        set({ isLoading: true });
        try {
            const leads = await beautyService.getLeads();
            set({ leads });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    createLead: async (data) => {
        try {
            await beautyService.createLead(data);
            await get().loadLeads();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'createLead', e);
            throw e;
        }
    },

    updateLead: async (id, data) => {
        try {
            await beautyService.updateLead(id, data);
            await get().loadLeads();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updateLead', e, { id });
            throw e;
        }
    },

    convertLead: async (leadId) => {
        try {
            await beautyService.convertLeadToCustomer(leadId);
            await get().loadLeads();
            await get().loadCustomers();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'convertLead', e, { leadId });
            throw e;
        }
    },

    // -------------------------------------------------------------------------
    // Customers
    // -------------------------------------------------------------------------
    loadCustomers: async () => {
        set({ isLoading: true });
        try {
            const customers = await beautyService.getCustomers();
            set({ customers });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    createCustomer: async (data) => {
        try {
            await beautyService.createCustomer(data);
            await get().loadCustomers();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'createCustomer', e);
            throw e;
        }
    },

    updateCustomer: async (id, data) => {
        try {
            await beautyService.updateCustomer(id, data);
            await get().loadCustomers();
        } catch (e: any) {
            logger.crudError('BeautyStore', 'updateCustomer', e, { id });
            throw e;
        }
    },

    // -------------------------------------------------------------------------
    // Body Regions (static)
    // -------------------------------------------------------------------------
    loadBodyRegions: async () => {
        try {
            const bodyRegions = await beautyService.getBodyRegions();
            set({ bodyRegions });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        }
    },
}));
