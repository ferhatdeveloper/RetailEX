export enum AppointmentStatus {
    SCHEDULED = 'scheduled',
    CONFIRMED = 'confirmed',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    NO_SHOW = 'no_show'
}

export enum ServiceCategory {
    LASER = 'laser',
    HAIR_SALON = 'hair_salon',
    BEAUTY = 'beauty',
    HAIR_TRANSPLANT = 'hair_transplant',
    BOTOX = 'botox',
    FILLER = 'filler',
    PHYSICAL_THERAPY = 'physical_therapy',
    MASSAGE = 'massage',
    SKINCARE = 'skincare',
    MAKEUP = 'makeup',
    NAILS = 'nails',
    SPA = 'spa'
}
export interface BeautySpecialist {
    id: string;
    name: string;
    role: string;
    phone: string;
    email?: string;
    commission_rate: number;
    active: boolean;
}

export interface BeautyService {
    id: string;
    name: string;
    category: ServiceCategory;
    duration: number;
    price: number;
    color?: string;
    is_active: boolean;
    requires_device?: boolean;
}

export interface BeautyDevice {
    id: string;
    name: string;
    type: string;
    serial_number: string;
    is_active: boolean;
}

export interface BeautyAppointment {
    id: string;
    customer_id: string;
    customer_name: string;
    service_id: string;
    service_name: string;
    staff_id: string;
    staff_name: string;
    device_id?: string;
    date: string;
    time: string;
    duration: number;
    status: AppointmentStatus;
    total_price: number;
    is_package_session: boolean;
}

export interface BeautyPackage {
    id: string;
    name: string;
    description?: string;
    total_sessions: number;
    price: number;
    active: boolean;
}

export interface BeautyPackagePurchase {
    id: string;
    customer_id: string;
    package_id: string;
    total_sessions: number;
    remaining_sessions: number;
    purchase_date: string;
    expiry_date?: string;
    status: 'active' | 'completed' | 'expired';
}

