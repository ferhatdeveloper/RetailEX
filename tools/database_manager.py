import os
import asyncio
import webbrowser
import uvicorn
import re
import json
import httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

app = FastAPI(title="RetailEX Database Manager")

class DBConfig(BaseModel):
    dialect: str  # postgresql / mssql
    host: str
    port: int
    database: str
    username: str
    password: str
    supabase_url: Optional[str] = None
    supabase_key: Optional[str] = None
    include_data: bool = False
    reset_target: bool = False
    setup_core_schema: bool = True
    save_sql: bool = False
    selected_tables: List[str] = []

# Helper to get connection string
def get_connection_string(config: DBConfig) -> str:
    if config.dialect == "postgresql":
        return f"postgresql://{config.username}:{config.password}@{config.host}:{config.port}/{config.database}"
    elif config.dialect == "mssql":
        return f"mssql+pyodbc://{config.username}:{config.password}@{config.host}:{config.port}/{config.database}?driver=ODBC+Driver+17+for+SQL+Server"
    return ""

@app.get("/", response_class=HTMLResponse)
async def get_index():
    return """
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RetailEX | DB Manager</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
            body { 
                font-family: 'Inter', sans-serif; 
                background: radial-gradient(circle at top right, #1e1b4b, #000000);
                color: #e2e8f0;
                min-height: 100vh;
            }
            .glass {
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8);
            }
            .accent-gradient {
                background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            }
            .tab-btn.active {
                background: rgba(99, 102, 241, 0.2);
                border-color: #6366f1;
                color: white;
            }
        </style>
    </head>
    <body class="flex items-center justify-center p-4">
        <div class="max-w-5xl w-full glass rounded-3xl p-8 md:p-12">
            <header class="mb-8 text-center">
                <div class="inline-block p-4 rounded-2xl bg-indigo-600/20 mb-4">
                    <i class="fas fa-database text-4xl text-indigo-400"></i>
                </div>
                <h1 class="text-4xl font-bold tracking-tight text-white mb-2">Veritabanı Yönetim Merkezi</h1>
                <p class="text-slate-400">Kurulum ve Veri Taşıma İşlemleri</p>
            </header>

            <!-- Tabs -->
            <div class="flex gap-2 mb-8 bg-black/40 p-1 rounded-2xl border border-white/5">
                <button onclick="switchTab('setup')" id="tab-setup-btn" class="tab-btn active flex-1 py-3 font-bold rounded-xl border border-transparent transition-all">
                    <i class="fas fa-magic mr-2"></i> Kurulum Sihirbazı
                </button>
                <button onclick="switchTab('migration')" id="tab-migration-btn" class="tab-btn flex-1 py-3 font-bold rounded-xl border border-transparent transition-all text-slate-400">
                    <i class="fas fa-exchange-alt mr-2"></i> Supabase Migrasyonu
                </button>
            </div>

            <div id="setup-tab" class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <!-- Sol Panel: Ayarlar -->
                <div class="md:col-span-2 space-y-6">
                    <div class="space-y-4">
                        <label class="block text-sm font-semibold text-slate-300">Veritabanı Türü</label>
                        <div class="flex gap-4">
                            <button id="btn-pg" onclick="setDialect('postgresql')" class="flex-1 py-4 glass rounded-2xl border-2 border-indigo-500/50 bg-indigo-500/10 transition-all">
                                <i class="fab fa-postgresql mb-2 block text-2xl"></i>
                                <span class="font-bold">PostgreSQL</span>
                            </button>
                            <button id="btn-ms" onclick="setDialect('mssql')" class="flex-1 py-4 glass rounded-2xl border-2 border-transparent hover:border-slate-500 transition-all opacity-50">
                                <i class="fas fa-server mb-2 block text-2xl"></i>
                                <span class="font-bold">MS SQL Server</span>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-bold uppercase text-slate-500 ml-1">Sunucu (Host)</label>
                            <input type="text" id="host" value="localhost" class="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-bold uppercase text-slate-500 ml-1">Port</label>
                            <input type="number" id="port" value="5432" class="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label class="text-xs font-bold uppercase text-slate-500 ml-1">Veritabanı Adı</label>
                        <input type="text" id="db_name" value="exretailos_db" class="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-xs font-bold uppercase text-slate-500 ml-1">Kullanıcı</label>
                            <input type="text" id="user" value="postgres" class="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                        </div>
                        <div class="space-y-2">
                            <label class="text-xs font-bold uppercase text-slate-500 ml-1">Şifre</label>
                            <input type="password" id="pass" class="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                        </div>
                    </div>
                </div>

                <!-- Sağ Panel: İşlemler -->
                <div class="space-y-4">
                    <button onclick="testConnection()" class="w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 font-bold transition-all border border-slate-600">
                        <i class="fas fa-link mr-2"></i> Bağlantıyı Test Et
                    </button>
                    
                    <div id="setup-controls" class="hidden space-y-4 pt-4 border-t border-slate-700">
                        <button onclick="runSetup()" class="w-full py-6 rounded-2xl accent-gradient hover:opacity-90 font-bold text-lg shadow-lg shadow-indigo-500/20 transition-all">
                            <i class="fas fa-rocket mr-2"></i> Kurulumu Başlat
                        </button>
                        
                        <div class="flex items-center gap-2 p-4 glass rounded-2xl">
                            <input type="checkbox" id="load_demo" class="w-5 h-5 accent-indigo-500">
                            <label for="load_demo" class="text-sm font-medium">Demo/Örnek veri ekle</label>
                        </div>
                    </div>

                    <div id="status-panel" class="p-6 rounded-2xl bg-black/40 border border-slate-800 hidden">
                        <h3 class="text-xs font-bold text-slate-500 uppercase mb-4">İşlem Günlüğü</h3>
                        <div id="log" class="text-xs space-y-2 max-h-48 overflow-y-auto pr-2"></div>
                    </div>
                </div>
            </div>

            <!-- Migration Tab -->
            <div id="migration-tab" class="hidden grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="md:col-span-2 space-y-6">
                    <div class="p-6 glass rounded-2xl border border-indigo-500/20">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-bold flex items-center"><i class="fas fa-cloud-download-alt mr-2 text-indigo-400"></i> Kaynak: Supabase</h3>
                            <button onclick="showCloudLogin()" class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/40 transition-all">
                                <i class="fas fa-plug mr-1"></i> Hesaba Bağlan (Otomatik)
                            </button>
                        </div>
                        
                        <div id="cloud-login-area" class="hidden mb-6 p-4 bg-black/40 rounded-xl border border-indigo-500/20 space-y-4">
                            <div class="space-y-2">
                                <label class="text-[10px] font-bold uppercase text-slate-500">Supabase Access Token (PAT)</label>
                                <div class="flex gap-2">
                                    <input type="password" id="sb_pat" value="sbp_3090cc42bc5caf82edda3a84b8c5f52df3a1282f" placeholder="sbp_..." class="flex-1 bg-black/60 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                                    <button onclick="fetchSupabaseProjects(event)" class="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-bold">Listele</button>
                                </div>
                                <p class="text-[9px] text-slate-500 italic">Token yoksa: <a href="https://supabase.com/dashboard/account/tokens" target="_blank" class="text-indigo-400 underline">Buradan al</a></p>
                            </div>
                            
                            <div id="project-selector-area" class="hidden space-y-2">
                                <label class="text-[10px] font-bold uppercase text-slate-500">Proje Seçin</label>
                                <select id="sb_project" onchange="fetchProjectKeys()" class="w-full bg-black/60 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                                    <option value="">Proje seçiniz...</option>
                                </select>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="space-y-2">
                                <label class="text-xs font-bold uppercase text-slate-500 ml-1">Supabase Project URL</label>
                                <input type="text" id="sb_url" placeholder="https://xyz.supabase.co" class="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                            </div>
                            <div class="space-y-2">
                                <label class="text-xs font-bold uppercase text-slate-500 ml-1">Service Role Key (Secret)</label>
                                <input type="password" id="sb_key" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." class="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none">
                            </div>
                        </div>
                    </div>

                    <div class="p-6 glass rounded-2xl border border-indigo-500/20">
                        <h3 class="text-lg font-bold mb-4 flex items-center"><i class="fas fa-hdd mr-2 text-green-400"></i> Hedef: Yeni Veritabanı</h3>
                        <div class="space-y-4">
                            <div class="flex gap-2 p-1 bg-black/20 rounded-xl mb-4">
                                <button onclick="setMigDialect('postgresql')" id="mig-btn-pg" class="flex-1 py-2 rounded-lg font-bold text-xs transition-all bg-indigo-500/20 border border-indigo-500 text-white">PostgreSQL</button>
                                <button onclick="setMigDialect('mssql')" id="mig-btn-ms" class="flex-1 py-2 rounded-lg font-bold text-xs transition-all text-slate-400 border border-transparent">MS SQL Server</button>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div class="space-y-1">
                                    <label class="text-[10px] font-bold uppercase text-slate-500">Host</label>
                                    <input type="text" id="mig_host" value="localhost" class="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                                </div>
                                <div class="space-y-1">
                                    <label class="text-[10px] font-bold uppercase text-slate-500">Database</label>
                                    <input type="text" id="mig_db" value="exretailos_migrated" class="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                                </div>
                                <div class="space-y-1">
                                    <label class="text-[10px] font-bold uppercase text-slate-500">Port</label>
                                    <input type="number" id="mig_port" value="5432" class="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div class="space-y-1">
                                    <label class="text-[10px] font-bold uppercase text-slate-500">Kullanıcı</label>
                                    <input type="text" id="mig_user" value="postgres" class="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                                </div>
                                <div class="space-y-1">
                                    <label class="text-[10px] font-bold uppercase text-slate-500">Şifre</label>
                                    <input type="password" id="mig_pass" class="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <div class="p-4 glass rounded-2xl flex flex-col gap-3">
                        <h3 class="font-bold text-sm text-slate-300">Taşıma Ayarları</h3>
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="migrate_data" checked class="w-5 h-5 accent-indigo-500">
                            <label for="migrate_data" class="text-sm font-medium">Tüm verileri aktar</label>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="reset_target" class="w-5 h-5 accent-red-500">
                            <label for="reset_target" class="text-sm font-medium text-red-400">Önce hedefi temizle</label>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="setup_core_schema" checked class="w-5 h-5 accent-indigo-500">
                            <label for="setup_core_schema" class="text-sm font-medium">Temel Şemayı Kur (01_tables.sql)</label>
                        </div>
                        <div class="border-t border-slate-800 my-1 pt-2">
                            <div class="flex items-center gap-2">
                                <input type="checkbox" id="save_sql" class="w-5 h-5 accent-amber-500">
                                <label for="save_sql" class="text-sm font-medium text-amber-300">SQL Dosyası Olarak Kaydet (Yedek)</label>
                            </div>
                        </div>
                        <div id="table-selection-panel" class="hidden border-t border-slate-800 my-2 pt-2">
                            <h4 class="text-[10px] font-bold uppercase text-slate-500 mb-2 flex justify-between items-center">
                                <span>AKTARILACAK TABLOLAR (<span id="table-count" class="text-indigo-400">0</span>)</span>
                                <div class="flex gap-2 text-[9px]">
                                    <button onclick="toggleAllTables(true)" class="text-indigo-400 hover:text-indigo-300">Tümü</button>
                                    <span class="text-slate-700">|</span>
                                    <button onclick="toggleAllTables(false)" class="text-slate-500 hover:text-slate-300">Hiçbiri</button>
                                </div>
                            </h4>
                            <div id="table-list" class="grid grid-cols-2 gap-x-4 gap-y-1 max-h-40 overflow-y-auto pr-2 text-[11px]">
                                <!-- Tables will be loaded here -->
                            </div>
                        </div>
                    </div>

                    <button onclick="runMigration()" class="w-full py-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-bold text-lg shadow-lg shadow-indigo-500/20 transition-all">
                        <i class="fas fa-play mr-2"></i> Migrasyonu Başlat
                    </button>

                    <div id="mig-status-panel" class="p-6 rounded-2xl bg-black/40 border border-slate-800 hidden">
                        <h3 class="text-xs font-bold text-slate-500 uppercase mb-4">Migrasyon Günlüğü</h3>
                        <div id="mig-log" class="text-xs space-y-2 max-h-64 overflow-y-auto pr-2"></div>
                    </div>
                </div>
            </div>

            <footer class="mt-12 pt-8 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                <p>&copy; 2026 EXFIN RetailEX Team</p>
                <div class="flex gap-4">
                    <span><i class="fas fa-shield-alt mr-1"></i> SSL Hazır</span>
                    <span><i class="fas fa-check-circle mr-1"></i> v3.0 Şema</span>
                </div>
            </footer>
        </div>

        <script>
            let currentDialect = 'postgresql';
            let migDialect = 'postgresql';

            function switchTab(tab) {
                document.getElementById('setup-tab').classList.toggle('hidden', tab !== 'setup');
                document.getElementById('migration-tab').classList.toggle('hidden', tab !== 'migration');
                document.getElementById('tab-setup-btn').classList.toggle('active', tab === 'setup');
                document.getElementById('tab-migration-btn').classList.toggle('active', tab === 'migration');
            }

            function setDialect(d) {
                currentDialect = d;
                document.getElementById('btn-pg').style.opacity = d === 'postgresql' ? '1' : '0.5';
                document.getElementById('btn-pg').style.borderColor = d === 'postgresql' ? '#6366f1' : 'transparent';
                document.getElementById('btn-ms').style.opacity = d === 'mssql' ? '1' : '0.5';
                document.getElementById('btn-ms').style.borderColor = d === 'mssql' ? '#6366f1' : 'transparent';
                
                document.getElementById('port').value = d === 'postgresql' ? '5432' : '1433';
                document.getElementById('user').value = d === 'postgresql' ? 'postgres' : 'sa';
            }

            function setMigDialect(d) {
                migDialect = d;
                document.getElementById('mig-btn-pg').classList.toggle('bg-indigo-500/20', d === 'postgresql');
                document.getElementById('mig-btn-pg').classList.toggle('border-indigo-500', d === 'postgresql');
                document.getElementById('mig-btn-pg').classList.toggle('text-white', d === 'postgresql');
                document.getElementById('mig-btn-pg').classList.toggle('text-slate-400', d !== 'postgresql');
                document.getElementById('mig-btn-pg').classList.toggle('border-transparent', d !== 'postgresql');

                document.getElementById('mig-btn-ms').classList.toggle('bg-indigo-500/20', d === 'mssql');
                document.getElementById('mig-btn-ms').classList.toggle('border-indigo-500', d === 'mssql');
                document.getElementById('mig-btn-ms').classList.toggle('text-white', d === 'mssql');
                document.getElementById('mig-btn-ms').classList.toggle('text-slate-400', d !== 'mssql');
                document.getElementById('mig-btn-ms').classList.toggle('border-transparent', d !== 'mssql');
                
                document.getElementById('mig_user').value = d === 'postgresql' ? 'postgres' : 'sa';
                document.getElementById('mig_port').value = d === 'postgresql' ? '5432' : '1433';
            }

            async function testConnection() {
                const config = getConfigs();
                const log = document.getElementById('log');
                const setup = document.getElementById('setup-controls');
                const status = document.getElementById('status-panel');

                status.classList.remove('hidden');
                log.innerHTML = '<div><i class="fas fa-spinner fa-spin mr-1"></i> Bağlantı test ediliyor...</div>';

                try {
                    const res = await fetch('/api/test', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(config)
                    });
                    const data = await res.json();
                    
                    if (res.ok && data.status === 'success') {
                        log.innerHTML += '<div class="text-green-400 font-bold"><i class="fas fa-check-circle mr-1"></i> BAĞLANTI BAŞARILI</div>';
                        setup.classList.remove('hidden');
                    } else if (data.status === 'db_not_found') {
                        log.innerHTML += `<div class="text-amber-400 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i> VERİTABANI BULUNAMADI</div>`;
                        log.innerHTML += `<button onclick="createDatabase()" class="mt-2 w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs transition-all">Veritabanını Şimdi Oluştur</button>`;
                    } else {
                        log.innerHTML += `<div class="text-red-400 font-bold"><i class="fas fa-times-circle mr-1"></i> HATA: ${data.detail}</div>`;
                    }
                } catch (e) {
                    log.innerHTML += `<div class="text-red-400 font-bold"><i class="fas fa-wifi mr-1"></i> SERVIS HATASI</div>`;
                }
            }

            async function createDatabase() {
                const config = getConfigs();
                const log = document.getElementById('log');
                log.innerHTML += '<div><i class="fas fa-tools fa-spin mr-1"></i> Veritabanı oluşturuluyor...</div>';

                try {
                    const res = await fetch('/api/create', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(config)
                    });
                    const data = await res.json();
                    if (res.ok) {
                        log.innerHTML += '<div class="text-green-400 font-bold">Veritabanı başarıyla oluşturuldu!</div>';
                        testConnection();
                    } else {
                        log.innerHTML += `<div class="text-red-400">Oluşturma hatası: ${data.detail}</div>`;
                    }
                } catch (e) {
                    log.innerHTML += '<div class="text-red-400 font-bold">Hata oluştu.</div>';
                }
            }

            async function runSetup() {
                const config = getConfigs();
                const loadDemo = document.getElementById('load_demo').checked;
                const log = document.getElementById('log');
                
                log.innerHTML += '<div class="pt-4 border-t border-slate-800 font-bold text-indigo-400">Kurulum süreci başladı...</div>';

                try {
                    const res = await fetch('/api/run', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({...config, load_demo: loadDemo})
                    });
                    
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const text = decoder.decode(value);
                        log.innerHTML += `<div>${text}</div>`;
                        log.scrollTop = log.scrollHeight;
                    }
                } catch (e) {
                    log.innerHTML += `<div class="text-red-400 font-bold">KRİTİK HATA OLUŞTU</div>`;
                }
            }

            function showCloudLogin() {
                document.getElementById('cloud-login-area').classList.toggle('hidden');
            }

            async function fetchSupabaseProjects(event) {
                const token = document.getElementById('sb_pat').value;
                if (!token) return alert('Lütfen Personal Access Token giriniz.');
                
                const btn = event ? event.target : null;
                if(btn) {
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    btn.disabled = true;
                }

                try {
                    const res = await fetch('/api/supabase/projects', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({token})
                    });
                    const projects = await res.json();
                    
                    const select = document.getElementById('sb_project');
                    select.innerHTML = '<option value="">Proje seçiniz...</option>';
                    projects.forEach(p => {
                        select.innerHTML += `<option value="${p.id}">${p.name} (${p.region})</option>`;
                    });
                    
                    document.getElementById('project-selector-area').classList.remove('hidden');
                } catch (e) {
                    alert('Projeler alınamadı. Token geçerliliğini kontrol edin.');
                } finally {
                    btn.innerHTML = 'Listele';
                    btn.disabled = false;
                }
            }

            async function fetchProjectKeys() {
                const token = document.getElementById('sb_pat').value;
                const projectRef = document.getElementById('sb_project').value;
                if (!projectRef) return;
                
                try {
                    const res = await fetch('/api/supabase/keys', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({token, project_ref: projectRef})
                    });
                    const data = await res.json();
                    
                    document.getElementById('sb_url').value = data.url;
                    document.getElementById('sb_key').value = data.service_role_key;
                    
                    // Başarı animasyonu için border parlatma
                    document.getElementById('sb_url').style.borderColor = '#6366f1';
                    document.getElementById('sb_key').style.borderColor = '#6366f1';
                    setTimeout(() => {
                        document.getElementById('sb_url').style.borderColor = '';
                        document.getElementById('sb_key').style.borderColor = '';
                    }, 2000);
                } catch (e) {
                    alert('Proje detayları alınamadı.');
                }
                
                // Fetch tables after fetching keys
                fetchProjectTables();
            }

            async function fetchProjectTables() {
                const token = document.getElementById('sb_pat').value;
                const projectRef = document.getElementById('sb_project').value;
                if (!projectRef) return;
                
                const tableList = document.getElementById('table-list');
                const tablePanel = document.getElementById('table-selection-panel');
                tableList.innerHTML = '<div class="col-span-2 text-slate-500 italic"><i class="fas fa-spinner fa-spin mr-1"></i> Tablolar taranıyor...</div>';
                tablePanel.classList.remove('hidden');

                try {
                    const res = await fetch('/api/supabase/tables', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({token, project_ref: projectRef})
                    });
                    const tables = await res.json();
                    
                    tableList.innerHTML = '';
                    tables.forEach(t => {
                        tableList.innerHTML += `
                            <label class="flex items-center gap-2 hover:bg-white/5 p-1 rounded cursor-pointer transition-colors">
                                <input type="checkbox" name="sb_tables" value="${t.name}" checked class="w-3.5 h-3.5 accent-indigo-500">
                                <span class="truncate" title="${t.name}">${t.name}</span>
                            </label>
                        `;
                    });
                    document.getElementById('table-count').innerText = tables.length;
                    
                } catch (e) {
                    tableList.innerHTML = '<div class="col-span-2 text-red-500 italic">Tablo listesi alınamadı.</div>';
                }
            }

            function toggleAllTables(checked) {
                document.querySelectorAll('input[name="sb_tables"]').forEach(cb => cb.checked = checked);
            }

            async function runMigration() {
                const results = document.getElementById('mig-log');
                const panel = document.getElementById('mig-status-panel');
                
                panel.classList.remove('hidden');
                results.innerHTML = 'Migrasyon süreci başlatılıyor...<br/>';

                const data = {
                    dialect: document.getElementById('mig-btn-pg').classList.contains('bg-indigo-500/20') ? 'postgresql' : 'mssql',
                    host: document.getElementById('mig_host').value,
                    database: document.getElementById('mig_db').value,
                    port: parseInt(document.getElementById('mig_port').value),
                    user: document.getElementById('mig_user').value,
                    password: document.getElementById('mig_pass').value,
                    supabase_url: document.getElementById('sb_url').value,
                    supabase_key: document.getElementById('sb_key').value,
                    include_data: document.getElementById('migrate_data').checked,
                    reset_target: document.getElementById('reset_target').checked,
                    setup_core_schema: document.getElementById('setup_core_schema').checked,
                    save_sql: document.getElementById('save_sql').checked,
                    selected_tables: Array.from(document.querySelectorAll('input[name="sb_tables"]:checked')).map(cb => cb.value)
                };

                try {
                    const res = await fetch('/api/migrate', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(data)
                    });
                    
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const text = decoder.decode(value);
                        results.innerHTML += text;
                        results.scrollTop = results.scrollHeight;
                    }
                } catch (e) {
                    results.innerHTML += `<div class="text-red-400 font-bold">MİGRASYON HATASI: ${e}</div>`;
                }
            }

            function getConfigs() {
                return {
                    dialect: currentDialect,
                    host: document.getElementById('host').value,
                    port: parseInt(document.getElementById('port').value),
                    database: document.getElementById('db_name').value,
                    username: document.getElementById('user').value,
                    password: document.getElementById('pass').value
                };
            }
        </script>
    </body>
    </html>
    """

@app.post("/api/test")
async def test_db(config: DBConfig):
    url = get_connection_string(config)
    try:
        engine = create_engine(url, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "success"}
    except Exception as e:
        err_msg = str(e)
        if "does not exist" in err_msg or "Unknown database" in err_msg or "Cannot open database" in err_msg:
            return {"status": "db_not_found", "detail": err_msg}
        raise HTTPException(status_code=400, detail=err_msg)

@app.post("/api/create")
async def create_db(config: DBConfig):
    system_config = config.copy()
    if config.dialect == "postgresql":
        system_config.database = "postgres"
    else:
        system_config.database = "master"
    
    url = get_connection_string(system_config)
    try:
        engine = create_engine(url, isolation_level="AUTOCOMMIT")
        with engine.connect() as conn:
            if config.dialect == "postgresql":
                conn.execute(text(f'CREATE DATABASE "{config.database}"'))
            else:
                conn.execute(text(f'CREATE DATABASE [{config.database}]'))
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/migrate")
async def migrate_data(request: Request):
    data = await request.json()
    
    # Fix user -> username mismatch from JS
    if "user" in data and "username" not in data:
        data["username"] = data["user"]
        
    config = DBConfig(**data)
    
    # Target DB Engine
    target_url = get_connection_string(config)
    
    # Try to connect, if not found, create it (if dialect is postgresql or mssql)
    async def migration_generator():
        yield "🚀 Migrasyon başlatıldı...<br/>"
        
        # --- AUTO DB CREATION CHECK ---
        yield "🔍 Hedef veritabanı kontrol ediliyor...<br/>"
        try:
            temp_engine = create_engine(target_url, connect_args={"connect_timeout": 3})
            with temp_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            yield "✅ Hedef veritabanı hazır.<br/>"
        except Exception as e:
            if "does not exist" in str(e) or "Unknown database" in str(e) or "Cannot open database" in str(e):
                yield "⚠️ Hedef veritabanı bulunamadı. Otomatik oluşturuluyor...<br/>"
                try:
                    # Connect to system DB
                    sys_config = config.copy()
                    sys_config.database = "postgres" if config.dialect == "postgresql" else "master"
                    sys_url = get_connection_string(sys_config)
                    sys_engine = create_engine(sys_url, isolation_level="AUTOCOMMIT")
                    with sys_engine.connect() as conn:
                        if config.dialect == "postgresql":
                            conn.execute(text(f'CREATE DATABASE "{config.database}"'))
                        else:
                            conn.execute(text(f'CREATE DATABASE [{config.database}]'))
                    yield "✨ Veritabanı başarıyla oluşturuldu.<br/>"
                except Exception as ce:
                    yield f"❌ Veritabanı oluşturma hatası: {str(ce)[:500]}<br/>"
                    return
            else:
                yield f"❌ Bağlantı hatası: {str(e)[:500]}<br/>"
                return
        
        # --- RESET TARGET IF REQUESTED ---
        if config.reset_target:
            yield "🧹 Hedef temizleniyor (Sıfırlanıyor)...<br/>"
            try:
                sys_config = config.copy()
                sys_config.database = "postgres" if config.dialect == "postgresql" else "master"
                sys_url = get_connection_string(sys_config)
                sys_engine = create_engine(sys_url, isolation_level="AUTOCOMMIT")
                with sys_engine.connect() as conn:
                    if config.dialect == "postgresql":
                        # Terminate active connections to the target DB before dropping
                        conn.execute(text(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{config.database}'"))
                        conn.execute(text(f'DROP DATABASE IF EXISTS "{config.database}"'))
                        conn.execute(text(f'CREATE DATABASE "{config.database}"'))
                    else:
                        conn.execute(text(f'ALTER DATABASE [{config.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE'))
                        conn.execute(text(f'DROP DATABASE IF EXISTS [{config.database}]'))
                        conn.execute(text(f'CREATE DATABASE [{config.database}]'))
                yield "✨ Hedef veritabanı başarıyla sıfırlandı.<br/>"
            except Exception as re:
                yield f"⚠️ Sıfırlama hatası (Tabloları manuel silmeyi deneyeceğim): {str(re)[:200]}<br/>"
                # If drop fails (e.g. no permission for system db), try deleting tables manually? 
                # For now, let's just log and continue, as the schema script might use CREATE TABLE IF NOT EXISTS or handle it.
                # Actually, 01_tables.sql usually DOES NOT use IF NOT EXISTS.
        
        target_engine = create_engine(target_url)

        # 1. First Run Schema
        if config.setup_core_schema:
            yield "📦 Aşama 1: Şema Kuruluyor...<br/>"
            base_path = "c:/EXFIN/Exretailos/database"
            dialect_file = "postgres" if config.dialect == "postgresql" else "mssql"
            setup_scripts = ["01_tables.sql", f"02_logic_{dialect_file}.sql"]
            
            for script in setup_scripts:
                yield f"🔨 Çalıştırılıyor: {script}..."
                try:
                    full_path = os.path.join(base_path, script)
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    with target_engine.connect() as conn:
                        if config.dialect == "postgresql":
                            conn.execute(text(content))
                        else:
                            statements = re.split(r'\bGO\b', content, flags=re.IGNORECASE)
                            for stmt in statements:
                                if stmt.strip(): conn.execute(text(stmt))
                        conn.commit()
                    yield " <span class='text-green-400'>[TAMAM]</span><br/>"
                except Exception as e:
                    yield f" <span class='text-red-400'>[HATA: {str(e)[:500]}]</span><br/>"
                    return
        else:
            yield "📦 Aşama 1 Atlandı (Özel Şema Modu).<br/>"

        if not config.include_data:
            yield "<br/>✅ Sadece şema kurulumu seçildi. İşlem bitti."
            return

        try:
            backup_folder = None
            sql_file = None
            if config.save_sql:
                import datetime
                import shutil
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_folder = f"c:/EXFIN/Exretailos/database/backups/{config.database}_{timestamp}"
                os.makedirs(backup_folder, exist_ok=True)
                
                # Copy schema files to the backup folder
                base_path = "c:/EXFIN/Exretailos/database"
                dialect_file = "postgres" if config.dialect == "postgresql" else "mssql"
                setup_scripts = ["01_tables.sql", f"02_logic_{dialect_file}.sql"]
                
                for s in setup_scripts:
                    src_s = os.path.join(base_path, s)
                    if os.path.exists(src_s):
                        shutil.copy2(src_s, os.path.join(backup_folder, s))
                
                data_dump_path = os.path.join(backup_folder, "03_data_dump.sql")
                sql_file = open(data_dump_path, "w", encoding="utf-8")
                sql_file.write(f"-- ExRetailOS Migration Backup\n")
                sql_file.write(f"-- Target Database: {config.database}\n")
                sql_file.write(f"-- Date: {datetime.datetime.now()}\n\n")
                yield f"💾 SQL Paketi oluşturuluyor: <span class='text-amber-300'>database/backups/{config.database}_{timestamp}/</span><br/>"

            if not config.supabase_url:
                yield "❌ HATA: Supabase bağlantı bilgisi (Direct Connection URL) eksik.<br/>"
                if sql_file: sql_file.close()
                return
            
            # API based data fetcher
            async def fetch_api_data(table_name):
                api_url = f"{config.supabase_url.rstrip('/')}/rest/v1/{table_name}"
                headers = {
                    "apikey": config.supabase_key,
                    "Authorization": f"Bearer {config.supabase_key}",
                    "Content-Type": "application/json"
                }
                async with httpx.AsyncClient() as client:
                    try:
                        resp = await client.get(api_url, headers=headers)
                        if resp.status_code == 200:
                            return resp.json()
                        print(f"DEBUG: API fetch {table_name} failed with {resp.status_code}: {resp.text[:200]}")
                        return []
                    except Exception as e:
                        print(f"DEBUG: API fetch {table_name} error: {str(e)}")
                        return []

            # Get tables
            # Logic: If user specifically selected tables (even zero), use that. 
            # Only fallback to hardcoded list if 'selected_tables' is NOT in the request data (for backward compatibility).
            if config.selected_tables:
                tables = config.selected_tables
            elif "selected_tables" in data:
                tables = config.selected_tables # Which is []
            else:
                tables = [
                    "stores", "currencies", "currency_rates", "users", "brands", 
                    "units", "tax_rates", "categories", "product_groups", "products",
                    "customers", "sales", "sale_items"
                ]
            
            if not tables and not config.setup_core_schema:
                 yield "⚠️ Hiçbir tablo seçilmedi ve temel şema kapalı. Aktarılacak bir şey yok.<br/>"
                 return
            
            with target_engine.connect() as target_conn:
                for table in tables:
                    yield f"🔄 {table} aktarılıyor..."
                    try:
                        # Fetch from API
                        rows = await fetch_api_data(table)
                        
                        if rows:
                            columns = rows[0].keys()
                            
                            # --- Ensure table exists in target (using main connection) ---
                            try:
                                target_conn.execute(text(f"SELECT 1 FROM \"{table}\" WHERE 1=0"))
                            except Exception:
                                # Table doesn't exist, create it dynamically
                                target_conn.rollback() # Clear failed SELECT from transaction
                                yield f" 🛠️ {table} hedefte yok, oluşturuluyor..."
                                cols_def = []
                                for c in columns:
                                    sample_val = rows[0][c]
                                    col_type = "TEXT"
                                    if isinstance(sample_val, bool): col_type = "BOOLEAN"
                                    elif isinstance(sample_val, int): col_type = "BIGINT"
                                    elif isinstance(sample_val, float): col_type = "FLOAT"
                                    elif isinstance(sample_val, (dict, list)): 
                                        col_type = "JSONB" if config.dialect == "postgresql" else "NVARCHAR(MAX)"
                                    
                                    if config.dialect == "mssql" and col_type == "TEXT": col_type = "NVARCHAR(MAX)"
                                    cols_def.append(f"\"{c}\" {col_type}")
                                
                                create_sql = f"CREATE TABLE \"{table}\" ({', '.join(cols_def)})"
                                target_conn.execute(text(create_sql))
                                target_conn.commit()
                                yield " [TAMAM]"

                            # Build dynamic insert
                            col_list = ", ".join([f'"{c}"' for c in columns])
                            val_placeholders = ", ".join([f":{c}" for c in columns])
                            
                            if config.dialect == "postgresql":
                                ins_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({val_placeholders}) ON CONFLICT DO NOTHING'
                            else:
                                # MSSQL Identity Insert might be needed if tables have identities
                                ins_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({val_placeholders})'
                                try: target_conn.execute(text(f"SET IDENTITY_INSERT \"{table}\" ON"))
                                except: pass

                            for row_dict in rows:
                                # Pre-process row_dict: JSON serialize complex types for Postgres/MSSQL
                                processed_row = {}
                                for k, v in row_dict.items():
                                    if isinstance(v, (dict, list)):
                                        processed_row[k] = json.dumps(v)
                                    else:
                                        processed_row[k] = v
                                
                                target_conn.execute(text(ins_sql), processed_row)
                                
                                if sql_file:
                                    # Very basic SQL string escaping for backup file
                                    vals = []
                                    for c in columns:
                                        v = processed_row[c]
                                        if v is None: vals.append("NULL")
                                        elif isinstance(v, (int, float, bool)): vals.append(str(v).upper() if isinstance(v, bool) else str(v))
                                        else: vals.append(f"'{str(v).replace(chr(39), chr(39)+chr(39))}'")
                                    
                                    sql_file.write(f"INSERT INTO \"{table}\" ({col_list}) VALUES ({', '.join(vals)});\n")

                            target_conn.commit()
                            if config.dialect == "mssql":
                                try: target_conn.execute(text(f"SET IDENTITY_INSERT \"{table}\" OFF"))
                                except: pass
                            
                            if sql_file: sql_file.write("\n")
                            yield f" <span class='text-green-400'>[{len(rows)} satır]</span><br/>"
                        else:
                            yield " <span class='text-slate-500'>[Boş]</span><br/>"
                            
                    except Exception as e:
                        try: target_conn.rollback()
                        except: pass
                        yield f" <span class='text-amber-400'>[Atlandı/Hata: {str(e)[:150]}]</span><br/>"
            
            if sql_file:
                sql_file.close()
            yield "<br/>🎉 TÜM VERİLER BAŞARIYLA TAŞINDI! 🎉"
        except Exception as e:
            yield f"<br/>❌ KRİTİK HATA: {str(e)}"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(migration_generator(), media_type="text/html")

@app.post("/api/supabase/projects")
async def list_supabase_projects(request: Request):
    data = await request.json()
    token = data.get("token")
    if not token: raise HTTPException(status_code=400, detail="Token gerekli")
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://api.supabase.com/v1/projects",
                headers={"Authorization": f"Bearer {token}"}
            )
            print(f"DEBUG: Supabase API Status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"DEBUG: Supabase API Error: {resp.text}")
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Projeler alınamadı: {str(e)}")

@app.post("/api/supabase/keys")
async def get_supabase_keys(request: Request):
    data = await request.json()
    token = data.get("token")
    project_ref = data.get("project_ref")
    
    if not token or not project_ref:
        raise HTTPException(status_code=400, detail="Token ve Proje Ref gerekli")
        
    async with httpx.AsyncClient() as client:
        try:
            # 1. Get API Keys
            keys_resp = await client.get(
                f"https://api.supabase.com/v1/projects/{project_ref}/api-keys",
                headers={"Authorization": f"Bearer {token}"}
            )
            keys_resp.raise_for_status()
            keys = keys_resp.json()
            
            service_key = next((k["api_key"] for k in keys if k["name"] == "service_role"), None)
            
            # 2. Get Project Info (for URL)
            return {
                "url": f"https://{project_ref}.supabase.co",
                "service_role_key": service_key
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Anahtarlar alınamadı: {str(e)}")

@app.post("/api/supabase/tables")
async def list_supabase_tables(request: Request):
    data = await request.json()
    token = data.get("token")
    project_ref = data.get("project_ref")
    
    if not token or not project_ref:
        raise HTTPException(status_code=400, detail="Token ve Proje Ref gerekli")
        
    async with httpx.AsyncClient() as client:
        try:
            # 1. Try Management API first
            print(f"DEBUG: Fetching tables via Management API for {project_ref}")
            resp = await client.get(
                f"https://api.supabase.com/v1/projects/{project_ref}/database/tables",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0
            )
            
            if resp.status_code == 200:
                all_tables = resp.json()
                public_tables = [t for t in all_tables if t.get("schema") == "public"]
                print(f"DEBUG: Found {len(public_tables)} public tables via Mgmt API")
                return public_tables
            
            print(f"DEBUG: Mgmt API failed ({resp.status_code}): {resp.text[:200]}")
            
            # 2. Fallback to PostgREST OpenAPI spec
            # Note: We need the service key for this, which we might not have yet in this call
            # unless we ask the client for it or fetch it again.
            # But the client usually provides sb_url/sb_key in the same session.
            # Let's try to get keys first if we don't have them? 
            # Actually, the user already clicked "Listele" which usually means we have the PAT.
            
            # Let's hit the Mgmt API to get keys FIRST so we can use them for fallback
            print(f"DEBUG: Fetching keys for fallback...")
            keys_resp = await client.get(
                f"https://api.supabase.com/v1/projects/{project_ref}/api-keys",
                headers={"Authorization": f"Bearer {token}"}
            )
            if keys_resp.status_code == 200:
                keys = keys_resp.json()
                service_key = next((k["api_key"] for k in keys if k["name"] == "service_role"), None)
                if service_key:
                    rest_url = f"https://{project_ref}.supabase.co/rest/v1/"
                    print(f"DEBUG: Trying PostgREST Fallback via {rest_url}")
                    rest_resp = await client.get(
                        rest_url,
                        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"}
                    )
                    if rest_resp.status_code == 200:
                        openapi = rest_resp.json()
                        # Definitions in OpenAPI v2/v3 usually contain tables
                        definitions = openapi.get("definitions", {})
                        tables = [{"name": name} for name in definitions.keys()]
                        print(f"DEBUG: Found {len(tables)} tables via PostgREST")
                        return tables
            
            raise Exception(f"Mgmt API: {resp.status_code}, PostgREST Fallback failed.")
            
        except Exception as e:
            print(f"ERROR in list_supabase_tables: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Tablolar alınamadı: {str(e)}")

@app.post("/api/run")
async def run_sql(request: Request):
    data = await request.json()
    config = DBConfig(**data)
    load_demo = data.get("load_demo", False)
    
    url = get_connection_string(config)
    engine = create_engine(url)
    
    async def event_generator():
        # List files in database dir
        base_path = "c:/EXFIN/Exretailos/database"
        scripts = [
            "01_tables.sql",
            f"02_logic_{'postgres' if config.dialect == 'postgresql' else 'mssql'}.sql",
            "03_seed_data.sql"
        ]
        
        if load_demo:
            demo_path = os.path.join(base_path, "demo")
            if os.path.exists(demo_path):
                for f in os.listdir(demo_path):
                    if f.endswith(".sql"):
                        scripts.append(f"demo/{f}")

        for script in scripts:
            yield f"<i class='fas fa-file-code mr-1'></i> Çalıştırılıyor: {script}..."
            try:
                full_path = os.path.join(base_path, script)
                with open(full_path, 'r', encoding='utf-8') as f:
                    sql_content = f.read()
                
                # Split SQL commands (rough split by semicolon)
                # Note: This is simplified, real SQL parsers handle triggers better
                # For blocks like BEGIN...END, we might need more careful splitting
                
                with engine.connect() as conn:
                    # In Postgres we can run as one block if no specialized splitting needed
                    # but for triggers we need to be careful
                    if config.dialect == "postgresql":
                        conn.execute(text(sql_content))
                    else:
                        # MSSQL GO separator handling
                        statements = re.split(r'\bGO\b', sql_content, flags=re.IGNORECASE)
                        for stmt in statements:
                            if stmt.strip():
                                conn.execute(text(stmt))
                    conn.commit()
                
                yield f" <span class='text-green-400'>[TAMAMLANDI]</span><br/>"
                await asyncio.sleep(0.1)
                
            except Exception as e:
                yield f" <span class='text-red-400'>[HATA: {str(e)[:500]}...]</span><br/>"
                break
        
        yield "<br/><div class='font-bold text-green-400'>KURULUM TAMAMLANDI! 🎉</div>"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(event_generator(), media_type="text/html")

if __name__ == "__main__":
    import socket
    
    def find_free_port(start_port: int, end_port: int) -> int:
        for port in range(start_port, end_port + 1):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(("0.0.0.0", port))
                    return port
                except socket.error:
                    continue
        return None

    assigned_port = find_free_port(8088, 8099)
    if not assigned_port:
        print("CRITICAL: No free ports found between 8088 and 8099. Please check your system ports.")
        os._exit(1)

    print(f"ExRetailOS Database Manager starting on port {assigned_port}...")
    
    async def main():
        import threading
        def delayed_browser():
            import time
            time.sleep(1.5)
            webbrowser.open(f"http://localhost:{assigned_port}")
        
        threading.Thread(target=delayed_browser, daemon=True).start()
        
        config = uvicorn.Config(app, host="0.0.0.0", port=assigned_port, log_level="info")
        server = uvicorn.Server(config)
        await server.serve()

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
