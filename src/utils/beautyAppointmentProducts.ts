/** Randevu notlarındaki `rex_products:Ürün1,Ürün2` etiketi */
export function parseProductLabelsFromAppointmentNotes(notes?: string | null): string[] {
    const raw = String(notes ?? '');
    const m = raw.match(/rex_products:([^|]+)/i);
    if (!m) return [];
    return m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

export function buildAppointmentProductNotesTag(productNames: string[]): string {
    const names = productNames.map((n) => String(n ?? '').trim()).filter(Boolean);
    if (!names.length) return '';
    return `rex_products:${names.join(',')}`;
}

export function resolveAppointmentProductLabels(
    aptId: string | undefined | null,
    notes?: string | null,
    saleMap?: Map<string, string[]>,
): string[] {
    const id = String(aptId ?? '').trim();
    if (id && saleMap?.has(id)) {
        const fromSale = saleMap.get(id) ?? [];
        if (fromSale.length) return fromSale;
    }
    return parseProductLabelsFromAppointmentNotes(notes);
}
