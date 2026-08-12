import type { Customer, Sale } from '../core/types';

const trim = (v?: string | null): string | undefined => {
  const s = v != null ? String(v).trim() : '';
  return s || undefined;
};

/** POS satışında seçili müşterinin fişe yazdırılacak alanlarını üretir. */
export function buildSaleCustomerSnapshot(customer: Customer | null | undefined): Partial<Sale> {
  if (!customer) return {};

  return {
    customerCode: trim(customer.code),
    customerPhone: trim(customer.phone),
    customerPhone2: trim(customer.phone2),
    customerEmail: trim(customer.email),
    customerAddress: trim(customer.address),
    customerDistrict: trim(customer.district),
    customerCity: trim(customer.city),
    customerPostalCode: trim(customer.postal_code),
    customerCountry: trim(customer.country),
    customerCompany: trim(customer.company),
    customerTitle: trim(customer.title),
    customerTaxNumber: trim(customer.tax_number) || trim(customer.taxNumber),
    customerTaxOffice: trim(customer.tax_office) || trim(customer.taxOffice),
    customerOccupation: trim(customer.occupation),
    customerNotes: trim(customer.notes),
  };
}

export type CustomerReceiptRow = { label: string; value: string };

/** A4/A5 fiş müşteri kartı satırları — yalnızca dolu alanlar. */
export function customerReceiptRows(sale: Sale): CustomerReceiptRow[] {
  const rows: CustomerReceiptRow[] = [];

  const push = (label: string, value?: string | null) => {
    const v = trim(value);
    if (v) rows.push({ label, value: v });
  };

  push('Müşteri', sale.customerName || '—');
  push('Cari Kodu', sale.customerCode);
  push('Ünvan', sale.customerTitle);
  push('Şirket', sale.customerCompany);
  push('Tel', sale.customerPhone);
  push('Tel 2', sale.customerPhone2);
  push('E-posta', sale.customerEmail);
  push('Adres', sale.customerAddress);
  push('İlçe', sale.customerDistrict);
  push('Şehir', sale.customerCity);
  push('Posta Kodu', sale.customerPostalCode);
  push('Ülke', sale.customerCountry);
  push('Vergi No', sale.customerTaxNumber);
  push('Vergi Dairesi', sale.customerTaxOffice);
  push('Meslek', sale.customerOccupation);
  push('Not', sale.customerNotes);

  return rows;
}
