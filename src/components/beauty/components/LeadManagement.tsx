import React, { useEffect, useState } from 'react';
import {
    Megaphone, Plus, Search, X, Save, ChevronRight,
    Phone, Mail, Instagram, Facebook, MessageCircle,
    Users, PhoneCall, MapPin, Star, ArrowRight, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LeadSource, LeadStatus } from '../../../types/beauty';
import type { BeautyLead } from '../../../types/beauty';

const SOURCE_CONFIG_BASE: Record<string, { icon: React.ElementType; color: string }> = {
    whatsapp:    { icon: MessageCircle, color: 'bg-green-100 text-green-700' },
    facebook:    { icon: Facebook,      color: 'bg-blue-100 text-blue-700' },
    instagram:   { icon: Instagram,     color: 'bg-pink-100 text-pink-700' },
    phone_call:  { icon: PhoneCall,     color: 'bg-purple-100 text-purple-700' },
    walk_in:     { icon: MapPin,        color: 'bg-orange-100 text-orange-700' },
    referral:    { icon: Star,          color: 'bg-amber-100 text-amber-700' },
    other:       { icon: Users,         color: 'bg-slate-100 text-slate-600' },
};

const STATUS_CONFIG_BASE: Record<string, { color: string; next?: string }> = {
    new:                    { color: 'bg-blue-100 text-blue-700',    next: 'contacted' },
    contacted:              { color: 'bg-indigo-100 text-indigo-700', next: 'qualified' },
    qualified:              { color: 'bg-purple-100 text-purple-700', next: 'appointment_scheduled' },
    appointment_scheduled:  { color: 'bg-amber-100 text-amber-700',  next: 'converted' },
    converted:              { color: 'bg-green-100 text-green-700' },
    lost:                   { color: 'bg-red-100 text-red-700' },
};

const PIPELINE_ORDER = ['new', 'contacted', 'qualified', 'appointment_scheduled', 'converted', 'lost'];

const EMPTY_FORM: Partial<BeautyLead> = {
    name: '', phone: '', email: '', source: LeadSource.OTHER, status: LeadStatus.NEW, notes: '',
};

export function LeadManagement() {
    const { leads, isLoading, loadLeads, createLead, updateLead, convertLead } = useBeautyStore();
    const { tm } = useLanguage();

    const SOURCE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
        whatsapp:   { ...SOURCE_CONFIG_BASE.whatsapp,   label: 'WhatsApp' },
        facebook:   { ...SOURCE_CONFIG_BASE.facebook,   label: 'Facebook' },
        instagram:  { ...SOURCE_CONFIG_BASE.instagram,  label: 'Instagram' },
        phone_call: { ...SOURCE_CONFIG_BASE.phone_call, label: tm('bSourcePhone') },
        walk_in:    { ...SOURCE_CONFIG_BASE.walk_in,    label: tm('bSourceWalkIn') },
        referral:   { ...SOURCE_CONFIG_BASE.referral,   label: tm('bSourceReferral') },
        other:      { ...SOURCE_CONFIG_BASE.other,      label: tm('bSourceOther') },
    };

    const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string }> = {
        new:                   { ...STATUS_CONFIG_BASE.new,                   label: tm('bStatusNew') },
        contacted:             { ...STATUS_CONFIG_BASE.contacted,             label: tm('bStatusContacted') },
        qualified:             { ...STATUS_CONFIG_BASE.qualified,             label: tm('bStatusQualified') },
        appointment_scheduled: { ...STATUS_CONFIG_BASE.appointment_scheduled, label: tm('bStatusAppointmentScheduled') },
        converted:             { ...STATUS_CONFIG_BASE.converted,             label: tm('bStatusConverted') },
        lost:                  { ...STATUS_CONFIG_BASE.lost,                  label: tm('bStatusLost') },
    };
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<BeautyLead>>(EMPTY_FORM);
    const [isEdit, setIsEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [converting, setConverting] = useState<string | null>(null);

    useEffect(() => { loadLeads(); }, []);

    const filtered = leads.filter(l => {
        const matchSearch = !search ||
            l.name?.toLowerCase().includes(search.toLowerCase()) ||
            l.phone?.includes(search) ||
            l.email?.toLowerCase().includes(search.toLowerCase());
        const matchStatus = filterStatus === 'all' || l.status === filterStatus;
        return matchSearch && matchStatus;
    });

    const openCreate = () => { setEditing(EMPTY_FORM); setIsEdit(false); setShowModal(true); };
    const openEdit = (l: BeautyLead) => { setEditing({ ...l }); setIsEdit(true); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (isEdit && editing.id) await updateLead(editing.id, editing);
            else await createLead(editing);
            setShowModal(false);
        } finally { setSaving(false); }
    };

    const handleAdvanceStatus = async (lead: BeautyLead) => {
        const cfg = STATUS_CONFIG[lead.status];
        if (!cfg?.next) return;
        await updateLead(lead.id, { ...lead, status: cfg.next });
    };

    const handleConvert = async (leadId: string) => {
        setConverting(leadId);
        try {
            await convertLead(leadId);
        } finally {
            setConverting(null);
        }
    };

    const pipelineCount = (status: string) => leads.filter(l => l.status === status).length;
    const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('tr-TR') : '-';

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-500">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-600">
                        <Megaphone size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">{tm('bLeadManagement')}</h1>
                        <p className="text-xs text-slate-500 font-medium">
                            {isLoading ? tm('bLoading') : `${leads.length} lead · ${leads.filter(l => l.status === 'converted').length} ${tm('bLeadConverted')}`}
                        </p>
                    </div>
                </div>
                <Button onClick={openCreate} className="h-10 rounded-xl px-4 bg-pink-600 hover:bg-pink-700 text-white font-bold gap-2 shadow-lg shadow-pink-600/20 active:scale-95 transition-all">
                    <Plus size={18} /> {tm('bLeadCreate')}
                </Button>
            </div>

            {/* Pipeline summary bar */}
            <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3 overflow-x-auto shrink-0">
                <button
                    onClick={() => setFilterStatus('all')}
                    className={`text-xs font-black px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${filterStatus === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                    {tm('bAll')} ({leads.length})
                </button>
                {PIPELINE_ORDER.map(status => {
                    const cfg = STATUS_CONFIG[status];
                    const count = pipelineCount(status);
                    if (count === 0 && filterStatus !== status) return null;
                    return (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`text-xs font-black px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${filterStatus === status ? 'bg-slate-900 text-white' : `${cfg.color} hover:opacity-80`}`}
                        >
                            {cfg.label} ({count})
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-hidden flex p-4 gap-4">
                {/* Lead List */}
                <div className="w-full lg:w-3/5 bg-white rounded-3xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={tm('bLeadSearchPlaceholder')}
                                className="w-full bg-slate-50 border-none rounded-xl h-10 pl-9 pr-4 text-sm focus:ring-2 focus:ring-pink-500/20 transition-all text-slate-700 placeholder:text-slate-400 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">{tm('bLoading')}</div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                                <Megaphone size={32} />
                                <p className="text-sm font-medium">{search ? tm('bNoResults') : tm('bNoLeads')}</p>
                            </div>
                        ) : filtered.map(lead => {
                            const srcCfg = SOURCE_CONFIG[lead.source] ?? SOURCE_CONFIG.other;
                            const stsCfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new;
                            const SrcIcon = srcCfg.icon;
                            const isConverted = lead.status === 'converted';
                            return (
                                <div key={lead.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => openEdit(lead)}>
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${srcCfg.color}`}>
                                        <SrcIcon size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-bold text-slate-900 truncate">{lead.name}</p>
                                            {isConverted && <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            {lead.phone && <span className="text-xs text-slate-500">{lead.phone}</span>}
                                            <Badge className={`border-none text-[10px] font-bold ${stsCfg.color}`}>{stsCfg.label}</Badge>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-slate-400">{formatDate(lead.first_contact_date)}</span>
                                        {!isConverted && stsCfg.next && (
                                            <button
                                                onClick={e => { e.stopPropagation(); handleAdvanceStatus(lead); }}
                                                className="p-1.5 bg-slate-50 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-all"
                                                title={tm('bAdvanceStatus')}
                                            >
                                                <ArrowRight size={14} />
                                            </button>
                                        )}
                                        {lead.status === 'appointment_scheduled' && (
                                            <button
                                                onClick={e => { e.stopPropagation(); handleConvert(lead.id); }}
                                                disabled={converting === lead.id}
                                                className="text-[10px] font-black bg-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-200 transition-all disabled:opacity-50"
                                            >
                                                {converting === lead.id ? '...' : tm('bConvertToCustomer')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Pipeline Stats (Desktop) */}
                <div className="hidden lg:flex lg:w-2/5 flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4">{tm('bPipelineSummary')}</h3>
                        <div className="space-y-3">
                            {PIPELINE_ORDER.map(status => {
                                const cfg = STATUS_CONFIG[status];
                                const count = pipelineCount(status);
                                const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                                return (
                                    <div key={status}>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-700">{cfg.label}</span>
                                            <span className="text-xs font-black text-slate-500">{count}</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${cfg.color.replace('text-', 'bg-').replace('-700', '-500').replace('-600', '-400')}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4">{tm('bChannelDistribution')}</h3>
                        <div className="space-y-2">
                            {Object.entries(SOURCE_CONFIG).map(([src, cfg]) => {
                                const count = leads.filter(l => l.source === src).length;
                                if (count === 0) return null;
                                const Icon = cfg.icon;
                                return (
                                    <div key={src} className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.color}`}>
                                            <Icon size={14} />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700 flex-1">{cfg.label}</span>
                                        <span className="text-sm font-black text-slate-900">{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-pink-600 to-rose-500 p-6 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black">{isEdit ? tm('bLeadEdit') : tm('bLeadNew')}</h2>
                                <p className="text-white/70 text-xs mt-1">beauty.rex_firma_beauty_leads</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bLeadName')} <span className="text-red-500">*</span></label>
                                <input type="text" value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Aday ismi" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bLeadPhone')}</label>
                                    <input type="tel" value={editing.phone ?? ''} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="0555 000 0000" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bLeadEmail')}</label>
                                    <input type="email" value={editing.email ?? ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} placeholder="email@domain.com" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bLeadSource')}</label>
                                    <select value={editing.source ?? 'other'} onChange={e => setEditing(p => ({ ...p, source: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400 bg-white">
                                        {Object.entries(SOURCE_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bLeadStage')}</label>
                                    <select value={editing.status ?? 'new'} onChange={e => setEditing(p => ({ ...p, status: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400 bg-white">
                                        {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            {editing.status === 'lost' && (
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bLeadLostReason')}</label>
                                    <input type="text" value={editing.lost_reason ?? ''} onChange={e => setEditing(p => ({ ...p, lost_reason: e.target.value }))} placeholder="Fiyat, zaman, rekabet..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400" />
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">{tm('bLeadNotes')}</label>
                                <textarea value={editing.notes ?? ''} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="İlgilendiği hizmetler, notlar..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400 resize-none" />
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 rounded-xl border-slate-200 font-bold">{tm('cancel')}</Button>
                            <Button onClick={handleSave} disabled={!editing.name?.trim() || saving} className="flex-1 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold shadow-lg shadow-pink-600/20">
                                <Save size={16} className="mr-2" />{saving ? tm('bSaving') : tm('save')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
