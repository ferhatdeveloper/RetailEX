#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RetailEX Beauty — A–Z process catalog (TR / EN / AR)."""

from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
W, H = A4

SLATE = HexColor("#0F172A")
SLATE2 = HexColor("#1E293B")
CYAN = HexColor("#06B6D4")
ROSE = HexColor("#E11D48")
BLUSH = HexColor("#FB7185")
MIST = HexColor("#F8FAFC")
INK = HexColor("#334155")
MUTED = HexColor("#64748B")
LINE = HexColor("#E2E8F0")
GOLD = HexColor("#F59E0B")

FONT = "ArialUni"

# ── i18n ───────────────────────────────────────────────────────
L = {
    "tr": {
        "out": "RetailEX-Guzellik-Tanitim-Brosuru.pdf",
        "title_meta": "RetailEX Güzellik — A’dan Z’ye Süreç Kataloğu",
        "catalog_name": "Güzellik Merkezi Süreç Kataloğu",
        "cover_h1": "A’dan Z’ye",
        "cover_h2": "Güzellik Operasyonu",
        "cover_sub": "Lead’den randevuya, seans paketinden kasaya, ankete ve raporlara — tek katalogda tüm süreç.",
        "cover_platforms": "Web  ·  DeskApp  ·  Mobil  ·  Çok dil  ·  Çok şube",
        "cover_brand": "RetailEX Güzellik & Klinik ERP",
        "strip": [
            ("A", "Lead"), ("B", "Randevu"), ("C", "CRM"), ("D", "Hizmet"), ("E", "Tedavi"),
            ("F", "Paket"), ("G", "Kasa"), ("H", "Takip"), ("I", "Anket"), ("J", "Rapor"),
        ],
        "footer_left": "RetailEX Güzellik Merkezi · Süreç Kataloğu",
        "p2_title": "Süreç haritası — A’dan Z’ye",
        "p2_sub": "Güzellik merkezinde uçtan uca operasyon",
        "p2_toc_title": "Bu katalogda neler var?",
        "toc": [
            ("01", "Kapak & yolculuk", "A–J süreç şeridi"),
            ("02", "Süreç haritası", "Genel bakış (bu sayfa)"),
            ("03", "Kazanım & randevu", "Lead, portal, takvim, hatırlatma"),
            ("04", "Müşteri & hizmet", "CRM, tarife, uzman, cihaz"),
            ("05", "Tedavi & paket", "Seans, reçete, sarf, klinik dikeyler"),
            ("06", "Kasa & tahsilat", "POS, peşin/veresiye, ürün satışı"),
            ("07", "Sonrası & yönetim", "Anket, prim, rapor, mobil, şube"),
            ("08", "Ne kazandırır?", "İş değeri özeti"),
        ],
        "p2_foot": "Harita",
        "p3_title": "1 · Kazanım & randevu",
        "p3_sub": "Lead → portal → takvim → hatırlatma",
        "p3_hero": "Boş slot bırakmayan randevu operasyonu",
        "p3_hero_sub": "Online talep · Caller ID · Sürükle-bırak takvim · SMS/WhatsApp",
        "p3_cards": [
            ("A", "Lead hunisi", "WA / IG / telefon / walk-in kaynakları; durumlar; müşteriye dönüştürme."),
            ("B", "Online portal", "7/24 talep formu; klinik onayı; takvime düşme."),
            ("C", "Akıllı takvim", "Gün–ay görünüm; uzman/cihaz; kuyruk; sürükle-bırak."),
            ("D", "Hatırlatma", "SMS & WhatsApp kuyruğu; erteleme; takip araması."),
            ("E", "Seans serisi", "Aylık aynı gün planı; sonraki seans WhatsApp."),
            ("F", "Caller ID", "Arayan ile kart/randevu ön doldurma."),
        ],
        "p3_foot": "Kazanım & Randevu",
        "p4_title": "2 · Müşteri & hizmet",
        "p4_sub": "CRM 360° · tarife · uzman · cihaz",
        "p4_side_title": "Müşteri kartı 360°",
        "p4_bullets": [
            "Dosya no, telefon tekilleştirme",
            "Randevu / ödeme geçmişi",
            "Sağlık: alerji, ilaç, gebelik, KVKK",
            "Lead ve memnuniyet geçmişi",
            "Hasta dosyası yazdırma",
            "Klinik not ve foto arşivi",
        ],
        "p4_cards": [
            ("G", "Hizmet kataloğu", "Kategori (lazer, saç, botoks, spa…), süre, fiyat, takip günü, varsayılan seans. POS ve raporlarla tutarlı tarife."),
            ("H", "Uzman yönetimi", "Profil, renk, aktiflik; hizmet primi % ve ürün birim primi. Performansın temeli."),
            ("I", "Cihaz yönetimi", "Lazer/ünite kartı, randevuya bağlama, kullanım kaydı — kapasite ve çakışma görünür."),
            ("J", "Şube / oda / waitlist", "Çok lokasyon, oda planı, bekleme listesi ve kurumsal/B2B hesap desteği."),
        ],
        "p4_foot": "Müşteri & Hizmet",
        "p5_title": "3 · Tedavi & paket",
        "p5_sub": "Seans · reçete · sarf · klinik dikeyler",
        "p5_hero": "Her seansın maliyeti ve kaydı net",
        "p5_hero_sub": "Paket düşümü · hizmet reçetesi · parti/SKT · uzmanlık ekranları",
        "p5_cards": [
            ("K", "Seans paketleri", "Ön ödemeli paket: fiyat, indirim, geçerlilik. Kalan seans müşteri kartında. Nakit akışı ve sadakat."),
            ("L", "Hizmet reçetesi", "Hizmet başına malzeme/miktar/maliyet. Seans bitince sarf stoktan düşer — gerçek tedavi maliyeti."),
            ("M", "Sarf & parti", "Parti / SKT takibi, sarf tanımı. Klinik stok şeffaflığı."),
            ("N", "Klinik not & onam", "Tedavi notu, hasta foto, onam şablonları. Denetim izi korunur."),
            ("O", "Uzmanlık dikeyleri", "Güzellik + diş (FDI), fizyo, kadın doğum, diyetisyen — aynı ERP kabuğu."),
            ("P", "Tedavi alanları", "Derece / shot gibi seans alanları; personel shot-derece raporuna akar."),
        ],
        "p5_foot": "Tedavi & Paket",
        "p6_title": "4 · Kasa & tahsilat",
        "p6_sub": "Appointment POS · peşin/veresiye · ürün",
        "p6_side_title": "Randevu = kasa",
        "p6_side_body": "Hizmet, paket ve perakende ürün aynı sepet. Stok kontrolü, 80mm fiş, ERP satış/cari/kasa entegrasyonu. Çift kayıt yok.",
        "p6_checks": [
            "Peşin ve veresiye tahsilat",
            "Paket seans düşümü",
            "Ürün satışı + stok",
            "Cari bakiyeye yansıma",
            "İptal / iade izi",
            "Excel randevu-satış import",
        ],
        "p6_steps": [
            ("1", "Sepet", "Hizmet + paket + ürün"),
            ("2", "Ödeme", "Peşin / veresiye / karma"),
            ("3", "Fiş", "80mm yazdırma"),
            ("4", "ERP", "Satış · cari · kasa · stok"),
        ],
        "p6_note": "Giderler: Güzellik kabuğundan ERP gider modülü — gelir-gider aynı dilde.",
        "p6_foot": "Kasa & Tahsilat",
        "p7_title": "5 · Sonrası & yönetim",
        "p7_sub": "Anket · prim · rapor · mobil · entegrasyon",
        "p7_hero": "Seans bitti — ölçüm ve yönetim başlar",
        "p7_hero_sub": "NPS · prim · ciro · iptal · aranmayanlar · mobil saha",
        "p7_cards": [
            ("Q", "Memnuniyet anketi", "TR/EN/AR/KU. Randevu bitince tetiklenir. NPS, trend; düşük puan hızlı takip."),
            ("R", "Prim & performans", "Uzman hizmet/ürün primi; shot-derece raporları. Adil performans yönetimi."),
            ("S", "Rapor seti", "Hizmet cirosu, iptal, randevu ürün satışları, günü geçmiş aranmayanlar, anket özetleri."),
            ("T", "Dashboard KPI", "Günlük randevu, gelir, kasa; bugün/yarın/hafta doluluk. Operasyon nabzı tek ekranda."),
            ("U", "Mobil (Expo)", "Native Android/iOS: randevu, hizmet, uzman, POS, anket — sahada hızlı bakış."),
            ("V", "Entegrasyon & denetim", "Google Calendar vb.; audit log; RBAC; Excel import."),
        ],
        "p7_foot": "Sonrası & Yönetim",
        "p8_title": "Ne kazandırır?",
        "p8_sub": "Güzellik merkezi süreç kataloğunun iş değeri",
        "p8_gains": [
            ("Doluluk", "Online talep + hatırlatma + aranmayanlar → daha az boş slot ve no-show."),
            ("Ciro", "Randevu, paket ve ürün tek kasada; tahsilat ERP’ye akar."),
            ("Sadakat", "Paket seansları + CRM 360° + NPS anketi ile müşteri kalır."),
            ("Maliyet", "Hizmet reçetesi ve sarf ile her tedavinin gerçek maliyeti."),
            ("Hız", "Caller ID, sürükle-bırak takvim, mobil POS — resepsiyon ve saha hızlanır."),
            ("Ölçek", "Çok şube, çok dil, diş–fizyo–KD–diyet dikeyleri — aynı ERP."),
        ],
        "p8_cta": "RetailEX Güzellik ile A’dan Z’ye yönetin",
        "p8_cta_sub": "Demo ve kurulum için iletişime geçin  ·  Web · DeskApp · Mobil",
        "p8_cta_foot": "Güzellik Merkezi Süreç Kataloğu  ·  Sayfa 8 / 8",
    },
    "en": {
        "out": "RetailEX-Beauty-Process-Catalog-EN.pdf",
        "title_meta": "RetailEX Beauty — A to Z Process Catalog",
        "catalog_name": "Beauty Center Process Catalog",
        "cover_h1": "A to Z",
        "cover_h2": "Beauty Operations",
        "cover_sub": "From lead to appointment, session packages to POS, surveys to reports — the full journey in one catalog.",
        "cover_platforms": "Web  ·  DeskApp  ·  Mobile  ·  Multi-language  ·  Multi-branch",
        "cover_brand": "RetailEX Beauty & Clinic ERP",
        "strip": [
            ("A", "Lead"), ("B", "Booking"), ("C", "CRM"), ("D", "Service"), ("E", "Treatment"),
            ("F", "Package"), ("G", "POS"), ("H", "Follow-up"), ("I", "Survey"), ("J", "Report"),
        ],
        "footer_left": "RetailEX Beauty Center · Process Catalog",
        "p2_title": "Process map — A to Z",
        "p2_sub": "End-to-end operations for beauty centers",
        "p2_toc_title": "What’s inside this catalog?",
        "toc": [
            ("01", "Cover & journey", "A–J process strip"),
            ("02", "Process map", "Overview (this page)"),
            ("03", "Acquisition & booking", "Lead, portal, calendar, reminders"),
            ("04", "Customer & services", "CRM, tariffs, specialists, devices"),
            ("05", "Treatment & packages", "Sessions, recipes, consumables, clinical verticals"),
            ("06", "POS & collections", "POS, cash/credit, retail products"),
            ("07", "Aftercare & management", "Surveys, commissions, reports, mobile, branches"),
            ("08", "What you gain", "Business value summary"),
        ],
        "p2_foot": "Map",
        "p3_title": "1 · Acquisition & booking",
        "p3_sub": "Lead → portal → calendar → reminder",
        "p3_hero": "Appointment ops that leave no empty slots",
        "p3_hero_sub": "Online requests · Caller ID · Drag-and-drop calendar · SMS/WhatsApp",
        "p3_cards": [
            ("A", "Lead funnel", "WA / IG / phone / walk-in sources; statuses; convert to customers."),
            ("B", "Online portal", "24/7 request form; clinic approval; lands on the calendar."),
            ("C", "Smart calendar", "Day–month views; specialist/device; queue; drag-and-drop."),
            ("D", "Reminders", "SMS & WhatsApp queue; postpone; follow-up calls."),
            ("E", "Session series", "Same-day monthly plans; next-session WhatsApp."),
            ("F", "Caller ID", "Pre-fill card/appointment from the caller number."),
        ],
        "p3_foot": "Acquisition & Booking",
        "p4_title": "2 · Customer & services",
        "p4_sub": "CRM 360° · tariffs · specialists · devices",
        "p4_side_title": "Customer card 360°",
        "p4_bullets": [
            "File no. & phone deduplication",
            "Appointment / payment history",
            "Health: allergy, meds, pregnancy, privacy",
            "Lead & satisfaction history",
            "Printable patient file",
            "Clinic notes & photo archive",
        ],
        "p4_cards": [
            ("G", "Service catalog", "Categories (laser, hair, Botox, spa…), duration, price, follow-up day, default sessions. Consistent with POS & reports."),
            ("H", "Specialist management", "Profile, color, activity; service commission % and product unit commission. Performance foundation."),
            ("I", "Device management", "Laser/unit cards, link to appointments, usage logs — capacity and conflicts visible."),
            ("J", "Branch / room / waitlist", "Multi-location, room plans, waitlist and corporate/B2B accounts."),
        ],
        "p4_foot": "Customer & Services",
        "p5_title": "3 · Treatment & packages",
        "p5_sub": "Sessions · recipes · consumables · clinical verticals",
        "p5_hero": "Clear cost and record for every session",
        "p5_hero_sub": "Package deduction · service recipes · batch/expiry · specialty screens",
        "p5_cards": [
            ("K", "Session packages", "Prepaid packages: price, discount, validity. Remaining sessions on the card. Cash flow and loyalty."),
            ("L", "Service recipes", "Materials/qty/cost per service. Consumables deduct after session — real treatment cost."),
            ("M", "Consumables & batch", "Batch / expiry tracking. Transparent clinic stock."),
            ("N", "Clinic notes & consent", "Treatment notes, patient photos, consent templates. Audit trail kept."),
            ("O", "Specialty verticals", "Beauty + dental (FDI), physio, OB-GYN, dietitian — same ERP shell."),
            ("P", "Treatment fields", "Degree / shot fields; flow into staff shot-degree reports."),
        ],
        "p5_foot": "Treatment & Packages",
        "p6_title": "4 · POS & collections",
        "p6_sub": "Appointment POS · cash/credit · retail",
        "p6_side_title": "Appointment = checkout",
        "p6_side_body": "Services, packages and retail in one basket. Stock control, 80mm receipt, ERP sales/AR/cash integration. No double entry.",
        "p6_checks": [
            "Cash and credit collection",
            "Package session deduction",
            "Product sales + stock",
            "Posts to account balance",
            "Cancel / return trail",
            "Excel appointment-sales import",
        ],
        "p6_steps": [
            ("1", "Basket", "Service + package + product"),
            ("2", "Payment", "Cash / credit / mixed"),
            ("3", "Receipt", "80mm printing"),
            ("4", "ERP", "Sales · AR · cash · stock"),
        ],
        "p6_note": "Expenses: ERP expense module from the beauty shell — income and costs in one language.",
        "p6_foot": "POS & Collections",
        "p7_title": "5 · Aftercare & management",
        "p7_sub": "Survey · commission · reports · mobile · integrations",
        "p7_hero": "Session done — measurement and management begin",
        "p7_hero_sub": "NPS · commissions · revenue · cancellations · overdue calls · mobile field",
        "p7_cards": [
            ("Q", "Satisfaction survey", "TR/EN/AR/KU. Triggered after appointment. NPS, trends; fast follow-up on low scores."),
            ("R", "Commission & performance", "Specialist service/product commission; shot-degree reports. Fair performance management."),
            ("S", "Report suite", "Service revenue, cancellations, appointment product sales, overdue uncalled list, survey summaries."),
            ("T", "Dashboard KPI", "Daily appointments, revenue, cash; today/tomorrow/week occupancy. Pulse on one screen."),
            ("U", "Mobile (Expo)", "Native Android/iOS: appointments, services, specialists, POS, surveys — fast field view."),
            ("V", "Integrations & audit", "Google Calendar etc.; audit log; RBAC; Excel import."),
        ],
        "p7_foot": "Aftercare & Management",
        "p8_title": "What you gain",
        "p8_sub": "Business value of the beauty process catalog",
        "p8_gains": [
            ("Occupancy", "Online requests + reminders + overdue list → fewer empty slots and no-shows."),
            ("Revenue", "Appointments, packages and products in one POS; collections flow to ERP."),
            ("Loyalty", "Packages + CRM 360° + NPS surveys keep customers returning."),
            ("Cost", "Service recipes and consumables reveal true treatment cost."),
            ("Speed", "Caller ID, drag-and-drop calendar, mobile POS — front desk and field accelerate."),
            ("Scale", "Multi-branch, multi-language, dental–physio–OB–diet verticals — one ERP."),
        ],
        "p8_cta": "Run A to Z with RetailEX Beauty",
        "p8_cta_sub": "Contact us for demo and setup  ·  Web · DeskApp · Mobile",
        "p8_cta_foot": "Beauty Center Process Catalog  ·  Page 8 / 8",
    },
    "ar": {
        "out": "RetailEX-Beauty-Process-Catalog-AR.pdf",
        "title_meta": "RetailEX للتجميل — كتالوج العمليات من الألف إلى الياء",
        "catalog_name": "كتالوج عمليات مركز التجميل",
        "cover_h1": "من الألف إلى الياء",
        "cover_h2": "عمليات مركز التجميل",
        "cover_sub": "من العميل المحتمل إلى الموعد، ومن باقات الجلسات إلى الصندوق، ومن الاستبيان إلى التقارير — الرحلة كاملة في كتالوج واحد.",
        "cover_platforms": "ويب  ·  DeskApp  ·  جوال  ·  متعدد اللغات  ·  متعدد الفروع",
        "cover_brand": "RetailEX تجميل وعيادات ERP",
        "strip": [
            ("A", "عميل"), ("B", "موعد"), ("C", "CRM"), ("D", "خدمة"), ("E", "علاج"),
            ("F", "باقة"), ("G", "صندوق"), ("H", "متابعة"), ("I", "استبيان"), ("J", "تقرير"),
        ],
        "footer_left": "RetailEX مركز التجميل · كتالوج العمليات",
        "p2_title": "خريطة العمليات — من الألف إلى الياء",
        "p2_sub": "تشغيل متكامل لمراكز التجميل",
        "p2_toc_title": "ماذا يحتوي هذا الكتالوج؟",
        "toc": [
            ("01", "الغلاف والمسار", "شريط العمليات A–J"),
            ("02", "خريطة العمليات", "نظرة عامة (هذه الصفحة)"),
            ("03", "الاكتساب والمواعيد", "عملاء محتملون، بوابة، تقويم، تذكير"),
            ("04", "العميل والخدمات", "CRM، تعرفة، أخصائيون، أجهزة"),
            ("05", "العلاج والباقات", "جلسات، وصفات، مستهلكات، تخصصات"),
            ("06", "الصندوق والتحصيل", "نقطة بيع، نقد/آجل، منتجات"),
            ("07", "ما بعد الجلسة والإدارة", "استبيان، عمولات، تقارير، جوال، فروع"),
            ("08", "ماذا تربح؟", "ملخص القيمة للأعمال"),
        ],
        "p2_foot": "الخريطة",
        "p3_title": "1 · الاكتساب والمواعيد",
        "p3_sub": "عميل محتمل → بوابة → تقويم → تذكير",
        "p3_hero": "تشغيل مواعيد بلا فراغات ضائعة",
        "p3_hero_sub": "طلب أونلاين · معرف المتصل · تقويم سحب وإفلات · SMS/واتساب",
        "p3_cards": [
            ("A", "قمع العملاء المحتملين", "مصادر واتساب / إنستغرام / هاتف / زيارة؛ الحالات؛ التحويل لعميل."),
            ("B", "البوابة الإلكترونية", "نموذج طلب على مدار الساعة؛ موافقة العيادة؛ ينزل للتقويم."),
            ("C", "التقويم الذكي", "عرض يوم–شهر؛ أخصائي/جهاز؛ طابور؛ سحب وإفلات."),
            ("D", "التذكير", "طابور SMS وواتساب؛ تأجيل؛ مكالمات متابعة."),
            ("E", "سلسلة الجلسات", "خطة شهرية بنفس اليوم؛ واتساب للجلسة التالية."),
            ("F", "معرف المتصل", "تعبئة مسبقة للبطاقة/الموعد من رقم المتصل."),
        ],
        "p3_foot": "الاكتساب والمواعيد",
        "p4_title": "2 · العميل والخدمات",
        "p4_sub": "CRM 360° · تعرفة · أخصائيون · أجهزة",
        "p4_side_title": "بطاقة العميل 360°",
        "p4_bullets": [
            "رقم ملف وتوحيد الهاتف",
            "سجل المواعيد / المدفوعات",
            "الصحة: حساسية، أدوية، حمل، خصوصية",
            "سجل العملاء المحتملين والرضا",
            "طباعة ملف المريض",
            "ملاحظات العيادة وأرشيف الصور",
        ],
        "p4_cards": [
            ("G", "كتالوج الخدمات", "فئات (ليزر، شعر، بوتوكس، سبا…)، مدة، سعر، يوم متابعة، جلسات افتراضية. متسق مع نقطة البيع والتقارير."),
            ("H", "إدارة الأخصائيين", "ملف، لون، نشاط؛ عمولة خدمة % وعمولة وحدة المنتج. أساس الأداء."),
            ("I", "إدارة الأجهزة", "بطاقات ليزر/وحدة، ربط بالمواعيد، سجل استخدام — السعة والتعارض ظاهران."),
            ("J", "فرع / غرفة / قائمة انتظار", "مواقع متعددة، خطط غرف، قائمة انتظار وحسابات شركات."),
        ],
        "p4_foot": "العميل والخدمات",
        "p5_title": "3 · العلاج والباقات",
        "p5_sub": "جلسات · وصفات · مستهلكات · تخصصات سريرية",
        "p5_hero": "تكلفة وسجل واضح لكل جلسة",
        "p5_hero_sub": "خصم الباقة · وصفة الخدمة · دفعة/صلاحية · شاشات التخصص",
        "p5_cards": [
            ("K", "باقات الجلسات", "باقة مدفوعة مسبقاً: سعر، خصم، صلاحية. الجلسات المتبقية على البطاقة. تدفق نقدي وولاء."),
            ("L", "وصفة الخدمة", "مواد/كمية/تكلفة لكل خدمة. خصم المستهلكات بعد الجلسة — التكلفة الحقيقية."),
            ("M", "المستهلكات والدفعات", "تتبع الدفعة / الصلاحية. مخزون عيادي شفاف."),
            ("N", "ملاحظات وموافقة", "ملاحظات العلاج، صور المريض، قوالب الموافقة. أثر تدقيق محفوظ."),
            ("O", "التخصصات", "تجميل + أسنان (FDI)، علاج طبيعي، نساء وتوليد، تغذية — نفس غلاف ERP."),
            ("P", "حقول العلاج", "حقول درجة / شوط؛ تتدفق لتقارير أداء الموظفين."),
        ],
        "p5_foot": "العلاج والباقات",
        "p6_title": "4 · الصندوق والتحصيل",
        "p6_sub": "نقطة بيع الموعد · نقد/آجل · تجزئة",
        "p6_side_title": "الموعد = الصندوق",
        "p6_side_body": "خدمات وباقات ومنتجات في سلة واحدة. مراقبة مخزون، إيصال 80مم، تكامل مبيعات/ذمم/صندوق. بلا قيد مزدوج.",
        "p6_checks": [
            "تحصيل نقدي وآجل",
            "خصم جلسات الباقة",
            "بيع منتجات + مخزون",
            "ينعكس على رصيد الحساب",
            "أثر إلغاء / إرجاع",
            "استيراد مواعيد-مبيعات Excel",
        ],
        "p6_steps": [
            ("1", "السلة", "خدمة + باقة + منتج"),
            ("2", "الدفع", "نقد / آجل / مختلط"),
            ("3", "الإيصال", "طباعة 80مم"),
            ("4", "ERP", "مبيعات · ذمم · صندوق · مخزون"),
        ],
        "p6_note": "المصروفات: وحدة مصروفات ERP من غلاف التجميل — الإيراد والتكلفة بلغة واحدة.",
        "p6_foot": "الصندوق والتحصيل",
        "p7_title": "5 · ما بعد الجلسة والإدارة",
        "p7_sub": "استبيان · عمولة · تقارير · جوال · تكاملات",
        "p7_hero": "انتهت الجلسة — يبدأ القياس والإدارة",
        "p7_hero_sub": "NPS · عمولات · إيراد · إلغاءات · غير المتصل بهم · الميدان",
        "p7_cards": [
            ("Q", "استبيان الرضا", "TR/EN/AR/KU. يُفعَّل بعد الموعد. NPS واتجاهات؛ متابعة سريعة للدرجات المنخفضة."),
            ("R", "العمولة والأداء", "عمولة خدمة/منتج للأخصائي؛ تقارير الشوط-الدرجة. إدارة أداء عادلة."),
            ("S", "مجموعة التقارير", "إيراد الخدمات، الإلغاءات، مبيعات منتجات الموعد، قائمة غير المتصل بهم، ملخصات الاستبيان."),
            ("T", "مؤشرات لوحة التحكم", "مواعيد يومية، إيراد، صندوق؛ إشغال اليوم/الغد/الأسبوع. نبض التشغيل في شاشة واحدة."),
            ("U", "الجوال (Expo)", "أندرويد/iOS أصلي: مواعيد، خدمات، أخصائيون، نقطة بيع، استبيانات — نظرة ميدانية سريعة."),
            ("V", "التكامل والتدقيق", "تقويم Google وغيرها؛ سجل تدقيق؛ صلاحيات؛ استيراد Excel."),
        ],
        "p7_foot": "ما بعد الجلسة والإدارة",
        "p8_title": "ماذا تربح؟",
        "p8_sub": "قيمة الأعمال من كتالوج عمليات التجميل",
        "p8_gains": [
            ("الإشغال", "طلب أونلاين + تذكير + قائمة غير المتصل بهم → أقل فراغات وغياب."),
            ("الإيراد", "مواعيد وباقات ومنتجات في صندوق واحد؛ التحصيل يتدفق إلى ERP."),
            ("الولاء", "باقات + CRM 360° + استبيان NPS يبقيان العميل."),
            ("التكلفة", "وصفات الخدمة والمستهلكات تُظهر التكلفة الحقيقية للعلاج."),
            ("السرعة", "معرف المتصل، تقويم سحب وإفلات، نقطة بيع جوالة — الاستقبال والميدان أسرع."),
            ("التوسع", "فروع متعددة، لغات متعددة، تخصصات أسنان–علاج طبيعي–نساء–تغذية — ERP واحد."),
        ],
        "p8_cta": "أدِر من الألف إلى الياء مع RetailEX للتجميل",
        "p8_cta_sub": "تواصل معنا للعرض التوضيحي والتثبيت  ·  ويب · DeskApp · جوال",
        "p8_cta_foot": "كتالوج عمليات مركز التجميل  ·  صفحة 8 / 8",
    },
}


def register_font():
    pdfmetrics.registerFont(
        TTFont(FONT, "/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    )


def T(lang, key):
    return L[lang][key]


def tx(lang, text):
    """Prepare string for drawing (Arabic reshape + bidi)."""
    if lang != "ar" or not text:
        return text
    # Keep Latin tokens readable; reshape whole string
    reshaped = arabic_reshaper.reshape(text)
    return get_display(reshaped)


def ir(name):
    return ImageReader(str(ASSETS / name))


def round_rect(c, x, y, w, h, r, fill=None, stroke=None, sw=0.5):
    c.saveState()
    if fill:
        c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(sw)
    p = c.beginPath()
    p.moveTo(x + r, y)
    p.lineTo(x + w - r, y)
    p.arcTo(x + w - 2 * r, y, x + w, y + 2 * r, -90, 90)
    p.lineTo(x + w, y + h - r)
    p.arcTo(x + w - 2 * r, y + h - 2 * r, x + w, y + h, 0, 90)
    p.lineTo(x + r, y + h)
    p.arcTo(x, y + h - 2 * r, x + 2 * r, y + h, 90, 90)
    p.lineTo(x, y + r)
    p.arcTo(x, y, x + 2 * r, y + 2 * r, 180, 90)
    p.close()
    if fill and stroke:
        c.drawPath(p, fill=1, stroke=1)
    elif fill:
        c.drawPath(p, fill=1, stroke=0)
    else:
        c.drawPath(p, fill=0, stroke=1)
    c.restoreState()


def wrap(c, text, size, max_w, lang):
    # For Arabic wrap on spaces after bidi is tricky — wrap logical then reshape each line
    if lang == "ar":
        words = text.split()
        lines, cur = [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            # measure reshaped display width
            disp = tx(lang, trial)
            if c.stringWidth(disp, FONT, size) <= max_w:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines
    words = text.split()
    lines, cur = [], []
    for w in words:
        trial = (" ".join(cur + [w])).strip()
        if c.stringWidth(trial, FONT, size) <= max_w:
            cur.append(w)
        else:
            if cur:
                lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return lines


def draw_str(c, lang, text, x, y, size, color=INK, align="left", max_w=None):
    c.setFillColor(color)
    c.setFont(FONT, size)
    s = tx(lang, text)
    if align == "right" or (lang == "ar" and align == "auto"):
        c.drawRightString(x, y, s)
    elif align == "center":
        c.drawCentredString(x, y, s)
    else:
        c.drawString(x, y, s)


def para(c, lang, text, x, y, size, max_w, leading, color=INK, rtl=None):
    rtl = (lang == "ar") if rtl is None else rtl
    c.setFillColor(color)
    c.setFont(FONT, size)
    for line in wrap(c, text, size, max_w, lang):
        s = tx(lang, line)
        if rtl:
            c.drawRightString(x + max_w, y, s)
        else:
            c.drawString(x, y, s)
        y -= leading
    return y


def clip_img(c, name, x, y, w, h, r=3 * mm):
    c.saveState()
    p = c.beginPath()
    p.moveTo(x + r, y)
    p.lineTo(x + w - r, y)
    p.arcTo(x + w - 2 * r, y, x + w, y + 2 * r, -90, 90)
    p.lineTo(x + w, y + h - r)
    p.arcTo(x + w - 2 * r, y + h - 2 * r, x + w, y + h, 0, 90)
    p.lineTo(x + r, y + h)
    p.arcTo(x, y + h - 2 * r, x + 2 * r, y + h, 90, 90)
    p.lineTo(x, y + r)
    p.arcTo(x, y, x + 2 * r, y + 2 * r, 180, 90)
    p.close()
    c.clipPath(p, stroke=0)
    c.drawImage(ir(name), x, y, width=w, height=h, preserveAspectRatio=True, anchor="c", mask="auto")
    c.restoreState()


def footer(c, lang, page, total, label):
    c.setFillColor(LINE)
    c.rect(14 * mm, 8 * mm, W - 28 * mm, 0.3, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont(FONT, 7)
    left = tx(lang, T(lang, "footer_left"))
    right = tx(lang, f"{label}  ·  {page} / {total}")
    if lang == "ar":
        c.drawRightString(W - 14 * mm, 4 * mm, left)
        c.drawString(14 * mm, 4 * mm, right)
    else:
        c.drawString(14 * mm, 4 * mm, left)
        c.drawRightString(W - 14 * mm, 4 * mm, right)


def page_header(c, lang, title, subtitle, accent=CYAN):
    c.setFillColor(SLATE)
    c.rect(0, H - 22 * mm, W, 22 * mm, fill=1, stroke=0)
    c.setFillColor(accent)
    c.rect(0, H - 22 * mm, W, 2 * mm, fill=1, stroke=0)
    c.setFillColor(CYAN)
    c.setFont(FONT, 8)
    c.drawString(14 * mm, H - 9 * mm, "RX  ·  RetailEX")
    if lang == "ar":
        draw_str(c, lang, title, W - 14 * mm, H - 16 * mm, 12, white, "right")
        draw_str(c, lang, subtitle, 14 * mm, H - 14 * mm, 7, HexColor("#94A3B8"), "left")
    else:
        draw_str(c, lang, title, 14 * mm, H - 16 * mm, 13, white, "left")
        draw_str(c, lang, subtitle, W - 14 * mm, H - 14 * mm, 7.5, HexColor("#94A3B8"), "right")


def step_badge(c, x, y, letter, fill=CYAN):
    round_rect(c, x, y, 9 * mm, 9 * mm, 2 * mm, fill=fill)
    c.setFillColor(white)
    c.setFont(FONT, 10)
    c.drawCentredString(x + 4.5 * mm, y + 2.8 * mm, letter)


def process_card(c, lang, x, y, w, h, letter, title, body, accent=CYAN):
    round_rect(c, x, y, w, h, 2.5 * mm, fill=white, stroke=LINE, sw=0.7)
    if lang == "ar":
        step_badge(c, x + w - 12 * mm, y + h - 12 * mm, letter, accent)
        draw_str(c, lang, title, x + w - 15 * mm, y + h - 9 * mm, 9, SLATE, "right")
        para(c, lang, body, x + 3.5 * mm, y + h - 16 * mm, 7, w - 7 * mm, 3.3 * mm, MUTED)
    else:
        step_badge(c, x + 3 * mm, y + h - 12 * mm, letter, accent)
        draw_str(c, lang, title, x + 15 * mm, y + h - 9 * mm, 9, SLATE, "left")
        para(c, lang, body, x + 3.5 * mm, y + h - 16 * mm, 7, w - 7 * mm, 3.3 * mm, MUTED)


def page_cover(c, lang):
    t = L[lang]
    c.setFillColor(SLATE)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.drawImage(ir("catalog-cover.jpg"), 0, 55 * mm, width=W, height=H - 55 * mm, preserveAspectRatio=True, anchor="c", mask="auto")
    c.setFillColor(Color(0.06, 0.09, 0.16, alpha=0.55))
    c.rect(0, 55 * mm, W, 55 * mm, fill=1, stroke=0)
    c.setFillColor(Color(0.06, 0.09, 0.16, alpha=0.25))
    c.rect(0, 110 * mm, W, 40 * mm, fill=1, stroke=0)

    round_rect(c, 16 * mm, H - 24 * mm, 14 * mm, 14 * mm, 3 * mm, fill=SLATE, stroke=CYAN, sw=1.2)
    c.setFillColor(CYAN)
    c.setFont(FONT, 11)
    c.drawCentredString(23 * mm, H - 18.5 * mm, "RX")
    c.setFillColor(white)
    c.setFont(FONT, 11)
    c.drawString(34 * mm, H - 15 * mm, "RetailEX")
    draw_str(c, lang, t["catalog_name"], 34 * mm, H - 20.5 * mm, 8, BLUSH, "left")

    if lang == "ar":
        draw_str(c, lang, t["cover_h1"], W - 16 * mm, 95 * mm, 22, white, "right")
        draw_str(c, lang, t["cover_h2"], W - 16 * mm, 83 * mm, 20, white, "right")
        para(c, lang, t["cover_sub"], 16 * mm, 72 * mm, 9, W - 40 * mm, 4.5 * mm, CYAN)
    else:
        draw_str(c, lang, t["cover_h1"], 16 * mm, 95 * mm, 26, white, "left")
        draw_str(c, lang, t["cover_h2"], 16 * mm, 83 * mm, 24, white, "left")
        para(c, lang, t["cover_sub"], 16 * mm, 72 * mm, 9, W - 40 * mm, 4.5 * mm, CYAN)

    c.setFillColor(SLATE2)
    c.rect(0, 0, W, 55 * mm, fill=1, stroke=0)
    c.setFillColor(CYAN)
    c.rect(0, 55 * mm - 1.5, W, 1.5, fill=1, stroke=0)

    steps = t["strip"]
    gap = 2.2 * mm
    box = (W - 28 * mm - 9 * gap) / 10
    for i, (let, name) in enumerate(steps):
        x = 14 * mm + i * (box + gap)
        round_rect(c, x, 22 * mm, box, 22 * mm, 2 * mm, fill=SLATE)
        c.setFillColor(CYAN if i % 2 == 0 else BLUSH)
        c.setFont(FONT, 11)
        c.drawCentredString(x + box / 2, 34 * mm, let)
        c.setFillColor(HexColor("#94A3B8"))
        c.setFont(FONT, 5)
        s = tx(lang, name)
        nw = c.stringWidth(s, FONT, 5)
        c.drawString(x + (box - nw) / 2, 26 * mm, s)

    draw_str(c, lang, t["cover_platforms"], W / 2, 10 * mm, 7, MUTED, "center")
    draw_str(c, lang, t["cover_brand"], W / 2, 4 * mm, 6, HexColor("#475569"), "center")


def page_map(c, lang):
    t = L[lang]
    c.setFillColor(MIST)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, lang, t["p2_title"], t["p2_sub"], ROSE)
    clip_img(c, "catalog-journey.png", 14 * mm, H - 78 * mm, W - 28 * mm, 48 * mm, 3 * mm)

    if lang == "ar":
        draw_str(c, lang, t["p2_toc_title"], W - 14 * mm, H - 88 * mm, 11, SLATE, "right")
    else:
        draw_str(c, lang, t["p2_toc_title"], 14 * mm, H - 88 * mm, 11, SLATE, "left")

    y = H - 98 * mm
    for num, title, desc in t["toc"]:
        round_rect(c, 14 * mm, y - 2 * mm, W - 28 * mm, 11 * mm, 2 * mm, fill=white, stroke=LINE, sw=0.5)
        if lang == "ar":
            draw_str(c, lang, num, W - 18 * mm, y + 1.5 * mm, 9, CYAN, "right")
            draw_str(c, lang, title, W - 32 * mm, y + 1.5 * mm, 9, SLATE, "right")
            draw_str(c, lang, desc, 18 * mm, y + 1.5 * mm, 7.5, MUTED, "left")
        else:
            draw_str(c, lang, num, 18 * mm, y + 1.5 * mm, 9, CYAN, "left")
            draw_str(c, lang, title, 32 * mm, y + 1.5 * mm, 9, SLATE, "left")
            draw_str(c, lang, desc, W - 18 * mm, y + 1.5 * mm, 7.5, MUTED, "right")
        y -= 13 * mm
    footer(c, lang, 2, 8, t["p2_foot"])


def page_acquisition(c, lang):
    t = L[lang]
    c.setFillColor(MIST)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, lang, t["p3_title"], t["p3_sub"], CYAN)
    clip_img(c, "catalog-reception.jpg", 14 * mm, H - 72 * mm, W - 28 * mm, 42 * mm, 3 * mm)
    c.setFillColor(Color(0.06, 0.09, 0.16, alpha=0.5))
    c.rect(14 * mm, H - 72 * mm, W - 28 * mm, 42 * mm, fill=1, stroke=0)
    if lang == "ar":
        draw_str(c, lang, t["p3_hero"], W - 20 * mm, H - 42 * mm, 12, white, "right")
        draw_str(c, lang, t["p3_hero_sub"], W - 20 * mm, H - 50 * mm, 8, CYAN, "right")
    else:
        draw_str(c, lang, t["p3_hero"], 20 * mm, H - 42 * mm, 13, white, "left")
        draw_str(c, lang, t["p3_hero_sub"], 20 * mm, H - 50 * mm, 8, CYAN, "left")

    y0 = H - 82 * mm
    cw = (W - 28 * mm - 3 * mm) / 2
    ch = 28 * mm
    for i, (let, title, body) in enumerate(t["p3_cards"]):
        col, row = i % 2, i // 2
        x = 14 * mm + col * (cw + 3 * mm)
        y = y0 - (row + 1) * (ch + 2.5 * mm)
        process_card(c, lang, x, y, cw, ch, let, title, body, CYAN if i % 2 == 0 else ROSE)
    footer(c, lang, 3, 8, t["p3_foot"])


def page_crm(c, lang):
    t = L[lang]
    c.setFillColor(MIST)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, lang, t["p4_title"], t["p4_sub"], ROSE)
    left_w = 78 * mm
    clip_img(c, "beauty-clinic-care.png", 14 * mm, H - 100 * mm, left_w, 70 * mm, 3 * mm)

    sx = 14 * mm + left_w + 6 * mm
    if lang == "ar":
        draw_str(c, lang, t["p4_side_title"], W - 14 * mm, H - 32 * mm, 11, SLATE, "right")
        y = H - 40 * mm
        for b in t["p4_bullets"]:
            c.setFillColor(CYAN)
            c.circle(W - 18 * mm, y + 1.2 * mm, 1.2 * mm, fill=1, stroke=0)
            draw_str(c, lang, b, W - 22 * mm, y, 8, INK, "right")
            y -= 7 * mm
    else:
        draw_str(c, lang, t["p4_side_title"], sx, H - 32 * mm, 11, SLATE, "left")
        y = H - 40 * mm
        for b in t["p4_bullets"]:
            c.setFillColor(CYAN)
            c.circle(sx + 3 * mm, y + 1.2 * mm, 1.2 * mm, fill=1, stroke=0)
            draw_str(c, lang, b, sx + 7 * mm, y, 8, INK, "left")
            y -= 7 * mm

    y0 = H - 112 * mm
    cw = (W - 28 * mm - 3 * mm) / 2
    for i, (let, title, body) in enumerate(t["p4_cards"]):
        col, row = i % 2, i // 2
        x = 14 * mm + col * (cw + 3 * mm)
        y = y0 - (row + 1) * (34 * mm)
        process_card(c, lang, x, y, cw, 32 * mm, let, title, body, ROSE if col else CYAN)
    footer(c, lang, 4, 8, t["p4_foot"])


def page_treatment(c, lang):
    t = L[lang]
    c.setFillColor(MIST)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, lang, t["p5_title"], t["p5_sub"], CYAN)
    clip_img(c, "catalog-treatment.jpg", 14 * mm, H - 72 * mm, W - 28 * mm, 42 * mm, 3 * mm)
    c.setFillColor(Color(0.06, 0.09, 0.16, alpha=0.48))
    c.rect(14 * mm, H - 72 * mm, W - 28 * mm, 42 * mm, fill=1, stroke=0)
    if lang == "ar":
        draw_str(c, lang, t["p5_hero"], W - 20 * mm, H - 42 * mm, 12, white, "right")
        draw_str(c, lang, t["p5_hero_sub"], W - 20 * mm, H - 50 * mm, 8, CYAN, "right")
    else:
        draw_str(c, lang, t["p5_hero"], 20 * mm, H - 42 * mm, 13, white, "left")
        draw_str(c, lang, t["p5_hero_sub"], 20 * mm, H - 50 * mm, 8, CYAN, "left")

    y0 = H - 82 * mm
    cw = (W - 28 * mm - 3 * mm) / 2
    ch = 28 * mm
    for i, (let, title, body) in enumerate(t["p5_cards"]):
        col, row = i % 2, i // 2
        x = 14 * mm + col * (cw + 3 * mm)
        y = y0 - (row + 1) * (ch + 2.5 * mm)
        process_card(c, lang, x, y, cw, ch, let, title, body, CYAN if i % 2 == 0 else ROSE)
    footer(c, lang, 5, 8, t["p5_foot"])


def page_pos(c, lang):
    t = L[lang]
    c.setFillColor(MIST)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, lang, t["p6_title"], t["p6_sub"], GOLD)
    clip_img(c, "catalog-payment.jpg", 14 * mm, H - 95 * mm, 85 * mm, 65 * mm, 3 * mm)

    if lang == "ar":
        draw_str(c, lang, t["p6_side_title"], W - 14 * mm, H - 32 * mm, 12, SLATE, "right")
        para(c, lang, t["p6_side_body"], 106 * mm, H - 40 * mm, 8, W - 120 * mm, 3.8 * mm, MUTED)
    else:
        draw_str(c, lang, t["p6_side_title"], 106 * mm, H - 32 * mm, 12, SLATE, "left")
        para(c, lang, t["p6_side_body"], 106 * mm, H - 40 * mm, 8, W - 120 * mm, 3.8 * mm, MUTED)

    y = H - 72 * mm
    for ch_txt in t["p6_checks"]:
        round_rect(c, 106 * mm, y, W - 120 * mm, 7 * mm, 1.5 * mm, fill=white, stroke=LINE, sw=0.4)
        if lang == "ar":
            draw_str(c, lang, "✓  " + ch_txt, W - 18 * mm, y + 2 * mm, 7.5, CYAN, "right")
        else:
            draw_str(c, lang, "✓  " + ch_txt, 109 * mm, y + 2 * mm, 8, CYAN, "left")
        y -= 8.5 * mm

    y = 28 * mm
    sw = (W - 28 * mm - 9 * mm) / 4
    for i, (n, title, desc) in enumerate(t["p6_steps"]):
        x = 14 * mm + i * (sw + 3 * mm)
        round_rect(c, x, y, sw, 28 * mm, 2.5 * mm, fill=SLATE)
        c.setFillColor(CYAN)
        c.setFont(FONT, 14)
        c.drawCentredString(x + sw / 2, y + 18 * mm, n)
        draw_str(c, lang, title, x + sw / 2, y + 10 * mm, 9, white, "center")
        draw_str(c, lang, desc, x + sw / 2, y + 4 * mm, 6, HexColor("#94A3B8"), "center")

    draw_str(c, lang, t["p6_note"], 14 * mm if lang != "ar" else W - 14 * mm, 20 * mm, 7, MUTED, "right" if lang == "ar" else "left")
    footer(c, lang, 6, 8, t["p6_foot"])


def page_aftercare(c, lang):
    t = L[lang]
    c.setFillColor(MIST)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    page_header(c, lang, t["p7_title"], t["p7_sub"], CYAN)
    clip_img(c, "catalog-analytics.jpg", 14 * mm, H - 68 * mm, W - 28 * mm, 38 * mm, 3 * mm)
    c.setFillColor(Color(0.06, 0.09, 0.16, alpha=0.5))
    c.rect(14 * mm, H - 68 * mm, W - 28 * mm, 38 * mm, fill=1, stroke=0)
    if lang == "ar":
        draw_str(c, lang, t["p7_hero"], W - 20 * mm, H - 42 * mm, 11, white, "right")
        draw_str(c, lang, t["p7_hero_sub"], W - 20 * mm, H - 50 * mm, 8, CYAN, "right")
    else:
        draw_str(c, lang, t["p7_hero"], 20 * mm, H - 42 * mm, 12, white, "left")
        draw_str(c, lang, t["p7_hero_sub"], 20 * mm, H - 50 * mm, 8, CYAN, "left")

    y0 = H - 78 * mm
    cw = (W - 28 * mm - 3 * mm) / 2
    ch = 28 * mm
    for i, (let, title, body) in enumerate(t["p7_cards"]):
        col, row = i % 2, i // 2
        x = 14 * mm + col * (cw + 3 * mm)
        y = y0 - (row + 1) * (ch + 2.5 * mm)
        process_card(c, lang, x, y, cw, ch, let, title, body, CYAN if i % 2 == 0 else ROSE)
    footer(c, lang, 7, 8, t["p7_foot"])


def page_value(c, lang):
    t = L[lang]
    c.setFillColor(SLATE)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(CYAN)
    c.rect(0, H - 3 * mm, W, 3 * mm, fill=1, stroke=0)

    if lang == "ar":
        draw_str(c, lang, t["p8_title"], W - 16 * mm, H - 22 * mm, 16, white, "right")
        draw_str(c, lang, t["p8_sub"], W - 16 * mm, H - 30 * mm, 9, HexColor("#94A3B8"), "right")
    else:
        draw_str(c, lang, t["p8_title"], 16 * mm, H - 22 * mm, 18, white, "left")
        draw_str(c, lang, t["p8_sub"], 16 * mm, H - 30 * mm, 9, HexColor("#94A3B8"), "left")

    clip_img(c, "beauty-dashboard.png", 14 * mm, H - 78 * mm, W - 28 * mm, 40 * mm, 3 * mm)

    y0 = H - 88 * mm
    cw = (W - 28 * mm - 3 * mm) / 2
    for i, (title, body) in enumerate(t["p8_gains"]):
        col, row = i % 2, i // 2
        x = 14 * mm + col * (cw + 3 * mm)
        y = y0 - (row + 1) * (24 * mm)
        round_rect(c, x, y, cw, 22 * mm, 2.5 * mm, fill=SLATE2, stroke=HexColor("#334155"), sw=0.5)
        if lang == "ar":
            draw_str(c, lang, title, x + cw - 4 * mm, y + 14 * mm, 10, CYAN if col == 0 else BLUSH, "right")
            para(c, lang, body, x + 4 * mm, y + 8 * mm, 7, cw - 8 * mm, 3.2 * mm, HexColor("#94A3B8"))
        else:
            draw_str(c, lang, title, x + 4 * mm, y + 14 * mm, 10, CYAN if col == 0 else BLUSH, "left")
            para(c, lang, body, x + 4 * mm, y + 8 * mm, 7, cw - 8 * mm, 3.2 * mm, HexColor("#94A3B8"))

    round_rect(c, 14 * mm, 14 * mm, W - 28 * mm, 28 * mm, 3 * mm, fill=CYAN)
    if lang == "ar":
        draw_str(c, lang, t["p8_cta"], W - 22 * mm, 30 * mm, 11, SLATE, "right")
        draw_str(c, lang, t["p8_cta_sub"], W - 22 * mm, 22 * mm, 8, SLATE, "right")
        draw_str(c, lang, t["p8_cta_foot"], W - 22 * mm, 16 * mm, 7, SLATE2, "right")
    else:
        draw_str(c, lang, t["p8_cta"], 22 * mm, 30 * mm, 12, SLATE, "left")
        draw_str(c, lang, t["p8_cta_sub"], 22 * mm, 22 * mm, 8, SLATE, "left")
        draw_str(c, lang, t["p8_cta_foot"], 22 * mm, 16 * mm, 7, SLATE2, "left")


def build(lang: str):
    t = L[lang]
    out = ROOT / t["out"]
    c = canvas.Canvas(str(out), pagesize=A4)
    c.setTitle(t["title_meta"])
    c.setAuthor("RetailEX")
    c.setSubject(t["catalog_name"])

    page_cover(c, lang)
    c.showPage()
    page_map(c, lang)
    c.showPage()
    page_acquisition(c, lang)
    c.showPage()
    page_crm(c, lang)
    c.showPage()
    page_treatment(c, lang)
    c.showPage()
    page_pos(c, lang)
    c.showPage()
    page_aftercare(c, lang)
    c.showPage()
    page_value(c, lang)
    c.save()
    return out


def main():
    register_font()
    required = [
        "catalog-cover.jpg",
        "catalog-journey.png",
        "catalog-reception.jpg",
        "catalog-treatment.jpg",
        "catalog-payment.jpg",
        "catalog-analytics.jpg",
        "beauty-clinic-care.png",
        "beauty-dashboard.png",
    ]
    missing = [n for n in required if not (ASSETS / n).exists()]
    if missing:
        raise SystemExit(f"Missing assets: {missing}")

    for lang in ("tr", "en", "ar"):
        path = build(lang)
        print(path)


if __name__ == "__main__":
    main()
