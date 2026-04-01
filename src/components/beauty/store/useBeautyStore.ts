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

    // Appointment actions
    loadAppointments:       (date: string) => Promise<void>;
    loadAppointmentsInRange:(start: string, end: string) => Promise<void>;
    createAppointment:      (data: Partial<BeautyAppointment>) => Promise<void>;
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
    createPackage:      (data: Partial<BeautyPackage>) => Promise<void>;
    updatePackage:      (id: string, data: Partial<BeautyPackage>) => Promise<void>;
    deletePackage:      (id: string) => Promise<void>;

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
            await beautyService.createAppointment(data);
            const r = get().lastAppointmentRange;
            const fallback = data.date ?? data.appointment_date ?? formatLocalYmd(new Date());
            if (r) await get().loadAppointmentsInRange(r.start, r.end);
            else await get().loadAppointmentsInRange(fallback, fallback);
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
            await beautyService.updateAppointmentStatus(id, status);
            set((state) => ({
                appointments: state.appointments.map(a => a.id === id ? { ...a, status } : a),
            }));
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
        try {
            const services = await beautyService.getServices();
            set({ services });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
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
            await beautyService.createPackage(data);
            await get().loadPackages();
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
            set((state) => ({ packages: state.packages.filter(p => p.id !== id) }));
        } catch (e: any) {
            logger.crudError('BeautyStore', 'deletePackage', e, { id });
            throw e;
        }
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
