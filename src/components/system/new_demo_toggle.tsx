<div className="pt-6 border-t border-white/5">
    <label className="flex items-center gap-4 group cursor-pointer">
        <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${loadDemoData ? 'bg-emerald-500' : 'bg-white/10'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-300 ${loadDemoData ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
        <input
            type="checkbox"
            className="hidden"
            checked={loadDemoData}
            onChange={(e) => setLoadDemoData(e.target.checked)}
        />
        <div>
            <div className="text-white font-bold text-sm group-hover:text-emerald-400 transition-colors">Örnek Verileri Yükle (Demo Data)</div>
            <div className="text-[10px] text-slate-500">Sistemi test etmek için örnek ürün ve carilerle doldurur.</div>
        </div>
    </label>
</div>
