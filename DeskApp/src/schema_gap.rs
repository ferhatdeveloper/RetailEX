//! Migration SQL'lerindeki ALTER TABLE ... ADD COLUMN ifadeleri ile canlı PostgreSQL
//! şemasını karşılaştırır; eksik kolonları loglar ve uygulanabilir SQL üretir.

use regex::Regex;
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use tokio_postgres::Client;

#[derive(Debug, Clone, Serialize)]
pub struct SchemaColumnGap {
    pub schema: String,
    pub table: String,
    pub column: String,
    pub durum: String,
    pub suggested_sql: String,
    pub kaynak_migration: String,
}

#[derive(Debug, Serialize)]
pub struct SchemaGapReport {
    pub eksik_kolonlar: Vec<SchemaColumnGap>,
    pub sql_toplu: String,
    pub notlar: Vec<String>,
}

#[derive(Clone, Debug)]
enum BeklenenKolon {
    Statik {
        schema: String,
        table: String,
        column: String,
        type_sql: String,
        kaynak: String,
    },
    Dinamik {
        schema: String,
        tablo_pg_regex: String,
        column: String,
        type_sql: String,
        kaynak: String,
    },
}

fn unescape_sql_literal(s: &str) -> String {
    s.replace("''", "'")
}

fn parse_table_qualified(raw: &str) -> (String, String) {
    let t = raw.trim().trim_matches('"');
    if let Some((a, b)) = t.rsplit_once('.') {
        let sch = a.trim().trim_matches('"').to_lowercase();
        let tbl = b.trim().trim_matches('"').to_lowercase();
        if !sch.is_empty() && !tbl.is_empty() {
            return (sch, tbl);
        }
    }
    ("public".to_string(), t.to_lowercase())
}

fn collect_static_alters(content: &str, kaynak: &str, out: &mut Vec<BeklenenKolon>) {
    let Ok(re) = Regex::new(
        r"(?is)ALTER\s+TABLE\s+(?P<tbl>[\w.]+)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(?P<col>\w+)\s+(?P<typ>[^;]+?)\s*;",
    ) else {
        return;
    };
    for caps in re.captures_iter(content) {
        let tbl = caps.name("tbl").map(|m| m.as_str()).unwrap_or("").trim();
        let col = caps
            .name("col")
            .map(|m| m.as_str().trim().trim_matches('"'))
            .unwrap_or("");
        let typ = caps
            .name("typ")
            .map(|m| m.as_str().trim())
            .unwrap_or("");
        if tbl.is_empty() || col.is_empty() || typ.is_empty() {
            continue;
        }
        let (schema, table) = parse_table_qualified(tbl);
        out.push(BeklenenKolon::Statik {
            schema,
            table,
            column: col.to_lowercase(),
            type_sql: unescape_sql_literal(typ),
            kaynak: kaynak.to_string(),
        });
    }
}

fn find_do_blocks(content: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let Ok(re_open) = Regex::new(r"(?is)DO\s*\$\$") else {
        return blocks;
    };
    let Ok(re_close) = Regex::new(r"(?is)END\s*\$\$") else {
        return blocks;
    };
    let mut search_from = 0usize;
    while let Some(m) = re_open.find(&content[search_from..]) {
        let abs_start = search_from + m.end();
        if let Some(m2) = re_close.find(&content[abs_start..]) {
            let inner_end = abs_start + m2.start();
            blocks.push(content[abs_start..inner_end].to_string());
            search_from = abs_start + m2.end();
        } else {
            break;
        }
    }
    blocks
}

fn extract_schema_from_where(block: &str) -> String {
    let re = Regex::new(r"(?i)schemaname\s*=\s*'([^']+)'").ok();
    if let Some(re) = re {
        if let Some(c) = re.captures(block) {
            return c.get(1).map(|m| m.as_str().to_lowercase()).unwrap_or_else(|| "public".to_string());
        }
    }
    "public".to_string()
}

fn extract_tablename_regex(block: &str) -> Option<String> {
    let re = Regex::new(r"(?i)tablename\s*~\s*'([^']+)'").ok()?;
    re.captures(block)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

/// `open_idx`: açan `'` karakterinin bayt indeksi
fn extract_sql_single_quoted(sql: &str, open_idx: usize) -> Option<(String, usize)> {
    let bytes = sql.as_bytes();
    if open_idx >= bytes.len() || bytes[open_idx] != b'\'' {
        return None;
    }
    let mut i = open_idx + 1;
    let mut out = String::new();
    while i < bytes.len() {
        if bytes[i] == b'\'' {
            if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                out.push('\'');
                i += 2;
                continue;
            }
            return Some((out, i + 1));
        }
        let c = sql[i..].chars().next()?;
        out.push(c);
        i += c.len_utf8();
    }
    None
}

fn find_execute_format_alter_inners(block: &str) -> Vec<String> {
    let Ok(re) = Regex::new(r"(?is)EXECUTE\s+format\s*\(\s*") else {
        return vec![];
    };
    let mut v = Vec::new();
    for m in re.find_iter(block) {
        let mut p = m.end();
        while p < block.len() {
            let c = match block[p..].chars().next() {
                Some(ch) => ch,
                None => break,
            };
            if !c.is_whitespace() {
                break;
            }
            p += c.len_utf8();
        }
        if p >= block.len() || block.as_bytes().get(p) != Some(&b'\'') {
            continue;
        }
        if let Some((inner, _)) = extract_sql_single_quoted(block, p) {
            if inner.to_ascii_uppercase().contains("ALTER TABLE") {
                v.push(inner);
            }
        }
    }
    v
}

fn parse_alter_inner_template(inner: &str) -> Option<(Option<String>, String, String)> {
    let re = Regex::new(
        r"(?is)^\s*ALTER\s+TABLE\s+(?:(?P<sch>[\w]+)\.)?%I\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(?P<col>\w+)\s+(?P<typ>.+)$",
    )
    .ok()?;
    let c = re.captures(inner.trim())?;
    let sch = c.name("sch").map(|m| m.as_str().to_lowercase());
    let col = c.name("col")?.as_str().to_lowercase();
    let typ = unescape_sql_literal(c.name("typ")?.as_str().trim());
    Some((sch, col, typ))
}

fn collect_dynamic_from_do(content: &str, kaynak: &str, out: &mut Vec<BeklenenKolon>) {
    for block in find_do_blocks(content) {
        let schema = extract_schema_from_where(&block);
        let Some(tab_re) = extract_tablename_regex(&block) else {
            continue;
        };
        for inner in find_execute_format_alter_inners(&block) {
            if let Some((sch_inner, col, typ)) = parse_alter_inner_template(&inner) {
                let eff_schema = sch_inner.unwrap_or_else(|| schema.clone());
                out.push(BeklenenKolon::Dinamik {
                    schema: eff_schema,
                    tablo_pg_regex: tab_re.clone(),
                    column: col,
                    type_sql: typ,
                    kaynak: kaynak.to_string(),
                });
            }
        }
    }
}

fn collect_expectations_from_dir(dir: &Path) -> Result<Vec<BeklenenKolon>, String> {
    let mut acc: Vec<BeklenenKolon> = Vec::new();
    let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("sql"))
        .collect();
    files.sort_by(|a, b| {
        let na = a.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let nb = b.file_name().and_then(|s| s.to_str()).unwrap_or("");
        na.cmp(nb)
    });
    for path in files {
        let fname = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let prefix_ok = fname
            .split('_')
            .next()
            .map(|p| p.chars().all(|c| c.is_ascii_digit()) && !p.is_empty())
            == Some(true);
        if !prefix_ok {
            continue;
        }
        let body = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        collect_static_alters(&body, &fname, &mut acc);
        collect_dynamic_from_do(&body, &fname, &mut acc);
    }
    Ok(acc)
}

async fn column_exists(
    client: &Client,
    schema: &str,
    table: &str,
    column: &str,
) -> Result<bool, String> {
    let rows = client
        .query(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1",
            &[&schema, &table, &column],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(!rows.is_empty())
}

fn quote_ident(id: &str) -> String {
    let safe: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
    if safe.is_empty() {
        return "\"invalid\"".to_string();
    }
    format!("\"{}\"", safe.replace('"', ""))
}

fn dedupe_expectations(items: Vec<BeklenenKolon>) -> Vec<BeklenenKolon> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for it in items {
        let key = match &it {
            BeklenenKolon::Statik {
                schema,
                table,
                column,
                ..
            } => format!("s:{}.{}.{}", schema, table, column),
            BeklenenKolon::Dinamik {
                schema,
                tablo_pg_regex,
                column,
                ..
            } => format!("d:{}:{}:{}", schema, tablo_pg_regex, column),
        };
        if seen.insert(key) {
            out.push(it);
        }
    }
    out
}

pub async fn diagnose_schema_gaps(client: &Client, migration_dir: &Path) -> Result<SchemaGapReport, String> {
    let mut notlar: Vec<String> = Vec::new();
    let mut expectations = collect_expectations_from_dir(migration_dir)?;
    expectations = dedupe_expectations(expectations);
    if expectations.is_empty() {
        notlar.push("Migration klasöründen beklenen ADD COLUMN ifadesi çıkarılamadı.".to_string());
    }

    let mut gaps: Vec<SchemaColumnGap> = Vec::new();
    let mut sql_lines: Vec<String> = Vec::new();

    for ex in &expectations {
        match ex {
            BeklenenKolon::Statik {
                schema,
                table,
                column,
                type_sql,
                kaynak,
            } => {
                let exists = column_exists(client, schema, table, column).await?;
                if !exists {
                    let line = format!(
                        "ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS {} {};",
                        quote_ident(schema),
                        quote_ident(table),
                        quote_ident(column),
                        type_sql
                    );
                    sql_lines.push(line.clone());
                    gaps.push(SchemaColumnGap {
                        schema: schema.clone(),
                        table: table.clone(),
                        column: column.clone(),
                        durum: "kolon_yok".to_string(),
                        suggested_sql: line,
                        kaynak_migration: kaynak.clone(),
                    });
                }
            }
            BeklenenKolon::Dinamik {
                schema,
                tablo_pg_regex,
                column,
                type_sql,
                kaynak,
            } => {
                let tabs = client
                    .query(
                        "SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename ~ $2 ORDER BY tablename",
                        &[&schema, &tablo_pg_regex],
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                if tabs.is_empty() {
                    notlar.push(format!(
                        "Dinamik migration ({kaynak}) için tablo bulunamadı: schema={schema} regex={tablo_pg_regex}"
                    ));
                }
                for row in tabs {
                    let tname: String = row.get(0);
                    let exists = column_exists(client, schema, &tname, column).await?;
                    if !exists {
                        let line = format!(
                            "ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS {} {};",
                            quote_ident(schema),
                            quote_ident(&tname),
                            quote_ident(column),
                            type_sql
                        );
                        sql_lines.push(line.clone());
                        gaps.push(SchemaColumnGap {
                            schema: schema.clone(),
                            table: tname.clone(),
                            column: column.clone(),
                            durum: "kolon_yok".to_string(),
                            suggested_sql: line,
                            kaynak_migration: kaynak.clone(),
                        });
                    }
                }
            }
        }
    }

    let sql_toplu = sql_lines.join("\n");
    Ok(SchemaGapReport {
        eksik_kolonlar: gaps,
        sql_toplu,
        notlar,
    })
}

pub fn write_schema_gap_log(report: &SchemaGapReport) {
    let log_dir = std::path::Path::new("C:\\RetailEX\\logs");
    if std::fs::create_dir_all(log_dir).is_err() {
        return;
    }
    let path = log_dir.join("schema_gaps.json");
    if let Ok(json) = serde_json::to_string_pretty(report) {
        let _ = std::fs::write(&path, json);
        println!("✅ Şema boşluk raporu: {:?}", path);
    }
}
