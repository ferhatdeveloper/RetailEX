import { Share } from 'react-native';
import { fetchProducts } from './productsApi';
import { fetchCustomers } from './customersApi';

export type ExcelEntitySummary = {
  id: string;
  label: string;
  count: number;
};

export async function fetchExcelEntitySummaries(): Promise<ExcelEntitySummary[]> {
  const [products, customers] = await Promise.all([
    fetchProducts('', 500).catch(() => []),
    fetchCustomers('', 500).catch(() => []),
  ]);
  return [
    { id: 'products', label: 'Ürünler', count: products.length },
    { id: 'customers', label: 'Cariler', count: customers.length },
  ];
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function shareProductsCsv(): Promise<void> {
  const rows = await fetchProducts('', 500);
  const header = ['code', 'barcode', 'name', 'unit', 'price', 'cost', 'stock'].join(',');
  const lines = rows.map((r) =>
    [r.code, r.barcode, r.name, r.unit, r.price, r.cost, r.stock].map(csvEscape).join(','),
  );
  const csv = [header, ...lines].join('\n');
  await Share.share({
    title: 'Asin ürünler',
    message: csv,
  });
}

export async function shareCustomersCsv(): Promise<void> {
  const rows = await fetchCustomers('', 500);
  const header = ['code', 'name', 'phone', 'email', 'city', 'balance'].join(',');
  const lines = rows.map((r) =>
    [r.code, r.name, r.phone, r.email, r.city, r.balance].map(csvEscape).join(','),
  );
  const csv = [header, ...lines].join('\n');
  await Share.share({
    title: 'Asin cariler',
    message: csv,
  });
}
