/**
 * RetailEX web uygulamasina eklenecek terazi merkez paneli.
 * Kullanim: src/modules/scale/ScaleSyncPanel.tsx olarak kopyalayin ve route/menu'ye ekleyin.
 * postgrestClient veya mevcut API client ile ayni base URL/kiraci kullanilmalidir.
 */
import { useEffect, useState } from 'react';

type Store = { id: string; name: string; firm_nr: string };
type Device = { device_id: string; device_name: string; last_sync_at?: string; status?: string };
type TransferLog = {
  created_at: string;
  device_id: string;
  terminal_name?: string;
  status: string;
  message?: string;
  detail?: string;
};

const SCALE_TABLE = 'scale_plu_sync';

async function api<T>(base: string, tenant: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base.replace(/\/+$/, '')}/${tenant}${path}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : ([] as unknown as T);
}

export function ScaleSyncPanel({ apiBase = 'https://api.retailex.app', tenant = 'kasap', firmNr = '001' }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<TransferLog[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<Store[]>(apiBase, tenant, `/stores?firm_nr=eq.${firmNr}&select=id,name,firm_nr&order=name`)
      .then((rows) => {
        setStores(rows);
        if (rows[0]) setStoreId(rows[0].id);
      })
      .catch((e) => setMessage(String(e.message || e)));
  }, [apiBase, tenant, firmNr]);

  useEffect(() => {
    if (!storeId) return;
    Promise.all([
      api<Device[]>(apiBase, tenant, `/store_devices?store_id=eq.${storeId}&select=device_id,device_name,last_sync_at,status`),
      api<TransferLog[]>(apiBase, tenant, `/device_sync_transfer_log?store_id=eq.${storeId}&firm_nr=eq.${firmNr}&order=created_at.desc&limit=30`),
    ])
      .then(([devRows, logRows]) => {
        setDevices(devRows);
        setLogs(logRows);
      })
      .catch((e) => setMessage(String(e.message || e)));
  }, [apiBase, tenant, firmNr, storeId]);

  async function createCommand(command: 'push_changed' | 'push_all') {
    if (!storeId) return;
    setMessage('Emir olusturuluyor...');
    try {
      await api(apiBase, tenant, '/sync_queue', {
        method: 'POST',
        body: JSON.stringify({
          table_name: SCALE_TABLE,
          record_id: crypto.randomUUID(),
          action: 'PUSH',
          firm_nr: firmNr,
          target_store_id: storeId,
          status: 'pending',
          source_system: 'RetailEX-Web',
          data: { command, trigger: 'web', firm_nr: firmNr, period_nr: '01', scale_ids: [], incremental: command !== 'push_all' },
        }),
      });
      setMessage(command === 'push_all' ? 'Tum urunler emri olusturuldu.' : 'Degisen urunler emri olusturuldu.');
    } catch (e) {
      setMessage(String((e as Error).message || e));
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Terazi Merkez</h2>
      <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => createCommand('push_changed')}>Degisenleri Gonder</button>
        <button onClick={() => createCommand('push_all')} style={{ marginLeft: 8 }}>Tumunu Gonder</button>
      </div>
      <p>{message}</p>
      <h3>Cihazlar</h3>
      <ul>
        {devices.map((d) => (
          <li key={d.device_id}>{d.device_name || d.device_id} — {d.status} — {d.last_sync_at || '—'}</li>
        ))}
      </ul>
      <h3>Son transferler</h3>
      <ul>
        {logs.map((l, i) => (
          <li key={i}>{l.created_at} | {l.terminal_name || l.device_id} | {l.status} | {l.message}</li>
        ))}
      </ul>
    </div>
  );
}

export default ScaleSyncPanel;
