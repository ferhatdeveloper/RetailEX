import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    Apple,
    Coffee,
    CupSoda,
    Drumstick,
    Fish,
    IceCream,
    Pizza,
    Salad,
    Soup,
    UtensilsCrossed,
    Wine,
    Tag,
} from 'lucide-react';

const MAIN_ICONS: LucideIcon[] = [
    UtensilsCrossed,
    Drumstick,
    Pizza,
    Coffee,
    Soup,
    IceCream,
    Wine,
    Fish,
    Salad,
    Apple,
    CupSoda,
];

function hashLabel(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
}

/** Ana kategori için tutarlı Lucide ikon (mutlaka bir ikon). */
export function MainCategoryIcon({ name, className }: { name: string; className?: string }) {
    const Icon = MAIN_ICONS[hashLabel(name) % MAIN_ICONS.length] ?? UtensilsCrossed;
    return <Icon className={className} aria-hidden />;
}

/** Alt kategori satırı için sabit ikon. */
export function SubCategoryIcon({ className }: { className?: string }) {
    return <Tag className={className} aria-hidden />;
}
