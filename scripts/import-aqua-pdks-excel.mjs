#!/usr/bin/env node
/**
 * Aqua Beauty PDKS Excel Import — HTML-disguised .xls (10 kişi × 30 gün)
 * -----------------------------------------------------------------------------
 *  Kaynak: AsinERP/PDKS "ALL DATA" raporu (HTML-disguised .xls):
 *          - 20 kolon: #, Person ID, Name, Status, Timetable,
 *                      Timetable2, Timetable3, Status (8 kod), Work Time,
 *                      Records, Early, Leave, [Days 1..30]
 *                      (Excel içinde 1..30 arası kolonlar hücre formundadır)
 *          - 10 kişi × 30 gün (Eylül 2026) → 300 attendance satırı
 *          - Person ID'ler: 1..8, 10, 11  (ID=9 YOK — kasıtlı atlanmış)
 *          - Status kodu → durum eşlemesi HTML header'ından okunur
 *
 *  Hedef: public.staff + public.staff_attendance (migration 185)
 *         - staff: UNIQUE (firm_nr, excel_pdks_id) UPSERT
 *         - attendance: UNIQUE (firm_nr, period_nr, staff_id, attendance_date) UPSERT
 *
 *  Kullanım:
 *    node scripts/import-aqua-pdks-excel.mjs --dry-run \
 *      --file "/path/to/ALL DATA 09.xls" --period 2026-09 --firm 001
 *
 *    node scripts/import-aqua-pdks-excel.mjs --commit \
 *      --file "/path/to/ALL DATA 09.xls" --period 2026-09 --firm 001
 *
 *  Bağımlılık:  `pg` (npm), `node --version >= 18`
 *  Ortam değişkenleri (commit modu için):
 *    PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
 *    veya DATABASE_URL
 *
 *  NOTLAR:
 *    - HTML-disguised .xls bir Excel'in "Save As Web Page" çıktısıdır; <table>
 *      içerir. Standart Excel kütüphaneleri (xlsx) bu dosyayı açmaz, bu yüzden
 *      elle HTML parse yapıyoruz.
 *    - "Records" (ham giriş/çıkış) ve "Early" (erken çıkış) ve "Leave" kolonları
 *      SKIP edilir — planlanan saat `scheduled_start/end` + `staff_shifts`
 *      üzerinden hesaplanır.
 *    - Muhasebe: base_salary bu turda 0 bırakılır (HR ayrı turda tetiklenecek).
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { mode: 'dry-run', file: null, period: null, firm: '001', log: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') out.mode = 'commit';
    else if (a === '--dry-run') out.mode = 'dry-run';
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--period') out.period = argv[++i];
    else if (a === '--firm') out.firm = argv[++i];
    else if (a === '--log') out.log = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log(`
PDKS Aqua Beauty Excel Import

Kullanım:
  node scripts/import-aqua-pdks-excel.mjs --dry-run --file <xls> --period 2026-09 [--firm 001]
  node scripts/import-aqua-pdks-excel.mjs --commit  --file <xls> --period 2026-09 [--firm 001] [--log import-log.txt]

Seçenekler:
  --dry-run        DB yazmadan parse eder (varsayılan).
  --commit         DB'ye yazar (staff + staff_attendance UPSERT).
  --file <path>    HTML-disguised .xls dosya yolu.
  --period <YYYY-MM>  İşlem dönemi (örn. 2026-09). period_nr otomatik '09'.
  --firm <NN>      Firma kodu (varsayılan '001').
  --log <path>     --commit modunda log dosyası (varsayılan: import-log.txt).
  -h, --help       Bu yardım.
`);
      process.exit(0);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML parser — sadece <table> / <tr> / <td|th> üzerinden çalışır; dış kütüphane
// bağımlılığı yok; cheerio / htmlparser2 gerekmez.
// ---------------------------------------------------------------------------
function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
             .replace(/<style[\s\S]*?<\/style>/gi, '');
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function extractDailyReport(html) {
  const stripped = stripScripts(html);
  // Bu Excel raporunda asıl veri Daily_Report tablosunda (10 kişi × 30 gün =
  // 300 satır). Non-greedy eşleşme nested tablo içinde en içteki </table>'a
  // yapışıyor; bu yüzden <table class="Daily_Report"> açılışından itibaren
  // manuel olarak kapanış sayacıyla ilerliyoruz.
  const startMatch = stripped.match(/<table\b[^>]*class="Daily_Report"[^>]*>/i);
  if (!startMatch) throw new Error('Daily_Report tablosu bulunamadı.');
  const start = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = start;
  while (i < stripped.length && depth > 0) {
    const open = stripped.slice(i).match(/<table\b[^>]*>/i);
    const close = stripped.slice(i).match(/<\/table>/i);
    if (!close) break;
    if (open && open.index < close.index) {
      depth++;
      i += open.index + open[0].length;
    } else {
      depth--;
      i += close.index + close[0].length;
    }
  }
  return stripped.slice(startMatch.index, i);
}

function parseTable(tableHtml) {
  const rows = [];
  // Excel "Save As Web Page" çıktısında <tr ...> etiketleri sıkça eksik, ama
  // </tr> kapanışları tam. Bu yüzden </tr> ile split edip, aralardaki <td>'leri
  // topluyoruz.
  const blocks = tableHtml.split(/<\/tr>/i);
  for (const block of blocks) {
    if (!/<td\b/i.test(block)) continue;
    const cells = [];
    const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cMatch;
    while ((cMatch = cellRegex.exec(block)) !== null) {
      const raw = cMatch[1].replace(/<[^>]+>/g, '');
      cells.push(decodeEntities(raw).replace(/\s+/g, ' ').trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Header → kolon indeksi haritası (Excel'in ilk ~10 satırı metadata + header).
// Excel header'ında "Status" 8 kod için tekrar eder; bizim için anlamlı olan:
//   #, Person ID, Name, Status, Timetable, Work Time, 1..30
// "Records / Early / Leave / Timetable2 / Timetable3" SKIP.
// ---------------------------------------------------------------------------
function buildHeaderIndex(headers) {
  const map = {};
  headers.forEach((raw, i) => {
    const key = raw.toLowerCase().trim();
    if (key === '#' || key === 'no' || key === 'sira' || key === 'sıra') map.rowNo = i;
    else if (key === 'person id' || key === 'pid' || key === 'personid') map.personId = i;
    else if (key === 'name' || key === 'ad soyad' || key === 'full name') map.name = i;
    else if (key === 'status') {
      // İlk "Status" = 8 kod (L-A, AB, PR, …); ikincisi SKIP.
      if (map.status === undefined) map.status = i;
    }
    else if (key === 'timetable') {
      if (map.timetable === undefined) map.timetable = i;
      // 2./3. timetable SKIP (Timetable2/Timetable3 kayıtları)
    }
    else if (key === 'work time') map.workTime = i;
    else if (/^\d{1,2}$/.test(key)) {
      // 1..31 gün kolonları
      const day = parseInt(key, 10);
      if (day >= 1 && day <= 31) map[`day${day}`] = i;
    }
  });
  return map;
}

// Status kodu (8 değer) → DB durumu. AsinERP PDKS raporunda kullanılan kodlar:
//   P / PR / W  → PRESENT  (W = Worked)
//   A / AB      → ABSENT
//   L           → LATE     (Late)
//   L-A / L-W   → HALF_DAY (yarım gün; L-A yarım-gün kodu, L-W yarım + present)
//   LV / IZ     → LEAVE
//   T           → HOLIDAY  (bayram)
//   OFF         → OFF
//   "-"         → null (atla)
//
// Excel'in kombinasyon kodları (örn. "L-A-#", "W-#", "L-W-#", "A-#") "-" ayrıcı
// ile birleştirilmiş olur ve "W-#" gibi Weekend + Worked karışımı anlamına
// gelir. Excel header notu (Daily_Report son satırı):
//   LV = Apply for Leave/Business Trip; L = Late; E = Early Leave;
//   W = Attended; OT1/OT2/OT3 = OT; A = Absent; # = Weekend
// Öncelik sırası: WEEKEND > LEAVE > ABSENT > LATE > PRESENT
const STATUS_CODE_MAP = {
  // tekli
  'PR': 'PRESENT', 'P': 'PRESENT', 'W': 'PRESENT',
  'AB': 'ABSENT',  'A': 'ABSENT',
  'L':  'LATE',
  'L-A':'HALF_DAY', 'L-A ': 'HALF_DAY',
  'L-W':'HALF_DAY', 'L-P': 'HALF_DAY',
  'LV': 'LEAVE', 'IZ': 'LEAVE', 'L-IZ': 'LEAVE',
  'T':  'HOLIDAY',
  'OFF':'OFF', 'OFF ': 'OFF',
  '-':  null, '': null,
  // kombinasyon (öncelik sırasıyla)
  'L-A-#': 'OFF',  // L-A + Weekend → OFF
  'W-#':   'OFF',  // Worked + Weekend → OFF (yine de hafta sonu)
  'A-#':   'OFF',  // Absent + Weekend → OFF
  'L-W-#': 'OFF',  // Late + Worked + Weekend → OFF
  'L-#':   'OFF',  // Late + Weekend → OFF
  'W-E':   'PRESENT', // Worked + Early leave → PRESENT
  'W-OT1': 'PRESENT', // Worked + OT1 → PRESENT
  'W-OT2': 'PRESENT',
  'W-OT3': 'PRESENT',
};

function mapStatusCode(rawCode) {
  if (rawCode == null) return null;
  const k = String(rawCode).trim();
  if (!k || k === '-') return null;
  if (STATUS_CODE_MAP[k] !== undefined) return STATUS_CODE_MAP[k];
  // Bilinmeyen kombinasyon: parçalarına ayır, parça parça eşle.
  const parts = k.split('-').map((s) => s.trim()).filter(Boolean);
  // Öncelik: weekend (#), leave (LV/IZ), absent (A/AB), late (L), present (W)
  if (parts.includes('#')) return 'OFF';
  if (parts.includes('LV') || parts.includes('IZ')) return 'LEAVE';
  if (parts.includes('A') || parts.includes('AB')) return 'ABSENT';
  if (parts.includes('L') && (parts.includes('A') || parts.includes('W'))) return 'HALF_DAY';
  if (parts.includes('L')) return 'LATE';
  if (parts.includes('W') || parts.includes('P') || parts.includes('PR')) return 'PRESENT';
  return null; // tanımsız → skip
}

// ---------------------------------------------------------------------------
// Daily_Report'tan gelen satırları 1-attendance-per-row olarak parse eder.
//
// Beklenen kolon sırası (Excel'in Daily_Report bloğu):
//   0  #            : sıra no
//   1  Person ID    : PDKS personId (1..8, 10, 11)
//   2  Name         : "MuhamadSalih#001"  (HR ekimde #NNN eklenmiş)
//   3  Department   : "AquaBeauty"
//   4  Status       : kişinin 8-kod master durumu (skip)
//   5  Gender       : Male/Female
//   6  Date         : YYYY-MM-DD
//   7  Dow          : Mon./Tue./…
//   8  Timetable    : "Normal(13:00:00-21:00:00)"
//   9  Records      : -
//  10  Early        : -
//  11  Leave        : -
//  12  Late (min)   : 0
//  13  Absent       : 0/1
//  14  OT (count)   : 0/1
//  15  Worked       : 0/1
//  16  Work-min     : 480
//  17  OT-min       : 0
//  18  Status kodu  : "L-A", "PR", "AB", "T", "OFF", "-"…
//  19  -            : (skip)
//
// Çıktı: { persons: [...kişi...], attendances: [{personId, day, status, date}] }
// ---------------------------------------------------------------------------
function parseDailyReportRows(rows) {
  const persons = new Map();
  const attendances = [];
  for (const row of rows) {
    if (row.length < 19) continue;
    const personIdRaw = row[1];
    const nameRaw = row[2];
    const dateRaw = row[6];
    const statusCode = row[18];
    if (!personIdRaw || !nameRaw || !dateRaw) continue;
    const pid = parseInt(String(personIdRaw).trim(), 10);
    if (!Number.isFinite(pid)) continue;
    // date YYYY-MM-DD
    const m = String(dateRaw).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    const day = parseInt(m[3], 10);
    const mapped = mapStatusCode(statusCode);
    if (mapped == null) continue; // "-" → null; skip
    if (!persons.has(pid)) {
      persons.set(pid, {
        personId: pid,
        name: String(nameRaw).trim(),
        code: `PDKS-${pid}`,
      });
    }
    attendances.push({
      personId: pid,
      name: String(nameRaw).trim(),
      date: `${m[1]}-${m[2]}-${m[3]}`,
      day,
      excelStatusCode: String(statusCode).trim(),
      status: mapped,
    });
  }
  return { persons: [...persons.values()], attendances };
}

// ---------------------------------------------------------------------------
// DB: Postgres'a yaz.
// ---------------------------------------------------------------------------
function buildPgClient() {
  if (process.env.DATABASE_URL) {
    return new pg.Client({ connectionString: process.env.DATABASE_URL });
  }
  const cfg = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'aqua_beauty',
  };
  return new pg.Client(cfg);
}

async function upsertStaff(client, p, period, firmNr) {
  // UNIQUE (firm_nr, excel_pdks_id) üzerinden UPSERT
  const code = `PDKS-${p.personId}`;
  const fullName = String(p.name || '').replace(/\s*#\d+\s*$/, '').trim(); // "#12" strip
  const sql = `
    INSERT INTO public.staff
      (firm_nr, code, full_name, is_active, excel_pdks_id, source_period,
       employment_type, base_salary, hourly_rate)
    VALUES ($1, $2, $3, TRUE, $4, $5, 'full_time', 0, 0)
    ON CONFLICT (firm_nr, excel_pdks_id) DO UPDATE SET
      code        = EXCLUDED.code,
      full_name   = EXCLUDED.full_name,
      source_period = EXCLUDED.source_period,
      is_active   = TRUE,
      updated_at  = CURRENT_TIMESTAMP
    RETURNING id::text, (xmax = 0)::int AS inserted`;
  const { rows } = await client.query(sql, [
    firmNr,
    code,
    fullName,
    p.personId,
    period,
  ]);
  const r = rows[0];
  return { id: String(r.id), inserted: Number(r.inserted) === 1 };
}

async function lookupShiftId(client, firmNr, attendanceDate) {
  // attendance_date ISO: YYYY-MM-DD; Cuma = 5 (ISO weekday).
  const d = new Date(`${attendanceDate}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // ISO 1..7
  const code = dow === 5 ? 'AQUA_CUMA' : 'AQUA_NORMAL';
  const { rows } = await client.query(
    `SELECT id::text AS id FROM public.staff_shifts
      WHERE firm_nr = $1 AND code = $2 AND is_active = TRUE LIMIT 1`,
    [firmNr, code],
  );
  return rows[0]?.id ?? null;
}

async function upsertAttendance(client, p, period, firmNr, periodNr, attendances) {
  const results = [];
  const code = `PDKS-${p.personId}`;
  for (const att of attendances) {
    const day = att.day;
    const status = att.status;
    const attendanceDate = att.date;
    const excelPdksId = p.personId * 100 + day;

    // staff_id'yi bul (excel_pdks_id üzerinden)
    const staffRow = await client.query(
      `SELECT id::text AS id FROM public.staff
        WHERE firm_nr = $1 AND excel_pdks_id = $2 LIMIT 1`,
      [firmNr, p.personId],
    );
    if (!staffRow.rows[0]) {
      results.push({ day, status, ok: false, error: 'staff_id bulunamadı' });
      continue;
    }
    const staffId = String(staffRow.rows[0].id);

    const shiftId = await lookupShiftId(client, firmNr, attendanceDate);

    // scheduled_start/end: shift'ten al; yoksa 09:00/18:00 (NORMAL) / 13:00 (CUMA)
    let scheduledStart = '09:00';
    let scheduledEnd   = '18:00';
    if (shiftId) {
      const shiftRow = await client.query(
        `SELECT to_char(start_time, 'HH24:MI') AS st, to_char(end_time, 'HH24:MI') AS et
           FROM public.staff_shifts WHERE id = $1::uuid LIMIT 1`,
        [shiftId],
      );
      if (shiftRow.rows[0]) {
        scheduledStart = String(shiftRow.rows[0].st || '09:00');
        scheduledEnd   = String(shiftRow.rows[0].et || '18:00');
      }
    }

    // Excel status → PRESENT/ABSENT/LATE/HALF_DAY/LEAVE/HOLIDAY/OFF — saat yok.
    // status ABSENT/LEAVE/HOLIDAY/OFF ise clock_in/out NULL.
    const noClockStatuses = new Set(['ABSENT', 'LEAVE', 'HOLIDAY', 'OFF']);
    const useClock = !noClockStatuses.has(status);

    // useClock durumuna göre SQL ayrı üretilir; yoksa $10/$14 referansı psql'de
    // "could not determine data type of parameter" hatası veriyor.
    const sql = useClock
      ? `
      INSERT INTO public.staff_attendance (
        firm_nr, period_nr, staff_id, staff_name, department, attendance_date,
        shift_id, scheduled_start, scheduled_end,
        clock_in, clock_out, worked_minutes, status,
        source, excel_pdks_id, early_minutes
      ) VALUES (
        $1, $2, $3::uuid, $4, $5, $6::date,
        $7::uuid, $8::time, $9::time,
        $10::time, $11::time, $12, $13,
        'excel', $14, 0
      )
      ON CONFLICT (firm_nr, period_nr, staff_id, attendance_date) DO UPDATE SET
        staff_name       = EXCLUDED.staff_name,
        shift_id         = EXCLUDED.shift_id,
        scheduled_start  = EXCLUDED.scheduled_start,
        scheduled_end    = EXCLUDED.scheduled_end,
        status           = EXCLUDED.status,
        source           = 'excel',
        excel_pdks_id    = EXCLUDED.excel_pdks_id,
        updated_at       = CURRENT_TIMESTAMP
      RETURNING id::text, (xmax = 0)::int AS inserted`
      : `
      INSERT INTO public.staff_attendance (
        firm_nr, period_nr, staff_id, staff_name, department, attendance_date,
        shift_id, scheduled_start, scheduled_end,
        clock_in, clock_out, worked_minutes, status,
        source, excel_pdks_id, early_minutes
      ) VALUES (
        $1, $2, $3::uuid, $4, $5, $6::date,
        $7::uuid, $8::time, $9::time,
        NULL, NULL, 0, $10,
        'excel', $11, 0
      )
      ON CONFLICT (firm_nr, period_nr, staff_id, attendance_date) DO UPDATE SET
        staff_name       = EXCLUDED.staff_name,
        shift_id         = EXCLUDED.shift_id,
        scheduled_start  = EXCLUDED.scheduled_start,
        scheduled_end    = EXCLUDED.scheduled_end,
        status           = EXCLUDED.status,
        source           = 'excel',
        excel_pdks_id    = EXCLUDED.excel_pdks_id,
        updated_at       = CURRENT_TIMESTAMP
      RETURNING id::text, (xmax = 0)::int AS inserted`;
    const params = useClock
      ? [firmNr, periodNr, staffId, p.name, null, attendanceDate,
         shiftId, scheduledStart, scheduledEnd,
         scheduledStart, scheduledEnd, 0,
         status, excelPdksId]
      : [firmNr, periodNr, staffId, p.name, null, attendanceDate,
         shiftId, scheduledStart, scheduledEnd,
         status, excelPdksId];

    try {
      const { rows } = await client.query(sql, params);
      results.push({
        day,
        status,
        ok: true,
        inserted: Number(rows[0].inserted) === 1,
        id: String(rows[0].id),
      });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      results.push({ day, status, ok: false, error: msg });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Log yazma (sadece --commit modunda).
// ---------------------------------------------------------------------------
async function writeLog(logPath, summary, personResults) {
  const lines = [];
  const ts = new Date().toISOString();
  lines.push(`# Aqua Beauty PDKS Import — ${ts}`);
  lines.push(`# Mode: ${summary.mode}  Period: ${summary.period}  Firm: ${summary.firm}`);
  lines.push(`# Persons: ${summary.personCount}  Attendance rows: ${summary.attendanceCount}  Inserted: ${summary.attendanceInserted}  Updated: ${summary.attendanceUpdated}`);
  lines.push('');
  for (const pr of personResults) {
    lines.push(`## Person ${pr.personId} — ${pr.name} (${pr.code})`);
    if (pr.staffUpsert) {
      lines.push(`   staff: id=${pr.staffUpsert.id} inserted=${pr.staffUpsert.inserted}`);
    } else if (pr.staffUpsertError) {
      lines.push(`   staff ERROR: ${pr.staffUpsertError}`);
    }
    for (const a of pr.attendance) {
      if (a.ok) {
        lines.push(`   day ${String(a.day).padStart(2)}: ${a.status} (${a.inserted ? 'INSERT' : 'UPDATE'})`);
      } else {
        lines.push(`   day ${String(a.day).padStart(2)}: ${a.status} ERROR: ${a.error}`);
      }
    }
    lines.push('');
  }
  await import('node:fs/promises').then((m) => m.writeFile(logPath, lines.join('\n'), 'utf8'));
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) throw new Error('--file gerekli (HTML-disguised .xls yolu).');
  if (!args.period) throw new Error('--period gerekli (örn. 2026-09).');
  if (!/^\d{4}-\d{2}$/.test(args.period)) throw new Error('--period YYYY-MM olmalı.');
  const periodNr = args.period.split('-')[1];
  const filePath = resolve(args.file);
  const logPath = args.log || resolve(__dirname, '..', 'import-log.txt');

  console.log(`[import-aqua-pdks] mod=${args.mode} dosya=${filePath} period=${args.period} firm=${args.firm}`);
  const html = await readFile(filePath, 'utf8');
  const table = extractDailyReport(html);
  const rows = parseTable(table);
  if (rows.length < 5) throw new Error('Yeterli satır bulunamadı (en az header + 1 kişi).');

  // Daily_Report'tan direkt parse: her satır = 1 kişi 1 gün = 1 attendance.
  const { persons, attendances } = parseDailyReportRows(rows);
  console.log(`[import-aqua-pdks] parse edilen kişi: ${persons.length}  attendance: ${attendances.length}`);

  // DRY-RUN: sadece özet döndür.
  if (args.mode === 'dry-run') {
    // Status dağılımı
    const statusDist = {};
    for (const a of attendances) {
      statusDist[a.status] = (statusDist[a.status] || 0) + 1;
    }
    // Kişi başına kaç attendance
    const byPerson = {};
    for (const a of attendances) {
      byPerson[a.personId] = (byPerson[a.personId] || 0) + 1;
    }
    const summary = {
      mode: args.mode,
      period: args.period,
      firm: args.firm,
      personCount: persons.length,
      attendanceCount: attendances.length,
      statusDistribution: statusDist,
      persons: persons.map((p) => ({
        personId: p.personId,
        name: p.name,
        code: p.code,
        attendanceCount: byPerson[p.personId] || 0,
      })),
      // ilk 5 örnek attendance
      sampleAttendances: attendances.slice(0, 5),
    };
    console.log('[import-aqua-pdks] DRY-RUN JSON:');
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  // COMMIT: DB bağlan.
  const client = buildPgClient();
  await client.connect();
  const personResults = [];
  let attendanceInserted = 0;
  let attendanceUpdated = 0;
  try {
    for (const p of persons) {
      let staffUpsert = null;
      let staffUpsertError = null;
      try {
        staffUpsert = await upsertStaff(client, p, args.period, args.firm);
      } catch (err) {
        staffUpsertError = err && err.message ? err.message : String(err);
      }
      // Bu kişiye ait attendance satırları
      const own = attendances.filter((a) => a.personId === p.personId);
      const attendance = await upsertAttendance(client, p, args.period, args.firm, periodNr, own);
      for (const a of attendance) {
        if (a.ok && a.inserted) attendanceInserted++;
        else if (a.ok) attendanceUpdated++;
      }
      personResults.push({
        personId: p.personId,
        name: p.name,
        code: `PDKS-${p.personId}`,
        staffUpsert,
        staffUpsertError,
        attendance,
      });
    }
  } finally {
    await client.end();
  }

  const summary = {
    mode: args.mode,
    period: args.period,
    firm: args.firm,
    personCount: persons.length,
    attendanceCount: attendances.length,
    attendanceInserted,
    attendanceUpdated,
    personResults: personResults.map((pr) => ({
      personId: pr.personId,
      name: pr.name,
      staffId: pr.staffUpsert?.id ?? null,
      staffInserted: pr.staffUpsert?.inserted ?? null,
      staffError: pr.staffUpsertError ?? null,
      attendance: pr.attendance,
    })),
  };
  await writeLog(logPath, summary, personResults);
  console.log(`[import-aqua-pdks] COMMIT tamamlandı.`);
  console.log(JSON.stringify({
    persons: summary.personCount,
    attendanceInserted: summary.attendanceInserted,
    attendanceUpdated: summary.attendanceUpdated,
    logFile: logPath,
  }, null, 2));
  return summary;
}

main().catch((err) => {
  console.error('[import-aqua-pdks] FATAL:', err && err.message ? err.message : err);
  process.exit(1);
});