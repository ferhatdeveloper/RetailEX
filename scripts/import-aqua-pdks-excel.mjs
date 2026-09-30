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

function extractMainTable(html) {
  const stripped = stripScripts(html);
  const m = stripped.match(/<table[\s\S]*?<\/table>/i);
  if (!m) throw new Error('HTML içinde <table> bulunamadı.');
  return m[0];
}

function parseTable(tableHtml) {
  const rows = [];
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cMatch;
    while ((cMatch = cellRegex.exec(trMatch[1])) !== null) {
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

// Status kodu (8 değer) → DB durumu. AsinERP PDKS'ten gelen yaygın kodlar:
//   PR → PRESENT, AB → ABSENT, L-A → HALF_DAY, L → LATE,
//   L-P → LATE, iz → LEAVE, T → HOLIDAY (bayram), OFF → OFF
const STATUS_CODE_MAP = {
  PR: 'PRESENT',
  P:  'PRESENT',
  AB: 'ABSENT',
  'L-A': 'HALF_DAY',
  'L-A ': 'HALF_DAY',
  L:  'LATE',
  'L-P': 'LATE',
  'IZ': 'LEAVE',
  'IZ ': 'LEAVE',
  'L-IZ': 'LEAVE',
  T:  'HOLIDAY',
  OFF: 'OFF',
  'OFF ': 'OFF',
  '-':  null,
  '':   null,
};
function mapStatusCode(rawCode) {
  if (rawCode == null) return null;
  const k = String(rawCode).trim();
  if (!k) return null;
  return STATUS_CODE_MAP[k] ?? null;
}

// ---------------------------------------------------------------------------
// 20 kolonluk beklenen Excel header örneği (referans):
//  #, Person ID, Name, Status, Timetable, Timetable2, Timetable3,
//  Status, Work Time, Records, Early, Leave, 1, 2, …, 30
// ---------------------------------------------------------------------------
function parseRows(rows, headerIdx) {
  const persons = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const personIdRaw = row[headerIdx.personId];
    const nameRaw = row[headerIdx.name];
    if (!personIdRaw || !nameRaw) continue;
    const pid = parseInt(String(personIdRaw).trim(), 10);
    if (!Number.isFinite(pid)) continue;
    const statusCode = row[headerIdx.status];
    const timetableRaw = row[headerIdx.timetable];
    const workTimeRaw = row[headerIdx.workTime];

    // 30 günlük status hücreleri
    const days = {};
    for (let d = 1; d <= 30; d++) {
      const colIdx = headerIdx[`day${d}`];
      if (colIdx === undefined) continue;
      const cell = row[colIdx];
      const mapped = mapStatusCode(cell);
      if (mapped != null) days[d] = mapped;
    }

    persons.push({
      rowIndex: r,
      personId: pid,
      name: String(nameRaw).trim(),
      excelStatusCode: statusCode ? String(statusCode).trim() : '',
      timetable: timetableRaw ? String(timetableRaw).trim() : '',
      workTime: workTimeRaw ? String(workTimeRaw).trim() : '',
      days,
    });
  }
  return persons;
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

async function upsertAttendance(client, p, period, firmNr, periodNr) {
  const results = [];
  const code = `PDKS-${p.personId}`;
  for (const [dayStr, status] of Object.entries(p.days)) {
    const day = parseInt(dayStr, 10);
    const [year, month] = period.split('-').map(Number);
    const attendanceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

    const sql = `
      INSERT INTO public.staff_attendance (
        firm_nr, period_nr, staff_id, staff_name, department, attendance_date,
        shift_id, scheduled_start, scheduled_end,
        clock_in, clock_out, worked_minutes, status,
        source, excel_pdks_id, early_minutes
      ) VALUES (
        $1, $2, $3::uuid, $4, $5, $6::date,
        $7::uuid, $8::time, $9::time,
        ${useClock ? '$10::time, $11::time' : 'NULL, NULL'},
        ${useClock ? '$12' : '0'},
        $13, 'excel', $14, 0
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
  const table = extractMainTable(html);
  const rows = parseTable(table);
  if (rows.length < 5) throw new Error('Yeterli satır bulunamadı (en az header + 1 kişi).');

  // İlk ~5 satır metadata olabilir; header'ı ilk "Person ID" geçen satırdan başlat.
  let headerRow = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i].some((c) => /person\s*id/i.test(c))) { headerRow = i; break; }
  }
  if (headerRow < 0) throw new Error('Header satırı bulunamadı ("Person ID" kolonu yok).');
  const headerIdx = buildHeaderIndex(rows[headerRow]);

  if (headerIdx.personId === undefined || headerIdx.name === undefined) {
    throw new Error('Zorunlu kolonlar eksik: Person ID ve Name.');
  }
  console.log(`[import-aqua-pdks] header index:`, headerIdx);

  const dataRows = rows.slice(headerRow + 1);
  const persons = parseRows(dataRows, headerIdx);
  console.log(`[import-aqua-pdks] parse edilen kişi: ${persons.length}`);

  // DRY-RUN: sadece özet döndür.
  if (args.mode === 'dry-run') {
    const summary = {
      mode: args.mode,
      period: args.period,
      firm: args.firm,
      personCount: persons.length,
      attendanceCount: persons.reduce((s, p) => s + Object.keys(p.days).length, 0),
      persons: persons.map((p) => ({
        personId: p.personId,
        name: p.name,
        code: `PDKS-${p.personId}`,
        excelStatusCode: p.excelStatusCode,
        timetable: p.timetable,
        workTime: p.workTime,
        dayCount: Object.keys(p.days).length,
        days: p.days,
      })),
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
      const attendance = await upsertAttendance(client, p, args.period, args.firm, periodNr);
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
    attendanceCount: persons.reduce((s, p) => s + Object.keys(p.days).length, 0),
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