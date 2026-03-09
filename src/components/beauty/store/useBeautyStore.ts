import { create } from 'zustand';
import { AppointmentStatus } from '../../../types/beauty';
import type {
    BeautyAppointment, BeautySpecialist, BeautyService,
    BeautyPackage, BeautyDevice, BeautyLead, BeautyBodyRegion,
    BeautyCustomer, BeautyPackagePurchase,
} from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';

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

    // Appointment actions
    loadAppointments:       (date: string) => Promise<void>;
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

    // -------------------------------------------------------------------------
    // Appointments
    // -------------------------------------------------------------------------
    loadAppointments: async (date) => {
        set({ isLoading: true, error: null });
        try {
            const appointments = await beautyService.getAppointments(date);
            set({ appointments });
        } catch (e: any) {
            set({ error: e?.message || String(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    createAppointment: async (data) => {
        await beautyService.createAppointment(data);
        const dateStr = data.date ?? data.appointment_date ?? new Date().toISOString().split('T')[0];
        await get().loadAppointments(dateStr);
    },

    updateAppointment: async (id, data) => {
        await beautyService.updateAppointment(id, data);
        const dateStr = data.date ?? data.appointment_date ?? new Date().toISOString().split('T')[0];
        await get().loadAppointments(dateStr);
    },

    updateAppointmentStatus: async (id, status) => {
        await beautyService.updateAppointmentStatus(id, status);
        set((state) => ({
            appointments: state.appointments.map(a => a.id === id ? { ...a, status } : a),
        }));
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
        await beautyService.createSpecialist(data);
        await get().loadSpecialists();
    },

    updateSpecialist: async (id, data) => {
        await beautyService.updateSpecialist(id, data);
        await get().loadSpecialists();
    },

    toggleSpecialist: async (id, active) => {
        await beautyService.toggleSpecialist(id, active);
        set((state) => ({
            specialists: state.specialists.map(s => s.id === id ? { ...s, is_active: active } : s),
        }));
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
        await beautyService.createService(data);
        await get().loadServices();
    },

    updateService: async (id, data) => {
        await beautyService.updateService(id, data);
        await get().loadServices();
    },

    deleteService: async (id) => {
        await beautyService.deleteService(id);
        set((state) => ({ services: state.services.filter(s => s.id !== id) }));
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
        await beautyService.createPackage(data);
        await get().loadPackages();
    },

    updatePackage: async (id, data) => {
        await beautyService.updatePackage(id, data);
        await get().loadPackages();
    },

    deletePackage: async (id) => {
        await beautyService.deletePackage(id);
        set((state) => ({ packages: state.packages.filter(p => p.id !== id) }));
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
        await beautyService.createDevice(data);
        await get().loadDevices();
    },

    updateDevice: async (id, data) => {
        await beautyService.updateDevice(id, data);
        await get().loadDevices();
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
        await beautyService.createLead(data);
        await get().loadLeads();
    },

    updateLead: async (id, data) => {
        await beautyService.updateLead(id, data);
        await get().loadLeads();
    },

    convertLead: async (leadId) => {
        await beautyService.convertLeadToCustomer(leadId);
        await get().loadLeads();
        await get().loadCustomers();
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
        await beautyService.createCustomer(data);
        await get().loadCustomers();
    },

    updateCustomer: async (id, data) => {
        await beautyService.updateCustomer(id, data);
        await get().loadCustomers();
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
