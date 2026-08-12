import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { beautyService } from '../../../services/beautyService';

/**
 * Halka açık randevu talebi — `/book/:firmNr?period=01&token=...`
 * Veritabanı bağlantısı (Tauri köprü veya web PG) gerekir; token portal ayarlarındaki public_token ile eşleşmelidir.
 */
export default function PublicBeautyBooking() {
    const { firmNr = '001' } = useParams<{ firmNr: string }>();
    const [search] = useSearchParams();
    const period = search.get('period') || '01';
    const token = search.get('token') || '';

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [time, setTime] = useState('10:00');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [online, setOnline] = useState<boolean | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const s = await beautyService.getPortalSettingsRaw(firmNr);
                setOnline(!!s?.online_booking_enabled);
            } catch {
                setOnline(false);
            }
        })();
    }, [firmNr]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        if (!token.trim()) {
            setErr('Geçerli bir bağlantı anahtarı (token) gerekli.');
            return;
        }
        setBusy(true);
        try {
            await beautyService.submitPublicBookingRequest(firmNr, period, token.trim(), {
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim() || undefined,
                requested_date: date,
                requested_time: time,
                notes: notes.trim() || undefined,
            });
            setDone(true);
        } catch (ex: unknown) {
            setErr(ex instanceof Error ? ex.message : String(ex));
        } finally {
            setBusy(false);
        }
    };

    if (online === false) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
                <p className="text-slate-600">Bu firma için online randevu kapalı veya ayarlar yüklenemedi.</p>
            </div>
        );
    }

    if (done) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-violet-50 to-white">
                <Sparkles className="text-violet-600 mb-4" size={40} />
                <h1 className="text-xl font-bold text-slate-800">Talebiniz alındı</h1>
                <p className="text-slate-600 mt-2 text-center max-w-md">
                    Klinik onayladığında sizinle iletişime geçilecektir.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-violet-50 to-white">
            <div className="w-full max-w-md rounded-2xl border border-violet-100 bg-white p-6 shadow-lg shadow-violet-100/80">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
                        <Sparkles className="text-white" size={22} />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Randevu talebi</h1>
                        <p className="text-xs text-slate-500">Firma: {firmNr} · Dönem: {period}</p>
                    </div>
                </div>
                <form onSubmit={submit} className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-600">Ad soyad</label>
                        <Input required value={name} onChange={e => setName(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Telefon</label>
                        <Input required value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">E-posta (isteğe bağlı)</label>
                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs font-medium text-slate-600">Tercih tarihi</label>
                            <Input type="date" required value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600">Saat</label>
                            <Input type="time" required value={time} onChange={e => setTime(e.target.value)} className="mt-1" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Not</label>
                        <Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" placeholder="İsteğe bağlı" />
                    </div>
                    {err && <p className="text-sm text-red-600">{err}</p>}
                    <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700" disabled={busy}>
                        {busy ? 'Gönderiliyor…' : 'Talep gönder'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
