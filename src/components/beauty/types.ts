import { AppointmentStatus, AppointmentType } from './types';

export interface Service {
    id: string;
    name: string;
    duration: number;
    price: number;
    category: string;
    color?: string;
}

export interface Specialist {
    id: string;
    name: string;
    specialty: string;
    avatar?: string;
}

export interface Client {
    id: string;
    name: string;
    phone: string;
    email: string;
    notes?: string;
    lastVisit?: string;
    balance: number;
    packages: ClientPackage[];
}

export interface ClientPackage {
    id: string;
    serviceId: string;
    serviceName: string;
    totalSessions: number;
    remainingSessions: number;
    expiryDate?: string;
}

export interface BeautyAppointment {
    id: string;
    clientId: string;
    clientName: string;
    serviceId: string;
    serviceName: string;
    specialistId: string;
    specialistName: string;
    date: string;
    time: string;
    duration: number;
    status: AppointmentStatus;
    type: AppointmentType;
    notes?: string;
    totalPrice: number;
    isPackageSession: boolean;
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'noshow';
export type AppointmentType = 'in-person' | 'online' | 'phone';


