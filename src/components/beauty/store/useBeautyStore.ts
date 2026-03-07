import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
    BeautyAppointment,
    BeautySpecialist,
    BeautyService as ClinicService,
    BeautyPackage,
    BeautyPackagePurchase,
    AppointmentStatus
} from '../../../types/beauty';
import { useSaleStore } from '../../../store/useSaleStore';
import { useProductStore } from '../../../store/useProductStore';
import { useCustomerStore } from '../../../store/useCustomerStore';
import { beautyService } from '../../../services/beautyService';

interface BeautyState {
    appointments: BeautyAppointment[];
    specialists: BeautySpecialist[];
    services: ClinicService[];
    packages: BeautyPackage[];
    isLoading: boolean;

    // Actions
    loadSpecialists: () => Promise<void>;
    loadServices: () => Promise<void>;
    loadAppointments: (date: string) => Promise<void>;
    loadPackages: () => Promise<void>;
    updateAppointmentStatus: (id: string, status: AppointmentStatus) => Promise<void>;
}

export const useBeautyStore = create<BeautyState>()(
    (set, get) => ({
        appointments: [],
        specialists: [],
        services: [],
        packages: [],
        isLoading: false,

        loadSpecialists: async () => {
            set({ isLoading: true });
            try {
                const specialists = await beautyService.getSpecialists();
                set({ specialists });
            } finally {
                set({ isLoading: false });
            }
        },

        loadServices: async () => {
            const services = await beautyService.getServices();
            set({ services });
        },

        loadAppointments: async (date) => {
            const appointments = await beautyService.getAppointments(date);
            set({ appointments });
        },

        loadPackages: async () => {
            const packages = await beautyService.getPackages();
            set({ packages });
        },

        updateAppointmentStatus: async (id, status) => {
            await beautyService.updateAppointmentStatus(id, status);
            set((state) => ({
                appointments: state.appointments.map(a => a.id === id ? { ...a, status } : a)
            }));
        }
    })
);


