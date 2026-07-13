using System;
using System.Collections.Generic;
using System.Globalization;
using System.Windows.Forms;

namespace WindowsFormsApplication1.I18n
{
    /// <summary>
    /// Terazi Yönetici UI dil paketi: tr / en / ar / ku (Kurmanci Latin).
    /// </summary>
    public static class UiLang
    {
        public const string Tr = "tr";
        public const string En = "en";
        public const string Ar = "ar";
        public const string Ku = "ku";

        private static string _code = Tr;
        // Packs alanindan ONCE baslatilamaz — static alan sirasi NullReferenceException uretir (1.0.6 crash).
        private static Dictionary<string, string> _pack;

        public static string Code => _code;
        public static bool IsRtl => string.Equals(_code, Ar, StringComparison.OrdinalIgnoreCase);

        public static readonly string[] Codes = { Tr, En, Ar, Ku };

        static UiLang()
        {
            _pack = Packs[Tr];
        }

        public static string DisplayName(string code)
        {
            switch ((code ?? Tr).Trim().ToLowerInvariant())
            {
                case En: return "English";
                case Ar: return "العربية";
                case Ku: return "Kurdî";
                default: return "Türkçe";
            }
        }

        public static void SetLanguage(string code)
        {
            var c = (code ?? Tr).Trim().ToLowerInvariant();
            if (c != En && c != Ar && c != Ku) c = Tr;
            _code = c;
            _pack = Packs.ContainsKey(c) ? Packs[c] : Packs[Tr];
        }

        public static string T(string key)
        {
            if (string.IsNullOrEmpty(key)) return "";
            string value;
            if (_pack != null && _pack.TryGetValue(key, out value) && value != null) return value;
            if (Packs[Tr].TryGetValue(key, out value) && value != null) return value;
            return key;
        }

        public static string T(string key, params object[] args)
        {
            try
            {
                return string.Format(CultureInfo.InvariantCulture, T(key), args);
            }
            catch
            {
                return T(key);
            }
        }

        public static void ApplyFormDirection(Form form)
        {
            if (form == null) return;
            form.RightToLeft = IsRtl ? RightToLeft.Yes : RightToLeft.No;
            form.RightToLeftLayout = IsRtl;
        }

        public static ComboBox CreateLanguageCombo(ComboBox existing = null)
        {
            var cmb = existing ?? new ComboBox();
            cmb.DropDownStyle = ComboBoxStyle.DropDownList;
            cmb.Items.Clear();
            foreach (var code in Codes)
            {
                cmb.Items.Add(new LangItem(code, DisplayName(code)));
            }
            cmb.DisplayMember = "Name";
            cmb.ValueMember = "Code";
            return cmb;
        }

        public static void SelectLanguageCombo(ComboBox cmb, string code)
        {
            if (cmb == null) return;
            var want = (code ?? Tr).Trim().ToLowerInvariant();
            for (var i = 0; i < cmb.Items.Count; i++)
            {
                var item = cmb.Items[i] as LangItem;
                if (item != null && string.Equals(item.Code, want, StringComparison.OrdinalIgnoreCase))
                {
                    cmb.SelectedIndex = i;
                    return;
                }
            }
            if (cmb.Items.Count > 0) cmb.SelectedIndex = 0;
        }

        public static string GetSelectedLanguage(ComboBox cmb)
        {
            var item = cmb?.SelectedItem as LangItem;
            return item != null ? item.Code : Tr;
        }

        public sealed class LangItem
        {
            public string Code { get; private set; }
            public string Name { get; private set; }
            public LangItem(string code, string name)
            {
                Code = code;
                Name = name;
            }
            public override string ToString() { return Name; }
        }

        private static readonly Dictionary<string, Dictionary<string, string>> Packs =
            new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase)
            {
                { Tr, BuildTr() },
                { En, BuildEn() },
                { Ar, BuildAr() },
                { Ku, BuildKu() },
            };

        private static Dictionary<string, string> BuildTr()
        {
            return new Dictionary<string, string>(StringComparer.Ordinal)
            {
                { "app.title", "RetailEX Terazi Yönetici" },
                { "app.subtitle", "Rongta etiket terazisi · REST API senkronizasyonu" },
                { "app.ready", "Hazır" },
                { "app.notify", "RetailEX Terazi" },
                { "app.statusBar", "RetailEX Terazi · x86 platform · rtslabelscale.dll" },
                { "lang.label", "Dil / Language" },
                { "tab.dashboard", "Kontrol Paneli" },
                { "tab.scales", "Teraziler" },
                { "tab.sync", "Senkronizasyon" },
                { "tab.scaleOps", "Terazi İşlemleri" },
                { "tab.settings", "Ayarlar" },
                { "tab.log", "Uygulama Günlüğü" },
                { "tab.deviceData", "Cihaz Verileri" },
                { "tab.central", "Merkez Durum" },
                { "tab.transferLog", "İşlem Günlüğü" },
                { "dash.scaleWait", "Terazi: Bekleniyor" },
                { "dash.products", "Ürün: —" },
                { "dash.lastSync", "Son senkron: —" },
                { "dash.autoInfo", "RLS1000 (.TXP dosyası + manuel gönder) yerine RetailEX API otomatik PLU gönderir. Windows servisi kurunca PC açıkken arka planda çalışır." },
                { "btn.installService", "Windows Servisi Kur" },
                { "btn.quickSync", "Şimdi Senkronize Et" },
                { "btn.testScale", "Terazi Bağlantısı" },
                { "btn.addScale", "Terazi Ekle" },
                { "btn.removeScale", "Seçili Sil" },
                { "scales.hint", "Birden fazla Rongta terazisi ekleyin. Senkronizasyon tüm aktif terazilere PLU gönderir." },
                { "col.scaleName", "Ad" },
                { "col.scaleIp", "IP Adresi" },
                { "col.scaleEnabled", "Aktif" },
                { "col.scaleLastSync", "Son Senkron" },
                { "col.scaleStatus", "Durum" },
                { "btn.fetchProducts", "RetailEX'ten Çek" },
                { "btn.sendToScale", "Çek ve Terazilere Gönder" },
                { "btn.loadFromDevice", "Cihazdan Veri Al" },
                { "col.plu", "PLU No" },
                { "col.productName", "Ürün Adı" },
                { "col.barcode", "Barkod" },
                { "col.price", "Fiyat" },
                { "col.unit", "Birim" },
                { "col.shelfLife", "Raf Ömrü (gün)" },
                { "scale.select", "İşlem yapılacak terazi" },
                { "btn.connect", "Bağlan" },
                { "btn.getWeight", "Ağırlık Oku" },
                { "btn.clearPlu", "Cihaz Verilerini Boşalt" },
                { "btn.uploadSales", "Satış Verisi Al" },
                { "btn.saleReport", "Günlük Etiket Raporu" },
                { "set.apiUrl", "RetailEX API adresi" },
                { "set.tenant", "Kiracı kodu" },
                { "set.token", "API Token (Bearer)" },
                { "set.productsPath", "Ürün endpoint (PostgREST)" },
                { "set.lfBase", "LF Code tabanı" },
                { "set.syncInterval", "Senkron aralığı (dk)" },
                { "set.authMode", "API kimlik doğrulama" },
                { "set.clearBefore", "Gönderimden önce PLU temizle (tam yenileme)" },
                { "set.sendHotkeys", "Hotkey tablosu gönder (ilk kurulum)" },
                { "set.autoSync", "Otomatik senkron (UI zamanlayıcı)" },
                { "set.syncOnStartup", "Uygulama açılınca hemen senkronize et" },
                { "btn.saveSettings", "Ayarları Kaydet" },
                { "btn.testApi", "API Bağlantısı" },
                { "msg.error", "Hata" },
                { "msg.ok", "Tamam" },
                { "msg.selectScale", "Terazi seçin." },
                { "msg.settingsSaved", "Ayarlar kaydedildi." },
                { "msg.syncOk", "Senkron Tamam" },
                { "msg.syncWarn", "Senkron Uyarı" },
                { "msg.configNeeded", "Yapılandırma gerekli" },
                { "report.title", "Günlük Etiket Raporu - {0}" },
                { "report.from", "Başlangıç" },
                { "report.to", "Bitiş" },
                { "report.today", "Bugün" },
                { "report.all", "Tüm Kayıtlar" },
                { "report.fetch", "Teraziden Al" },
                { "report.includeUnknown", "Bilinmeyen tarihleri dahil et" },
                { "report.hint", "Tarih seçin ve teraziden satış verisi alın." },
            };
        }

        private static Dictionary<string, string> BuildEn()
        {
            return new Dictionary<string, string>(StringComparer.Ordinal)
            {
                { "app.title", "RetailEX Scale Manager" },
                { "app.subtitle", "Rongta label scale · REST API sync" },
                { "app.ready", "Ready" },
                { "app.notify", "RetailEX Scale" },
                { "app.statusBar", "RetailEX Scale · x86 · rtslabelscale.dll" },
                { "lang.label", "Language" },
                { "tab.dashboard", "Dashboard" },
                { "tab.scales", "Scales" },
                { "tab.sync", "Synchronization" },
                { "tab.scaleOps", "Scale Operations" },
                { "tab.settings", "Settings" },
                { "tab.log", "Application Log" },
                { "tab.deviceData", "Device Data" },
                { "tab.central", "Central Status" },
                { "tab.transferLog", "Transfer Log" },
                { "dash.scaleWait", "Scale: Waiting" },
                { "dash.products", "Products: —" },
                { "dash.lastSync", "Last sync: —" },
                { "dash.autoInfo", "RetailEX API sends PLU automatically (instead of RLS1000 .TXP + manual). With Windows service, sync runs in background while PC is on." },
                { "btn.installService", "Install Windows Service" },
                { "btn.quickSync", "Sync Now" },
                { "btn.testScale", "Test Scale" },
                { "btn.addScale", "Add Scale" },
                { "btn.removeScale", "Remove Selected" },
                { "scales.hint", "Add multiple Rongta scales. Sync sends PLU to all active scales." },
                { "col.scaleName", "Name" },
                { "col.scaleIp", "IP Address" },
                { "col.scaleEnabled", "Active" },
                { "col.scaleLastSync", "Last Sync" },
                { "col.scaleStatus", "Status" },
                { "btn.fetchProducts", "Fetch from RetailEX" },
                { "btn.sendToScale", "Fetch & Send to Scales" },
                { "btn.loadFromDevice", "Load from Device" },
                { "col.plu", "PLU No" },
                { "col.productName", "Product Name" },
                { "col.barcode", "Barcode" },
                { "col.price", "Price" },
                { "col.unit", "Unit" },
                { "col.shelfLife", "Shelf Life (days)" },
                { "scale.select", "Scale to operate" },
                { "btn.connect", "Connect" },
                { "btn.getWeight", "Read Weight" },
                { "btn.clearPlu", "Clear Device Data" },
                { "btn.uploadSales", "Get Sales Data" },
                { "btn.saleReport", "Daily Label Report" },
                { "set.apiUrl", "RetailEX API URL" },
                { "set.tenant", "Tenant code" },
                { "set.token", "API Token (Bearer)" },
                { "set.productsPath", "Products endpoint (PostgREST)" },
                { "set.lfBase", "LF Code base" },
                { "set.syncInterval", "Sync interval (min)" },
                { "set.authMode", "API authentication" },
                { "set.clearBefore", "Clear PLU before send (full refresh)" },
                { "set.sendHotkeys", "Send hotkey table (first setup)" },
                { "set.autoSync", "Auto sync (UI timer)" },
                { "set.syncOnStartup", "Sync immediately on startup" },
                { "btn.saveSettings", "Save Settings" },
                { "btn.testApi", "Test API" },
                { "msg.error", "Error" },
                { "msg.ok", "OK" },
                { "msg.selectScale", "Select a scale." },
                { "msg.settingsSaved", "Settings saved." },
                { "msg.syncOk", "Sync Complete" },
                { "msg.syncWarn", "Sync Warning" },
                { "msg.configNeeded", "Configuration required" },
                { "report.title", "Daily Label Report - {0}" },
                { "report.from", "From" },
                { "report.to", "To" },
                { "report.today", "Today" },
                { "report.all", "All Records" },
                { "report.fetch", "Fetch from Scale" },
                { "report.includeUnknown", "Include unknown dates" },
                { "report.hint", "Select dates and fetch sales data from the scale." },
            };
        }

        private static Dictionary<string, string> BuildAr()
        {
            return new Dictionary<string, string>(StringComparer.Ordinal)
            {
                { "app.title", "مدير موازين RetailEX" },
                { "app.subtitle", "ميزان Rongta · مزامنة REST API" },
                { "app.ready", "جاهز" },
                { "app.notify", "RetailEX ميزان" },
                { "app.statusBar", "RetailEX · x86 · rtslabelscale.dll" },
                { "lang.label", "اللغة" },
                { "tab.dashboard", "لوحة التحكم" },
                { "tab.scales", "الموازين" },
                { "tab.sync", "المزامنة" },
                { "tab.scaleOps", "عمليات الميزان" },
                { "tab.settings", "الإعدادات" },
                { "tab.log", "سجل التطبيق" },
                { "tab.deviceData", "بيانات الجهاز" },
                { "tab.central", "حالة المركز" },
                { "tab.transferLog", "سجل النقل" },
                { "dash.scaleWait", "الميزان: في الانتظار" },
                { "dash.products", "المنتجات: —" },
                { "dash.lastSync", "آخر مزامنة: —" },
                { "dash.autoInfo", "يرسل RetailEX API أكواد PLU تلقائياً. مع خدمة Windows يعمل في الخلفية." },
                { "btn.installService", "تثبيت خدمة Windows" },
                { "btn.quickSync", "مزامنة الآن" },
                { "btn.testScale", "اختبار الميزان" },
                { "btn.addScale", "إضافة ميزان" },
                { "btn.removeScale", "حذف المحدد" },
                { "scales.hint", "أضف عدة موازين Rongta. المزامنة ترسل PLU للجميع." },
                { "col.scaleName", "الاسم" },
                { "col.scaleIp", "عنوان IP" },
                { "col.scaleEnabled", "نشط" },
                { "col.scaleLastSync", "آخر مزامنة" },
                { "col.scaleStatus", "الحالة" },
                { "btn.fetchProducts", "جلب من RetailEX" },
                { "btn.sendToScale", "جلب وإرسال للموازين" },
                { "btn.loadFromDevice", "تحميل من الجهاز" },
                { "col.plu", "رقم PLU" },
                { "col.productName", "اسم المنتج" },
                { "col.barcode", "الباركود" },
                { "col.price", "السعر" },
                { "col.unit", "الوحدة" },
                { "col.shelfLife", "مدة الصلاحية (يوم)" },
                { "scale.select", "الميزان للعمل عليه" },
                { "btn.connect", "اتصال" },
                { "btn.getWeight", "قراءة الوزن" },
                { "btn.clearPlu", "مسح بيانات الجهاز" },
                { "btn.uploadSales", "جلب المبيعات" },
                { "btn.saleReport", "تقرير الملصقات اليومي" },
                { "set.apiUrl", "عنوان API" },
                { "set.tenant", "رمز المستأجر" },
                { "set.token", "رمز API (Bearer)" },
                { "set.productsPath", "مسار المنتجات (PostgREST)" },
                { "set.lfBase", "أساس LF Code" },
                { "set.syncInterval", "فترة المزامنة (دقيقة)" },
                { "set.authMode", "مصادقة API" },
                { "set.clearBefore", "مسح PLU قبل الإرسال" },
                { "set.sendHotkeys", "إرسال جدول المفاتيح السريعة" },
                { "set.autoSync", "مزامنة تلقائية" },
                { "set.syncOnStartup", "مزامنة عند التشغيل" },
                { "btn.saveSettings", "حفظ الإعدادات" },
                { "btn.testApi", "اختبار API" },
                { "msg.error", "خطأ" },
                { "msg.ok", "موافق" },
                { "msg.selectScale", "اختر ميزاناً." },
                { "msg.settingsSaved", "تم حفظ الإعدادات." },
                { "msg.syncOk", "اكتملت المزامنة" },
                { "msg.syncWarn", "تحذير المزامنة" },
                { "msg.configNeeded", "التكوين مطلوب" },
                { "report.title", "تقرير الملصقات اليومي - {0}" },
                { "report.from", "من" },
                { "report.to", "إلى" },
                { "report.today", "اليوم" },
                { "report.all", "كل السجلات" },
                { "report.fetch", "جلب من الميزان" },
                { "report.includeUnknown", "تضمين التواريخ غير المعروفة" },
                { "report.hint", "اختر التاريخ واجلب بيانات المبيعات." },
            };
        }

        private static Dictionary<string, string> BuildKu()
        {
            return new Dictionary<string, string>(StringComparer.Ordinal)
            {
                { "app.title", "RetailEX Rêveberê Teraziyê" },
                { "app.subtitle", "Teraziya Rongta · senkrona REST API" },
                { "app.ready", "Amade" },
                { "app.notify", "RetailEX Terazi" },
                { "app.statusBar", "RetailEX Terazi · x86 · rtslabelscale.dll" },
                { "lang.label", "Ziman" },
                { "tab.dashboard", "Panela Kontrolê" },
                { "tab.scales", "Terazî" },
                { "tab.sync", "Senkronîzasyon" },
                { "tab.scaleOps", "Karên Teraziyê" },
                { "tab.settings", "Mîheng" },
                { "tab.log", "Têketina Sepanê" },
                { "tab.deviceData", "Daneyên Cîhazê" },
                { "tab.central", "Rewşa Navendê" },
                { "tab.transferLog", "Têketina Veguhastinê" },
                { "dash.scaleWait", "Terazi: Li bendê" },
                { "dash.products", "Berhem: —" },
                { "dash.lastSync", "Senkrona dawî: —" },
                { "dash.autoInfo", "API ya RetailEX PLU bi xwe dişîne. Bi xizmeta Windows di paşperdeyê de dixebite." },
                { "btn.installService", "Xizmeta Windows saz bike" },
                { "btn.quickSync", "Niha senkron bike" },
                { "btn.testScale", "Girêdana teraziyê" },
                { "btn.addScale", "Terazi zêde bike" },
                { "btn.removeScale", "Hilbijartî jê bibe" },
                { "scales.hint", "Gelek teraziyên Rongta zêde bikin. Senkron PLU digihîne hemûyan." },
                { "col.scaleName", "Nav" },
                { "col.scaleIp", "Navnîşana IP" },
                { "col.scaleEnabled", "Çalak" },
                { "col.scaleLastSync", "Senkrona dawî" },
                { "col.scaleStatus", "Rewş" },
                { "btn.fetchProducts", "Ji RetailEX bîne" },
                { "btn.sendToScale", "Bîne û bişîne teraziyan" },
                { "btn.loadFromDevice", "Ji cîhazê bîne" },
                { "col.plu", "PLU No" },
                { "col.productName", "Navê berhemê" },
                { "col.barcode", "Barkod" },
                { "col.price", "Bihayê" },
                { "col.unit", "Yekîne" },
                { "col.shelfLife", "Jiyana rafê (roj)" },
                { "scale.select", "Teraziya xebatê" },
                { "btn.connect", "Girêde" },
                { "btn.getWeight", "Giraniyê bixwîne" },
                { "btn.clearPlu", "Daneyên cîhazê paqij bike" },
                { "btn.uploadSales", "Daneyên firotanê bîne" },
                { "btn.saleReport", "Rapora etîketê ya rojane" },
                { "set.apiUrl", "Navnîşana API ya RetailEX" },
                { "set.tenant", "Koda kirêdar" },
                { "set.token", "API Token (Bearer)" },
                { "set.productsPath", "Endpointa berheman (PostgREST)" },
                { "set.lfBase", "Bingeha LF Code" },
                { "set.syncInterval", "Navbera senkronê (xq)" },
                { "set.authMode", "Nasnameya API" },
                { "set.clearBefore", "Berî şandinê PLU paqij bike" },
                { "set.sendHotkeys", "Tabloya hotkey bişîne" },
                { "set.autoSync", "Senkrona otomatîk" },
                { "set.syncOnStartup", "Di vekirinê de senkron bike" },
                { "btn.saveSettings", "Mîhengan tomar bike" },
                { "btn.testApi", "Girêdana API" },
                { "msg.error", "Çewtî" },
                { "msg.ok", "Baş e" },
                { "msg.selectScale", "Teraziyekê hilbijêre." },
                { "msg.settingsSaved", "Mîheng hatin tomarkirin." },
                { "msg.syncOk", "Senkron qediya" },
                { "msg.syncWarn", "Hişyariya senkronê" },
                { "msg.configNeeded", "Veavakirin pêwîst e" },
                { "report.title", "Rapora etîketê ya rojane - {0}" },
                { "report.from", "Destpêk" },
                { "report.to", "Dawî" },
                { "report.today", "Îro" },
                { "report.all", "Hemû tomar" },
                { "report.fetch", "Ji teraziyê bîne" },
                { "report.includeUnknown", "Dîrokên nenas jî tev bike" },
                { "report.hint", "Dîrok hilbijêre û daneyên firotanê bîne." },
            };
        }
    }
}
