#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db_ops;
mod db_utils;
mod schema_gap;
mod sql_migration_split;
mod mssql;
mod sync;
mod remote_input;
mod screen_capture;
mod maintenance;
mod security;
mod logger;
mod config;
mod db;
mod backup_service;
mod bank_ops;
mod license;
mod portable_bind;
mod caller_id_serial;
mod rongta_scale;
mod platform;

use sync::BackgroundSyncService;
use platform::PlatformCommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{Manager, Emitter};
use tauri::path::BaseDirectory;
use tokio_postgres::Client;
use std::sync::Arc;
use tokio::sync::Mutex;
use base64::{engine::general_purpose::STANDARD, Engine as _};

// Connection Cache for Performance
pub struct DbConnection {
    pub client: Option<Arc<Client>>,
    pub conn_str: Option<String>,
}

pub struct DbState {
    pub inner: Arc<Mutex<DbConnection>>,
    /// Aynı PG client üzerinde eşzamanlı sorgu yasak (BEGIN/COMMIT + paralel invoke).
    pub query_serial: Arc<Mutex<()>>,
}

use std::time::Duration;
use tokio::time::timeout;

const PG_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const PG_QUERY_TIMEOUT: Duration = Duration::from_secs(30);

async fn invalidate_pg_cache(state: &DbState, conn_str: &str) {
    let mut db = state.inner.lock().await;
    if db.conn_str.as_deref() == Some(conn_str) {
        db.client = None;
        db.conn_str = None;
    }
}

async fn acquire_pg_client(state: &DbState, conn_str: &str) -> Result<Arc<Client>, String> {
    use tokio_postgres::NoTls;
    use std::str::FromStr;

    {
        let db = state.inner.lock().await;
        if let Some(ref c) = db.client {
            if db.conn_str.as_deref() == Some(conn_str) && !c.is_closed() {
                return Ok(c.clone());
            }
        }
    }

    let connect_fut = async {
        let mut pg_config = tokio_postgres::Config::from_str(conn_str)
            .map_err(|e| format!("Invalid connection string: {}", e))?;
        pg_config.connect_timeout(PG_CONNECT_TIMEOUT);

        let (client, connection) = pg_config
            .connect(NoTls)
            .await
            .map_err(|e| format!("Connection failed: {}", crate::db_ops::format_pg_error(e)))?;

        tauri::async_runtime::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });

        Ok::<Client, String>(client)
    };

    let client = match timeout(PG_CONNECT_TIMEOUT + Duration::from_secs(2), connect_fut).await {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => return Err(e),
        Err(_) => {
            return Err(format!(
                "PostgreSQL bağlantısı zaman aşımı ({} sn)",
                PG_CONNECT_TIMEOUT.as_secs()
            ));
        }
    };

    if let Err(e) = client.batch_execute("SET statement_timeout = '25000'").await {
        eprintln!("statement_timeout set failed: {}", e);
    }

    let client = Arc::new(client);
    {
        let mut db = state.inner.lock().await;
        db.client = Some(client.clone());
        db.conn_str = Some(conn_str.to_string());
    }
    Ok(client)
}

#[tauri::command]
async fn check_pg16() -> Result<bool, String> {
    use std::net::TcpStream;
    use std::time::Duration;
    if let Ok(addr) = "127.0.0.1:5432".parse() {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok() {
            return Ok(true);
        }
    }

    #[cfg(windows)]
    {
        let pg_paths = [
            "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
            "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_ctl.exe",
            "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_ctl.exe",
            "C:\\Program Files\\PostgreSQL\\14\\bin\\pg_ctl.exe",
        ];
        for path in &pg_paths {
            if std::path::Path::new(path).exists() {
                return Ok(true);
            }
        }

        let output = Command::new("powershell")
            .args(["-Command", "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue"])
            .platform_no_window()
            .output()
            .map_err(|e| e.to_string())?;

        return Ok(output.status.success() && !output.stdout.is_empty());
    }

    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[tauri::command]
async fn install_pg16(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(windows)]
    {
    let script = r#"
        $url = "https://get.enterprisedb.com/postgresql/postgresql-16.1-1-windows-x64.exe"
        $installer = "$env:TEMP\postgresql-setup.exe"
        if (!(Test-Path $installer)) {
            Write-Host "Downloading PostgreSQL 16..."
            Invoke-WebRequest -Uri $url -OutFile $installer
        }
        Write-Host "Installing PostgreSQL 16 Silently..."
        Start-Process -FilePath $installer -ArgumentList "--mode unattended --unattendedmodeui none --superpassword Yq7xwQpt6c --serverport 5432" -Wait
    "#;

    let output = Command::new("powershell")
        .args(["-Command", script])
        .platform_no_window() 
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    // Tum ag arayuzlerinde dinleme + pg_hba + firewall (AsinERP uzak baglanti)
    #[cfg(windows)]
    {
        let mut ran = false;
        for rel in ["pg-windows-expose-remote.ps1"] {
            let Ok(p) = app.path().resolve(rel, BaseDirectory::Resource) else {
                continue;
            };
            if !p.exists() {
                continue;
            }
            let ps1 = p.to_str().ok_or_else(|| "pg-windows-expose-remote.ps1: invalid path".to_string())?;
            let expose = Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    ps1,
                    "-AllowAllNetworks",
                ])
                .platform_no_window()
                .output();
            match expose {
                Ok(o) => {
                    if o.status.success() {
                        println!(
                            "AsinERP: PostgreSQL remote listen configured.\n{}",
                            String::from_utf8_lossy(&o.stdout)
                        );
                    } else {
                        eprintln!(
                            "AsinERP: pg-windows-expose-remote failed: {}",
                            String::from_utf8_lossy(&o.stderr)
                        );
                    }
                    ran = true;
                }
                Err(e) => eprintln!("AsinERP: could not run pg-windows-expose-remote: {}", e),
            }
            break;
        }
        if !ran {
            eprintln!(
                "AsinERP: pg-windows-expose-remote.ps1 not bundled; run database/scripts/pg-windows-expose-remote.ps1 -AllowAllNetworks manually (admin)."
            );
        }
    }

    Ok("Installation completed successfully".to_string())
    }

    #[cfg(not(windows))]
    {
        let _ = app;
        Err("PostgreSQL kurulum sihirbazi yalnizca Windows masaustu surumunde.".into())
    }
}

#[tauri::command]
async fn read_init_sqls(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    let mut sqls = Vec::new();
    let mut search_paths = Vec::new();

    // 1. Resolve using tauri::path::resolve_resource
    if let Ok(res) = app.path().resolve("database/init", BaseDirectory::Resource) {
        search_paths.push(res);
    }
    
    // 2. Resolve relative to _up_ (common in bundling)
    if let Ok(res) = app.path().resolve("_up_/database/init", BaseDirectory::Resource) {
        search_paths.push(res);
    }
 
    // 3. Fallback to resource_dir manual joins
    if let Ok(resource_dir) = app.path().resource_dir() {
        search_paths.push(resource_dir.join("database").join("init"));
        search_paths.push(resource_dir.join("init"));
        search_paths.push(resource_dir.join("_up_").join("database").join("init"));
    }
    
    let mut found_path = None;
    for path in search_paths {
        if path.exists() && path.is_dir() {
            found_path = Some(path);
            break;
        }
    }

    if let Some(init_dir) = found_path {
        let entries = std::fs::read_dir(init_dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("sql") {
                let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
                sqls.push((name, content));
            }
        }
    }
    
    sqls.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(sqls)
}

#[tauri::command]
async fn pg_execute(
    state: tauri::State<'_, DbState>,
    conn_str: String, 
    sql: String
) -> Result<String, String> {
    let _serial = state.query_serial.lock().await;
    let client = acquire_pg_client(state.inner(), &conn_str).await?;
    match timeout(PG_QUERY_TIMEOUT, client.batch_execute(&sql)).await {
        Ok(Ok(())) => Ok("Success".to_string()),
        Ok(Err(e)) => {
            invalidate_pg_cache(state.inner(), &conn_str).await;
            Err(crate::db_utils::format_pg_error(e))
        }
        Err(_) => {
            invalidate_pg_cache(state.inner(), &conn_str).await;
            Err(format!(
                "SQL zaman aşımı ({} sn). Yerel PostgreSQL yanıt vermiyor olabilir.",
                PG_QUERY_TIMEOUT.as_secs()
            ))
        }
    }
}

// get_app_version removed because it was unused


#[tauri::command]
async fn pg_query(
    state: tauri::State<'_, DbState>,
    conn_str: String, 
    sql: String, 
    params: Vec<serde_json::Value>
) -> Result<String, String> {
    use tokio_postgres::types::{ToSql, Type};
    use uuid::Uuid;
    use chrono::{DateTime, NaiveTime, Utc};
    use rust_decimal::prelude::ToPrimitive;

    // Helper enum for heterogeneous parameters to avoid global stringification
    #[derive(Debug)]
    enum QueryParam {
        Text(String),
        TextArray(Vec<String>),
        Num(rust_decimal::Decimal),
        Bool(bool),
        Null,
    }

    fn json_value_to_query_param(p: serde_json::Value) -> QueryParam {
        match p {
            serde_json::Value::Null => QueryParam::Null,
            serde_json::Value::String(s) => QueryParam::Text(s),
            serde_json::Value::Bool(b) => QueryParam::Bool(b),
            serde_json::Value::Number(n) => QueryParam::Text(n.to_string()),
            serde_json::Value::Array(arr) => {
                let values: Vec<String> = arr
                    .into_iter()
                    .map(|v| match v {
                        serde_json::Value::String(s) => s,
                        serde_json::Value::Null => String::new(),
                        other => other.to_string(),
                    })
                    .collect();
                QueryParam::TextArray(values)
            }
            other => QueryParam::Text(other.to_string()),
        }
    }

    fn is_text_array_type(ty: &tokio_postgres::types::Type) -> bool {
        matches!(
            *ty,
            Type::TEXT_ARRAY | Type::VARCHAR_ARRAY | Type::BPCHAR_ARRAY | Type::NAME_ARRAY
        ) || ty.name() == "_text"
    }

    impl ToSql for QueryParam {
        fn to_sql(&self, ty: &tokio_postgres::types::Type, out: &mut bytes::BytesMut) -> Result<tokio_postgres::types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
            use tokio_postgres::types::Type;
            use rust_decimal::prelude::FromPrimitive;
            
            let is_text_type = match *ty {
                Type::VARCHAR | Type::TEXT | Type::BPCHAR | Type::NAME | Type::UNKNOWN => true,
                _ => false,
            };

            match self {
                QueryParam::Null => Ok(tokio_postgres::types::IsNull::Yes),

                QueryParam::TextArray(values) => {
                    if is_text_array_type(ty) {
                        let refs: Vec<&str> = values.iter().map(|s| s.as_str()).collect();
                        return refs.as_slice().to_sql(ty, out);
                    }
                    // PG cast ANY($1::text[]) — tip henüz bilinmiyorsa virgülle birleştirilmiş metin yerine dizi gönder
                    if ty.name() == "unknown" {
                        let refs: Vec<&str> = values.iter().map(|s| s.as_str()).collect();
                        return refs.as_slice().to_sql(&Type::TEXT_ARRAY, out);
                    }
                    Err(format!(
                        "text[] parametresi bekleniyordu, PG tipi: {}",
                        ty.name()
                    )
                    .into())
                }

                // ── Text → target type conversion ──────────────────────
                // The frontend normalises every value to a JSON string.
                // tokio-postgres uses the *extended* (binary) protocol, so
                // we MUST parse the string into the native Rust type that
                // matches the PostgreSQL column, otherwise the server
                // receives raw UTF-8 bytes where it expects a binary int /
                // bool / uuid / date and returns 22P03.
                QueryParam::Text(s) => {
                    if is_text_type {
                        return s.to_sql(ty, out);
                    }
                    match *ty {
                        // Boolean
                        Type::BOOL => {
                            let b = match s.to_lowercase().as_str() {
                                "true" | "t" | "1" | "yes" => true,
                                _ => false,
                            };
                            b.to_sql(ty, out)
                        },
                        // Integers
                        Type::INT2 => {
                            let v: i16 = s.parse().unwrap_or(0);
                            v.to_sql(ty, out)
                        },
                        Type::INT4 | Type::OID => {
                            let v: i32 = s.parse().unwrap_or(0);
                            v.to_sql(ty, out)
                        },
                        Type::INT8 => {
                            let v: i64 = s.parse().unwrap_or(0);
                            v.to_sql(ty, out)
                        },
                        // Floats
                        Type::FLOAT4 => {
                            let v: f32 = s.parse().unwrap_or(0.0);
                            v.to_sql(ty, out)
                        },
                        Type::FLOAT8 => {
                            let v: f64 = s.parse().unwrap_or(0.0);
                            v.to_sql(ty, out)
                        },
                        // Decimal / Numeric
                        Type::NUMERIC => {
                            let v = s.parse::<rust_decimal::Decimal>()
                                .unwrap_or(rust_decimal::Decimal::from(0));
                            v.to_sql(ty, out)
                        },
                        // UUID
                        Type::UUID => {
                            if let Ok(u) = Uuid::parse_str(s) {
                                u.to_sql(ty, out)
                            } else {
                                Err(format!("invalid UUID parameter: {}", s).into())
                            }
                        },
                        // Date
                        Type::DATE => {
                            let d = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                                .or_else(|_| chrono::NaiveDate::parse_from_str(&s[..10.min(s.len())], "%Y-%m-%d"))
                                .or_else(|_| chrono::NaiveDate::parse_from_str(s, "%Y/%m/%d"));
                            if let Ok(val) = d {
                                val.to_sql(ty, out)
                            } else {
                                s.to_sql(&Type::TEXT, out)
                            }
                        },
                        // Timestamp without timezone
                        Type::TIMESTAMP => {
                            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                                dt.to_sql(ty, out)
                            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                                dt.to_sql(ty, out)
                            } else {
                                s.to_sql(&Type::TEXT, out)
                            }
                        },
                        // Timestamp with timezone
                        Type::TIMESTAMPTZ => {
                            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                                let utc: DateTime<Utc> = dt.with_timezone(&Utc);
                                utc.to_sql(ty, out)
                            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                                let utc = DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc);
                                utc.to_sql(ty, out)
                            } else {
                                s.to_sql(&Type::TEXT, out)
                            }
                        },
                        // Time without timezone
                        Type::TIME => {
                            if let Ok(t) = NaiveTime::parse_from_str(s, "%H:%M:%S%.f") {
                                t.to_sql(ty, out)
                            } else if let Ok(t) = NaiveTime::parse_from_str(s, "%H:%M") {
                                t.to_sql(ty, out)
                            } else {
                                // Güvenli fallback: geçersiz/bozuk zamanın 22008 üretmesini engelle
                                NaiveTime::from_hms_opt(9, 0, 0).unwrap().to_sql(ty, out)
                            }
                        },
                        // JSONB / JSON
                        Type::JSONB | Type::JSON => {
                            let v: serde_json::Value = serde_json::from_str(s)
                                .unwrap_or(serde_json::Value::String(s.clone()));
                            v.to_sql(ty, out)
                        },
                        // Anything else: send as text (PG will cast via ::type if query uses it)
                        _ => {
                            s.to_sql(&Type::TEXT, out)
                        }
                    }
                },

                // ── Num (Decimal) ──────────────────────────────────────
                QueryParam::Num(n) => {
                    if is_text_type {
                        n.to_string().to_sql(ty, out)
                    } else {
                        match *ty {
                            Type::INT2 => { let v = n.to_string().parse::<i16>().unwrap_or(0); v.to_sql(ty, out) },
                            Type::INT4 | Type::OID => { let v = n.to_string().parse::<i32>().unwrap_or(0); v.to_sql(ty, out) },
                            Type::INT8 => { let v = n.to_string().parse::<i64>().unwrap_or(0); v.to_sql(ty, out) },
                            Type::FLOAT4 => { let v = n.to_string().parse::<f32>().unwrap_or(0.0); v.to_sql(ty, out) },
                            Type::FLOAT8 => { let v = n.to_string().parse::<f64>().unwrap_or(0.0); v.to_sql(ty, out) },
                            _ => n.to_sql(ty, out)
                        }
                    }
                },

                // ── Bool ───────────────────────────────────────────────
                QueryParam::Bool(b) => {
                    if is_text_type {
                        b.to_string().to_sql(ty, out)
                    } else {
                        b.to_sql(ty, out)
                    }
                },
            }
        }

        fn accepts(_ty: &tokio_postgres::types::Type) -> bool {
            true // We handle conversion internally in to_sql
        }

        fn to_sql_checked(&self, ty: &tokio_postgres::types::Type, out: &mut bytes::BytesMut) -> Result<tokio_postgres::types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
            self.to_sql(ty, out)
        }
    }

    let mut query_params = Vec::new();
    for p in params {
        query_params.push(json_value_to_query_param(p));
    }

    let params_to_sql: Vec<&(dyn ToSql + Sync)> = query_params
        .iter()
        .map(|p| p as &(dyn ToSql + Sync))
        .collect();

    let _serial = state.query_serial.lock().await;
    let client = acquire_pg_client(state.inner(), &conn_str).await?;
    let rows = match timeout(PG_QUERY_TIMEOUT, client.query(&sql, &params_to_sql)).await {
        Ok(Ok(rows)) => rows,
        Ok(Err(e)) => {
            invalidate_pg_cache(state.inner(), &conn_str).await;
            let mut msg = e.to_string();
            if let Some(db_err) = e.as_db_error() {
                msg = format!(
                    "PG Error {}: {} | Detail: {} | Hint: {}",
                    db_err.code().code(),
                    db_err.message(),
                    db_err.detail().unwrap_or("yok"),
                    db_err.hint().unwrap_or("yok"),
                );
            }
            return Err(msg);
        }
        Err(_) => {
            invalidate_pg_cache(state.inner(), &conn_str).await;
            return Err(format!(
                "SQL sorgusu zaman aşımı ({} sn). Başka bir işlem veritabanını meşgul ediyor olabilir.",
                PG_QUERY_TIMEOUT.as_secs()
            ));
        }
    };

    let mut results = Vec::new();
    for row in rows {
        let mut map = serde_json::Map::new();
        for (i, column) in row.columns().iter().enumerate() {
            let name = column.name().to_string();
            let value: serde_json::Value = if let Ok(v) = row.try_get::<_, Option<serde_json::Value>>(i) {
                match v { Some(jv) => jv, None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<String>>(i) {
                match v { Some(s) => serde_json::Value::String(s), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<rust_decimal::Decimal>>(i) {
                match v { Some(d) => serde_json::Value::Number(serde_json::Number::from_f64(d.to_f64().unwrap_or(0.0)).unwrap_or(serde_json::Number::from(0))), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<Uuid>>(i) {
                match v { Some(u) => serde_json::Value::String(u.to_string()), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<chrono::NaiveDate>>(i) {
                match v { Some(d) => serde_json::Value::String(d.to_string()), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<chrono::NaiveTime>>(i) {
                match v {
                    Some(t) => serde_json::Value::String(t.format("%H:%M:%S").to_string()),
                    None => serde_json::Value::Null,
                }
            } else if let Ok(v) = row.try_get::<_, Option<chrono::NaiveDateTime>>(i) {
                match v { Some(dt) => serde_json::Value::String(dt.to_string()), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<DateTime<Utc>>>(i) {
                match v { Some(dt) => serde_json::Value::String(dt.to_rfc3339()), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<i32>>(i) {
                match v { Some(n) => serde_json::Value::Number(serde_json::Number::from(n)), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<i64>>(i) {
                match v { Some(n) => serde_json::Value::Number(serde_json::Number::from(n)), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<f64>>(i) {
                match v { Some(n) => serde_json::Value::Number(serde_json::Number::from_f64(n).unwrap_or(serde_json::Number::from(0))), None => serde_json::Value::Null }
            } else if let Ok(v) = row.try_get::<_, Option<bool>>(i) {
                match v { Some(b) => serde_json::Value::Bool(b), None => serde_json::Value::Null }
            } else {
                 serde_json::Value::Null
            };
            map.insert(name, value);
        }
        results.push(serde_json::Value::Object(map));
    }

    serde_json::to_string(&results).map_err(|e| e.to_string())
}


#[tauri::command]
fn get_system_id() -> String {
    machine_uid::get().unwrap_or("UNKNOWN-HWID".to_string())
}

#[tauri::command]
fn get_os_username() -> String {
    std::env::var("USERNAME").unwrap_or_else(|_| {
        std::env::var("USER").unwrap_or_else(|_| "Bilinmeyen Kullanıcı".to_string())
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfoPayload {
    pub device_id: String,
    pub computer_name: String,
    pub os_user: String,
    pub os_platform: String,
    pub os_arch: String,
    pub os_version: String,
    pub app_version: String,
    pub local_ip: Option<String>,
    pub timezone: String,
    pub locale: String,
    pub cpu_cores: Option<u32>,
    pub collected_at: String,
}

fn detect_local_ip() -> Option<String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip().to_string())
}

fn detect_os_version() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("OS").unwrap_or_else(|_| "Windows".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::consts::OS.to_string()
    }
}

#[tauri::command]
fn get_device_info() -> DeviceInfoPayload {
    let device_id = machine_uid::get().unwrap_or_else(|_| "UNKNOWN-HWID".to_string());
    let computer_name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "UNKNOWN-PC".to_string());
    let os_user = get_os_username();
    let cpu_cores = std::thread::available_parallelism().ok().map(|n| n.get() as u32);

    DeviceInfoPayload {
        device_id,
        computer_name: computer_name.clone(),
        os_user,
        os_platform: std::env::consts::OS.to_string(),
        os_arch: std::env::consts::ARCH.to_string(),
        os_version: detect_os_version(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        local_ip: detect_local_ip(),
        timezone: std::env::var("TZ").unwrap_or_else(|_| "local".to_string()),
        locale: std::env::var("LANG")
            .or_else(|_| std::env::var("LC_ALL"))
            .unwrap_or_else(|_| "tr-TR".to_string()),
        cpu_cores,
        collected_at: chrono::Utc::now().to_rfc3339(),
    }
}

#[derive(serde::Serialize)]
struct TableSchema {
    table_ddl: String,
    type_ddls: Vec<String>,
    sequence_ddls: Vec<String>,
}

#[tauri::command]
async fn get_supabase_table_schema(project_ref: String, token: String, table_name: String) -> Result<TableSchema, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    // 1. Get column information
    let sql = format!("
        SELECT column_name, data_type, udt_name, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = '{}' AND table_schema = 'public'
        ORDER BY ordinal_position", table_name);

    let res = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Columns): {}", err_text));
    }

    let cols: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let cols_array = cols.as_array().ok_or("Invalid response format")?;
    
    if cols_array.is_empty() {
        return Err(format!("Table '{}' not found or has no columns", table_name));
    }

    // 1.5 Get Primary Key information
    let pk_sql = format!("
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = '{}' AND tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position", table_name);

    let res_pk = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": pk_sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut pk_cols = Vec::new();
    if res_pk.status().is_success() {
        if let Ok(pk_data) = res_pk.json::<serde_json::Value>().await {
            if let Some(pk_array) = pk_data.as_array() {
                for pk in pk_array {
                    if let Some(name) = pk["column_name"].as_str() {
                        pk_cols.push(format!("\"{}\"", name));
                    }
                }
            }
        }
    }

    let mut user_defined_types = Vec::new();
    let mut table_ddl_parts = Vec::new();

    for col in cols_array {
        let name = col["column_name"].as_str().unwrap_or("");
        let mut dtype = col["data_type"].as_str().unwrap_or("text").to_string();
        let udt_name = col["udt_name"].as_str().unwrap_or("text");
        
        if dtype.to_uppercase() == "ARRAY" {
            if udt_name.starts_with('_') {
                dtype = format!("{}[]", &udt_name[1..]);
            } else {
                dtype = format!("{}[]", udt_name);
            }
        } else if dtype.to_uppercase() == "USER-DEFINED" {
            dtype = udt_name.to_string();
            user_defined_types.push(udt_name.to_string());
        }
        
        let nullable = col["is_nullable"].as_str().unwrap_or("YES");
        let default_val = col["column_default"].as_str();
        
        let mut def = format!("    \"{}\" {}", name, dtype);
        if nullable == "NO" { def.push_str(" NOT NULL"); }
        if let Some(d) = default_val { def.push_str(&format!(" DEFAULT {}", d)); }
        table_ddl_parts.push(def);
    }

    if !pk_cols.is_empty() {
        table_ddl_parts.push(format!("    PRIMARY KEY ({})", pk_cols.join(", ")));
    }

    let table_ddl = format!("CREATE TABLE IF NOT EXISTS public.\"{}\" (\n{}\n);", 
        table_name, 
        table_ddl_parts.join(",\n")
    );

    // 2. Resolve custom types (enums)
    let mut type_ddls = Vec::new();
    if !user_defined_types.is_empty() {
        let types_list = user_defined_types.iter().map(|t| format!("'{}'", t)).collect::<Vec<_>>().join(",");
        let types_sql = format!("
            SELECT 
                t.typname as type_name,
                n.nspname as schema_name,
                array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname IN ({})
            GROUP BY t.typname, n.nspname", types_list);

        let res_types = client.post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "query": types_sql }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res_types.status().is_success() {
            if let Ok(types_data) = res_types.json::<serde_json::Value>().await {
                if let Some(types_array) = types_data.as_array() {
                    for t in types_array {
                        let type_name = t["type_name"].as_str().unwrap_or("");
                        let schema_name = t["schema_name"].as_str().unwrap_or("public");
                        let values = t["enum_values"].as_array().map(|arr| {
                            arr.iter().map(|v| format!("'{}'", v.as_str().unwrap_or(""))).collect::<Vec<_>>().join(", ")
                        }).unwrap_or_default();
                        
                        if !type_name.is_empty() && !values.is_empty() {
                            let type_ddl = format!(
                                "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '{}' AND n.nspname = '{}') THEN CREATE TYPE \"{}\".\"{}\" AS ENUM ({}); END IF; END $$;",
                                type_name, schema_name, schema_name, type_name, values
                            );
                            type_ddls.push(type_ddl);
                        }
                    }
                }
            }
        }
    }

    // 3. Resolve sequences
    let mut sequence_ddls = Vec::new();
    let seq_sql = format!("
        SELECT 
            s.sequence_name,
            s.start_value,
            s.increment,
            s.minimum_value,
            s.maximum_value
        FROM information_schema.sequences s
        WHERE s.sequence_schema = 'public'
        AND EXISTS (
            SELECT 1 FROM information_schema.columns c 
            WHERE c.table_name = '{}' AND c.table_schema = 'public'
            AND c.column_default LIKE '%' || s.sequence_name || '%'
        )", table_name);

    let res_seqs = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": seq_sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res_seqs.status().is_success() {
        if let Ok(seqs_data) = res_seqs.json::<serde_json::Value>().await {
            if let Some(seqs_array) = seqs_data.as_array() {
                for s in seqs_array {
                    let name = s["sequence_name"].as_str().unwrap_or("");
                    let start = s["start_value"].as_str().unwrap_or("1");
                    let inc = s["increment"].as_str().unwrap_or("1");
                    if !name.is_empty() {
                        let seq_ddl = format!(
                            "CREATE SEQUENCE IF NOT EXISTS public.\"{}\" START WITH {} INCREMENT BY {};",
                            name, start, inc
                        );
                        sequence_ddls.push(seq_ddl);
                    }
                }
            }
        }
    }

    Ok(TableSchema { table_ddl, type_ddls, sequence_ddls })
}

#[tauri::command]
async fn execute_supabase_sql(project_ref: String, token: String, sql: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası: {}", err_text));
    }

    Ok("Success".to_string())
}

#[tauri::command]
async fn get_supabase_table_ddl(project_ref: String, token: String, table_name: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    // SQL to get column information
    let sql = format!("
        SELECT column_name, data_type, udt_name, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = '{}' AND table_schema = 'public'
        ORDER BY ordinal_position", table_name);

    let res = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası: {}", err_text));
    }

    let cols: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let cols_array = cols.as_array().ok_or("Invalid response format")?;
    
    if cols_array.is_empty() {
        return Err(format!("Table '{}' not found or has no columns", table_name));
    }

    // Get Primary Key information
    let pk_sql = format!("
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = '{}' AND tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position", table_name);

    let res_pk = client.post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": pk_sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut pk_cols = Vec::new();
    if res_pk.status().is_success() {
        if let Ok(pk_data) = res_pk.json::<serde_json::Value>().await {
            if let Some(pk_array) = pk_data.as_array() {
                for pk in pk_array {
                    if let Some(name) = pk["column_name"].as_str() {
                        pk_cols.push(format!("\"{}\"", name));
                    }
                }
            }
        }
    }

    let mut ddl = format!("CREATE TABLE IF NOT EXISTS public.\"{}\" (\n", table_name);
    let mut parts = Vec::new();

    for col in cols_array {
        let name = col["column_name"].as_str().unwrap_or("");
        let mut dtype = col["data_type"].as_str().unwrap_or("text").to_string();
        let udt_name = col["udt_name"].as_str().unwrap_or("text");
        
        if dtype.to_uppercase() == "ARRAY" {
            if udt_name.starts_with('_') {
                dtype = format!("{}[]", &udt_name[1..]);
            } else {
                dtype = format!("{}[]", udt_name);
            }
        } else if dtype.to_uppercase() == "USER-DEFINED" {
            dtype = udt_name.to_string();
        }
        
        let nullable = col["is_nullable"].as_str().unwrap_or("YES");
        let default_val = col["column_default"].as_str();
        
        let mut def = format!("    \"{}\" {}", name, dtype);
        if nullable == "NO" { def.push_str(" NOT NULL"); }
        if let Some(d) = default_val { def.push_str(&format!(" DEFAULT {}", d)); }
        parts.push(def);
    }

    if !pk_cols.is_empty() {
        parts.push(format!("    PRIMARY KEY ({})", pk_cols.join(", ")));
    }

    ddl.push_str(&parts.join(",\n"));
    ddl.push_str("\n);");

    Ok(ddl)
}

#[tauri::command]
async fn list_supabase_projects(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.supabase.com/v1/projects")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let json = res.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        let status = res.status();
        let err_body = res.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Supabase API Hatası ({}): {}", status, err_body))
    }
}

#[tauri::command]
async fn get_supabase_functions(project_ref: String, token: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Functions): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let defs = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| r["definition"].as_str().unwrap_or("").to_string())
        .filter(|n| !n.is_empty())
        .collect();

    Ok(defs)
}

#[tauri::command]
async fn get_supabase_views(project_ref: String, token: String) -> Result<Vec<(String, String)>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "SELECT viewname, definition FROM pg_views WHERE schemaname = 'public'";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Views): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let views = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| (
            r["viewname"].as_str().unwrap_or("").to_string(),
            r["definition"].as_str().unwrap_or("").to_string()
        ))
        .filter(|(n, _)| !n.is_empty())
        .collect();

    Ok(views)
}

#[tauri::command]
async fn get_supabase_triggers(project_ref: String, token: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "SELECT pg_get_triggerdef(oid) as definition FROM pg_trigger WHERE tgisinternal = false";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Triggers): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let defs = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| r["definition"].as_str().unwrap_or("").to_string())
        .filter(|n| !n.is_empty())
        .collect();

    Ok(defs)
}

#[tauri::command]
async fn get_supabase_policies(project_ref: String, token: String) -> Result<Vec<(String, String, bool)>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    // Get policies and table RLS status
    let sql = "
        WITH policies AS (
            SELECT 
                tablename,
                'CREATE POLICY \"' || policyname || '\" ON \"public\".\"' || tablename || 
                '\" FOR ' || cmd || ' TO ' || (SELECT string_agg(r, ',') FROM unnest(roles) r) || 
                ' USING (' || qual || ')' || 
                CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END as definition
            FROM pg_policies
            WHERE schemaname = 'public'
        ),
        rls_status AS (
            SELECT relname as table_name, relrowsecurity as rls_enabled
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
        )
        SELECT r.table_name, p.definition, r.rls_enabled
        FROM rls_status r
        LEFT JOIN policies p ON r.table_name = p.tablename";

    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası (Policies): {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let policies = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| (
            r["table_name"].as_str().unwrap_or("").to_string(),
            r["definition"].as_str().unwrap_or("").to_string(),
            r["rls_enabled"].as_bool().unwrap_or(false)
        ))
        .collect();

    Ok(policies)
}

#[tauri::command]
async fn get_supabase_tables(project_ref: String, token: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    let sql = "SELECT table_name::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name";
    
    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": sql }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
        return Err(format!("Supabase API Hatası: {}", err_text));
    }

    let rows: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let table_names = rows.as_array()
        .ok_or("Invalid response format")?
        .iter()
        .map(|r| r["table_name"].as_str().unwrap_or("").to_string())
        .filter(|n| !n.is_empty())
        .collect();

    Ok(table_names)
}

#[tauri::command]
async fn dump_supabase_to_sql(window: tauri::Window, project_ref: String, token: String, output_path: String, tables_only: Option<bool>) -> Result<String, String> {
    let skip_data = tables_only.unwrap_or(false);
    use std::fs::File;
    use std::io::Write;
    use std::collections::HashMap;

    let client = reqwest::Client::new();
    let url = format!("https://api.supabase.com/v1/projects/{}/database/query", project_ref);

    async fn fetch_supabase_query(client: &reqwest::Client, url: &str, token: &str, sql: &str) -> Result<serde_json::Value, String> {
        let res = client.post(url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "query": sql }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
                let err_text = res.text().await.unwrap_or_else(|_| "Unknown API Error".to_string());
                return Err(format!("Supabase API Hatası: {}", err_text));
        }
        res.json::<serde_json::Value>().await.map_err(|e| e.to_string())
    }

    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut sql_dump = String::new();
    sql_dump.push_str("-- AsinERP Supabase SQL Dump (API Mode)\n");
    sql_dump.push_str(&format!("-- Generated at: {}\n\n", chrono::Utc::now().to_rfc3339()));

    let _ = window.emit("supabase-dump-progress", "Tablo şemaları analizi yapılıyor...");

    let sql_tables = "
        SELECT t.table_schema, t.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default, c.ordinal_position 
        FROM information_schema.tables t 
        JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast') 
          AND t.table_type = 'BASE TABLE' 
        ORDER BY t.table_schema, t.table_name, c.ordinal_position";
    
    let rows_val = fetch_supabase_query(&client, &url, &token, sql_tables).await?;
    let rows = rows_val.as_array().ok_or("Invalid API response format (expected array)")?;

    let mut table_columns: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    let mut table_order: Vec<String> = Vec::new(); 
    let mut discovered_schemas: Vec<String> = Vec::new();

    for row in rows {
        let schema = row["table_schema"].as_str().unwrap_or("public").to_string();
        let table = row["table_name"].as_str().unwrap_or("unknown").to_string();
        let full_table_name = format!("{}.{}", schema, table);

        if !discovered_schemas.contains(&schema) && schema != "public" {
            discovered_schemas.push(schema.clone());
        }

        if !table_columns.contains_key(&full_table_name) {
            table_order.push(full_table_name.clone());
            table_columns.insert(full_table_name.clone(), Vec::new());
        }
        if let Some(cols) = table_columns.get_mut(&full_table_name) {
             cols.push(row.clone());
        }
    }

    for schema in discovered_schemas {
        sql_dump.push_str(&format!("CREATE SCHEMA IF NOT EXISTS {};\n", schema));
    }
    sql_dump.push_str("\n");

    // Get Custom ENUM Types
    let _ = window.emit("supabase-dump-progress", "Özel veri tipleri (ENUM) analiz ediliyor...");
    let enum_sql = "
        SELECT n.nspname AS schema, t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        GROUP BY n.nspname, t.typname";
    
    if let Ok(enums_val) = fetch_supabase_query(&client, &url, &token, enum_sql).await {
        if let Some(enums) = enums_val.as_array() {
            for enm in enums {
                let schema = enm["schema"].as_str().unwrap_or("public");
                let name = enm["name"].as_str().unwrap_or("");
                let labels = enm["labels"].as_array().map(|arr| {
                    arr.iter().map(|l| format!("'{}'", l.as_str().unwrap_or(""))).collect::<Vec<_>>().join(", ")
                }).unwrap_or_default();
                sql_dump.push_str("DO $$ BEGIN\n");
                sql_dump.push_str(&format!("    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '{}' AND n.nspname = '{}') THEN\n", name, schema));
                sql_dump.push_str(&format!("        CREATE TYPE {}.\"{}\" AS ENUM ({});\n", schema, name, labels));
                sql_dump.push_str("    END IF;\n");
                sql_dump.push_str("END $$;\n");
            }
        }
    }
    sql_dump.push_str("\n");

    // Get SEQUENCES
    let _ = window.emit("supabase-dump-progress", "Sayı dizileri (SEQUENCES) analiz ediliyor...");
    let seq_sql = "
        SELECT sequence_schema, sequence_name, start_value, minimum_value, maximum_value, increment
        FROM information_schema.sequences
        WHERE sequence_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')";
    
    if let Ok(seqs_val) = fetch_supabase_query(&client, &url, &token, seq_sql).await {
        if let Some(seqs) = seqs_val.as_array() {
            for seq in seqs {
                let schema = seq["sequence_schema"].as_str().unwrap_or("public");
                let name = seq["sequence_name"].as_str().unwrap_or("");
                let start = seq["start_value"].as_str().unwrap_or("1");
                let inc = seq["increment"].as_str().unwrap_or("1");
                sql_dump.push_str(&format!("CREATE SEQUENCE IF NOT EXISTS {}.\"{}\" START WITH {} INCREMENT BY {};\n", schema, name, start, inc));
            }
        }
    }
    sql_dump.push_str("\n");

    let total_tables = table_order.len();
    for (idx, full_table_name) in table_order.iter().enumerate() {
        let _ = window.emit("supabase-dump-progress", format!("Tablo işleniyor ({}/{}): {}...", idx + 1, total_tables, full_table_name));
        sql_dump.push_str(&format!("CREATE TABLE IF NOT EXISTS {} (\n", full_table_name));
        let cols = &table_columns[full_table_name];
        let mut col_defs = Vec::new();
        let mut col_names = Vec::new();
        for col in cols {
            let name = col["column_name"].as_str().unwrap_or("");
            col_names.push(name.to_string());
            let mut dtype = col["data_type"].as_str().unwrap_or("text").to_string();
            let udt_name = col["udt_name"].as_str().unwrap_or("text");
            
            if dtype.to_uppercase() == "ARRAY" {
                if udt_name.starts_with('_') {
                    dtype = format!("{}[]", &udt_name[1..]);
                } else {
                    dtype = format!("{}[]", udt_name);
                }
            } else if dtype.to_uppercase() == "USER-DEFINED" {
                dtype = udt_name.to_string();
                if dtype == "hstore" { dtype = "text".to_string(); } // Fallback for unsupported extensions
            }
            
            let nullable = col["is_nullable"].as_str().unwrap_or("YES");
            let default_val = col["column_default"].as_str();
            let mut def = format!("    \"{}\" {}", name, dtype);
            if nullable == "NO" { def.push_str(" NOT NULL"); }
            if let Some(d) = default_val { def.push_str(&format!(" DEFAULT {}", d)); }
            col_defs.push(def);
        }
        sql_dump.push_str(&col_defs.join(",\n"));

        // Get Primary Keys for dump
        let pk_sql = format!("
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = '{}' AND tc.table_schema = '{}' AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position", cols[0]["table_name"].as_str().unwrap_or(""), cols[0]["table_schema"].as_str().unwrap_or("public"));
        
        if let Ok(pk_val) = fetch_supabase_query(&client, &url, &token, &pk_sql).await {
            if let Some(pk_array) = pk_val.as_array() {
                if !pk_array.is_empty() {
                    let pks = pk_array.iter()
                        .map(|pk| format!("\"{}\"", pk["column_name"].as_str().unwrap_or("")))
                        .collect::<Vec<_>>()
                        .join(", ");
                    sql_dump.push_str(&format!(",\n    PRIMARY KEY ({})", pks));
                }
            }
        }

        sql_dump.push_str("\n);\n\n");
        if !skip_data {
            let sql_data = format!("SELECT * FROM {}", full_table_name);
            if let Ok(data_rows_val) = fetch_supabase_query(&client, &url, &token, &sql_data).await {
                if let Some(data_rows) = data_rows_val.as_array() {
                    if !data_rows.is_empty() {
                        for row_obj in data_rows {
                            if let Some(row_map) = row_obj.as_object() {
                                let mut values = Vec::new();
                                let mut valid_cols = Vec::new();
                                 for (c_idx, col_name) in col_names.iter().enumerate() {
                                     let val_json = row_map.get(col_name).unwrap_or(&serde_json::Value::Null);
                                     
                                     // Get metadata for this column to determine cast
                                     let col_meta = &cols[c_idx];
                                     let udt_name = col_meta["udt_name"].as_str().unwrap_or("text");
                                     let data_type = col_meta["data_type"].as_str().unwrap_or("text");

                                     let mut val_str = match val_json {
                                         serde_json::Value::Null => "NULL".to_string(),
                                         serde_json::Value::Number(n) => n.to_string(),
                                         serde_json::Value::String(s) => format!("'{}'", s.replace("'", "''")),
                                         serde_json::Value::Bool(b) => b.to_string(),
                                         serde_json::Value::Array(arr) => {
                                             let mut elements = Vec::new();
                                             for item in arr {
                                                 match item {
                                                     serde_json::Value::String(s) => elements.push(format!("'{}'", s.replace("'", "''"))),
                                                     serde_json::Value::Null => elements.push("NULL".to_string()),
                                                     _ => elements.push(item.to_string()),
                                                 }
                                             }
                                             
                                             // Cast the array itself if it's a known type
                                             if data_type.to_uppercase() == "ARRAY" {
                                                let inner_type = if udt_name.starts_with('_') { &udt_name[1..] } else { udt_name };
                                                format!("ARRAY[{}]::{}[]", elements.join(", "), inner_type)
                                             } else {
                                                format!("ARRAY[{}]", elements.join(", "))
                                             }
                                         },
                                         serde_json::Value::Object(_) => format!("'{}'", val_json.to_string().replace("'", "''")),
                                     };

                                     // Apply explicit casting for values that often need them (UUID, JSONB, etc)
                                     if val_json != &serde_json::Value::Null && data_type.to_uppercase() != "ARRAY" {
                                         match udt_name {
                                             "uuid" => { val_str = format!("{}::uuid", val_str); },
                                             "jsonb" => { val_str = format!("{}::jsonb", val_str); },
                                             "json" => { val_str = format!("{}::json", val_str); },
                                             "timestamptz" => { val_str = format!("{}::timestamptz", val_str); },
                                             "timestamp" => { val_str = format!("{}::timestamp", val_str); },
                                             _ => {}
                                         }
                                     }

                                     values.push(val_str);
                                     valid_cols.push(format!("\"{}\"", col_name));
                                 }
                                sql_dump.push_str(&format!("INSERT INTO {} ({}) VALUES ({});\n", full_table_name, valid_cols.join(", "), values.join(", ")));
                            }
                        }
                        sql_dump.push_str("\n");
                    }
                }
            }
        }
    }

    let mut file = File::create(&output_path).map_err(|e| e.to_string())?;
    file.write_all(sql_dump.as_bytes()).map_err(|e| e.to_string())?;
    Ok(output_path)
}

#[tauri::command]
async fn pg_execute_file(state: tauri::State<'_, DbState>, conn_str: String, file_path: String) -> Result<String, String> {
    let sql = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    pg_execute(state, conn_str, sql).await
}

/// Ağ termal (ham socket, çoğu 9100): ESC/POS baytlarını doğrudan yazıcıya gönderir.
#[tauri::command]
async fn print_escpos_tcp(host: String, port: u16, data_b64: String) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpStream;
    use std::time::Duration;

    let host = host.trim().to_string();
    if host.is_empty() {
        return Err("Yazıcı adresi (IP/host) boş.".into());
    }
    let data = STANDARD
        .decode(data_b64.trim())
        .map_err(|e| format!("Base64 çözümü: {}", e))?;
    if data.is_empty() {
        return Err("ESC/POS verisi boş.".into());
    }
    let addr = format!("{}:{}", host, port);
    let mut stream = tokio::time::timeout(Duration::from_secs(8), TcpStream::connect(&addr))
        .await
        .map_err(|_| format!("Bağlantı zaman aşımı (8 sn): {}", addr))?
        .map_err(|e| format!("TCP {}: {}", addr, e))?;
    stream.set_nodelay(true).map_err(|e| e.to_string())?;
    tokio::time::timeout(Duration::from_secs(15), stream.write_all(&data))
        .await
        .map_err(|_| "Gönderim zaman aşımı (15 sn).".to_string())?
        .map_err(|e| format!("Yazdırma gönderimi: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn write_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_system_printers() -> Result<Vec<serde_json::Value>, String> {
    #[cfg(windows)]
    {
    let ps_script = r#"
        Get-Printer | Select-Object Name, PrinterStatus, Type, DriverName, PortName | ConvertTo-Json
    "#;

    let output = Command::new("powershell")
        .args(["-Command", ps_script])
        .platform_no_window() 
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.trim().is_empty() {
             return Ok(vec![]);
        }
        let printers: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
        
        if printers.is_array() {
            Ok(printers.as_array().unwrap().clone())
        } else if printers.is_object() {
            Ok(vec![printers])
        } else {
            Ok(vec![])
        }
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
    }

    #[cfg(not(windows))]
    {
        let output = Command::new("lpstat")
            .args(["-p"])
            .output()
            .map_err(|e| format!("lpstat calistirilamadi: {}", e))?;
        if !output.status.success() {
            return Ok(vec![]);
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let printers: Vec<serde_json::Value> = stdout
            .lines()
            .filter_map(|line| {
                let name = line.strip_prefix("printer ")?.split_whitespace().next()?;
                Some(serde_json::json!({ "Name": name, "Type": "CUPS" }))
            })
            .collect();
        Ok(printers)
    }
}

/// Windows varsayılan yazıcı adı (Sumatra `-print-to-default` bazı termal sürücülerde güvenilir değil).
#[cfg(windows)]
fn get_default_printer_name_windows() -> Option<String> {
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    // UTF-8: Türkçe / Arapça yazıcı adları için
    let ps = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); (Get-Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)";
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            ps,
        ])
        .platform_no_window()
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// `printer_name` doluysa onu kullan; değilse Windows varsayılan yazıcı adını çöz (fiziksel yazıcı için gerekli).
#[cfg(windows)]
fn resolve_target_printer_name(printer_name: Option<String>) -> Option<String> {
    let trimmed = printer_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if trimmed.is_some() {
        return trimmed;
    }
    get_default_printer_name_windows()
}

/// Sessiz yazdırma için SumatraPDF.exe yolu: `RETEX_SUMATRA_EXE`, Tauri Resource, `resource_dir` varyantları,
/// `tauri dev` çıktısı (`target/.../resources/sumatra`), sistem kurulumu.
#[cfg(windows)]
fn resolve_sumatra_pdf_exe(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use std::path::PathBuf;

    let try_file = |p: PathBuf| -> Option<PathBuf> { p.is_file().then_some(p) };

    if let Ok(s) = std::env::var("RETEX_SUMATRA_EXE") {
        let p = PathBuf::from(s.trim());
        if let Some(x) = try_file(p) {
            return Some(x);
        }
    }

    for rel in ["sumatra/SumatraPDF.exe", "resources/sumatra/SumatraPDF.exe"] {
        if let Ok(p) = app.path().resolve(rel, BaseDirectory::Resource) {
            if let Some(x) = try_file(p) {
                return Some(x);
            }
        }
    }

    if let Ok(rd) = app.path().resource_dir() {
        let tails: &[&[&str]] = &[
            &["sumatra", "SumatraPDF.exe"],
            &["resources", "sumatra", "SumatraPDF.exe"],
            &["_up_", "resources", "sumatra", "SumatraPDF.exe"],
        ];
        for tail in tails {
            let p = tail.iter().fold(rd.clone(), |acc, s| acc.join(s));
            if let Some(x) = try_file(p) {
                return Some(x);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in [&["resources", "sumatra", "SumatraPDF.exe"][..], &["sumatra", "SumatraPDF.exe"][..]] {
                let p = rel.iter().fold(dir.to_path_buf(), |acc, s| acc.join(s));
                if let Some(x) = try_file(p) {
                    return Some(x);
                }
            }
        }
    }

    for sys in [
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
    ] {
        if let Some(x) = try_file(PathBuf::from(sys)) {
            return Some(x);
        }
    }

    None
}

/// Windows: Edge headless ile PDF üret; ardından SumatraPDF varsa sessiz yazdır (cmd/WebView önizlemesi yok).
/// Sumatra yoksa PDF için sistem yazdırma iletişim kutusu açılır (WebView2 önizleme hatasından kaçınır).
#[cfg(windows)]
fn print_html_via_edge_windows(
    html: String,
    printer_name: Option<String>,
    sumatra_exe: Option<std::path::PathBuf>,
) -> Result<(), String> {
    use std::env;
    use std::fs::File;
    use std::io::Write;
    use std::path::PathBuf;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    fn find_edge() -> Option<PathBuf> {
        let candidates = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ];
        for p in candidates {
            let pb = PathBuf::from(p);
            if pb.is_file() {
                return Some(pb);
            }
        }
        let mut w = Command::new("where");
        w.arg("msedge.exe");
        w.platform_no_window();
        if let Ok(out) = w.output() {
            if out.status.success() {
                let line = String::from_utf8_lossy(&out.stdout).lines().next().unwrap_or("").trim().to_string();
                if !line.is_empty() {
                    return Some(PathBuf::from(line));
                }
            }
        }
        None
    }

    fn path_to_file_url(path: &std::path::Path) -> Result<String, String> {
        let s = path.to_str().ok_or("Geçersiz dosya yolu")?;
        let u = s.replace('\\', "/");
        if u.len() >= 2 && u.chars().nth(1) == Some(':') {
            Ok(format!("file:///{}", u))
        } else {
            Ok(format!("file:///{}", u))
        }
    }

    fn find_chrome_for_print() -> Option<PathBuf> {
        let candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ];
        for p in candidates {
            let pb = PathBuf::from(p);
            if pb.is_file() {
                return Some(pb);
            }
        }
        let mut w = Command::new("where");
        w.arg("chrome.exe");
        w.platform_no_window();
        if let Ok(out) = w.output() {
            if out.status.success() {
                let line = String::from_utf8_lossy(&out.stdout).lines().next().unwrap_or("").trim().to_string();
                if !line.is_empty() {
                    return Some(PathBuf::from(line));
                }
            }
        }
        None
    }

    /// Headless Chromium: PDF oluşana kadar bekle (Edge bazen süreç bittikten sonra diske yazar).
    fn run_headless_print_to_pdf(
        browser_exe: &Path,
        headless_arg: &str,
        user_data_dir: &Path,
        pdf_path: &Path,
        file_url: &str,
        disable_gpu: bool,
    ) -> Result<(), String> {
        use std::thread;
        use std::time::Duration;

        let pdf_path_str = pdf_path.to_str().ok_or("Geçersiz PDF yolu")?;
        let profile_str = user_data_dir.to_str().ok_or("Geçersiz tarayıcı profil yolu")?;
        let _ = std::fs::create_dir_all(user_data_dir);

        // 302 ≈ 80mm @96dpi — geniş pencerede PDF sayfası A4 kalıp termalde küçük/yanlış ölçeklenebiliyor
        let mut args: Vec<String> = vec![
            headless_arg.to_string(),
            "--window-size=302,8192".into(),
            "--force-device-scale-factor=1".into(),
        ];
        if disable_gpu {
            args.push("--disable-gpu".into());
        }
        args.extend([
            "--no-first-run".into(),
            "--no-default-browser-check".into(),
            "--disable-extensions".into(),
            "--disable-component-extensions-with-background-pages".into(),
            "--disable-background-networking".into(),
            "--disable-sync".into(),
            "--disable-translate".into(),
            "--mute-audio".into(),
            "--no-sandbox".into(),
            "--disable-popup-blocking".into(),
            "--disable-hang-monitor".into(),
            "--disable-ipc-flooding-protection".into(),
            "--disable-renderer-backgrounding".into(),
            "--disable-prompt-on-repost".into(),
            "--disable-features=TranslateUI".into(),
            "--metrics-recording-only".into(),
            "--disable-logging".into(),
            format!("--user-data-dir={}", profile_str),
            format!("--print-to-pdf={}", pdf_path_str),
            "--no-pdf-header-footer".into(),
            "--virtual-time-budget=20000".into(),
            file_url.to_string(),
        ]);

        let mut cmd = Command::new(browser_exe);
        cmd.args(&args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.platform_no_window();

        let out = cmd
            .output()
            .map_err(|e| format!("Tarayıcı başlatılamadı ({}): {}", browser_exe.display(), e))?;

        let stderr_lossy = String::from_utf8_lossy(&out.stderr);
        let stdout_lossy = String::from_utf8_lossy(&out.stdout);

        // PDF bazen birkaç yüz ms sonra oluşur
        for _ in 0..100 {
            if pdf_path.is_file() {
                if let Ok(meta) = pdf_path.metadata() {
                    if meta.len() > 64 {
                        return Ok(());
                    }
                }
            }
            thread::sleep(Duration::from_millis(200));
        }

        let code = out.status.code();
        Err(format!(
            "{} PDF üretilemedi. exit={:?} | stderr: {} | stdout: {}",
            browser_exe.display(),
            code,
            stderr_lossy.chars().take(1600).collect::<String>(),
            stdout_lossy.chars().take(400).collect::<String>()
        ))
    }

    let temp_dir = env::temp_dir();
    let file_id = uuid::Uuid::new_v4();
    let html_path = temp_dir.join(format!("receipt_{}.html", file_id));
    let pdf_path = temp_dir.join(format!("receipt_{}.pdf", file_id));

    let mut file = File::create(&html_path).map_err(|e| e.to_string())?;
    file.write_all(html.as_bytes()).map_err(|e| e.to_string())?;

    let pdf_path_str = pdf_path.to_str().ok_or("Geçersiz PDF yolu")?;
    let file_url = path_to_file_url(&html_path)?;

    // Her fiş için ayrı user-data-dir: paylaşılan profilde kilit / çökme sonrası Edge PDF üretmeyebiliyor.
    let profile_base = temp_dir.join(format!("retailex_edge_print_{}", file_id));
    let _ = std::fs::create_dir_all(&profile_base);

    let mut pdf_err: Option<String> = None;

    if let Some(edge) = find_edge() {
        let p1 = profile_base.join("a");
        match run_headless_print_to_pdf(&edge, "--headless=new", &p1, &pdf_path, &file_url, true) {
            Ok(()) => pdf_err = None,
            Err(e1) => {
                let _ = std::fs::remove_file(&pdf_path);
                let p2 = profile_base.join("b");
                match run_headless_print_to_pdf(&edge, "--headless", &p2, &pdf_path, &file_url, false) {
                    Ok(()) => pdf_err = None,
                    Err(e2) => {
                        pdf_err = Some(format!("Edge (headless=new): {} | Edge (headless): {}", e1, e2));
                    }
                }
            }
        }
    }

    let pdf_ok_len = || pdf_path.is_file() && pdf_path.metadata().map(|m| m.len()).unwrap_or(0) > 64;
    if pdf_err.is_some() || !pdf_ok_len() {
        if let Some(chrome) = find_chrome_for_print() {
            let _ = std::fs::remove_file(&pdf_path);
            let p3 = profile_base.join("c");
            match run_headless_print_to_pdf(&chrome, "--headless", &p3, &pdf_path, &file_url, true) {
                Ok(()) => pdf_err = None,
                Err(e3) => {
                    let prev = pdf_err
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .unwrap_or("Edge PDF üretilemedi.");
                    pdf_err = Some(format!("{} | Chrome: {}", prev, e3));
                }
            }
        }
    }

    if pdf_err.is_some() || !pdf_ok_len() {
        let _ = std::fs::remove_file(&html_path);
        return Err(
            pdf_err
                .unwrap_or_else(|| "Edge/Chrome ile PDF oluşturulamadı. Microsoft Edge veya Google Chrome kurulu olmalı.".into()),
        );
    }

    let _ = std::fs::remove_file(&html_path);

    let target_printer = resolve_target_printer_name(printer_name);

    if let Some(sumatra) = sumatra_exe.filter(|p| p.is_file()) {
        // Her zaman -exit-on-print: Sumatra çok erken çıkınca kuyruk bazen boş kalıyor (sessiz yol «çalışmıyor» gibi).
        let mut s = Command::new(&sumatra);
        s.platform_no_window();
        s.stdin(Stdio::null());
        s.stdout(Stdio::null());
        s.stderr(Stdio::null());
        // portrait bazı Sumatra sürümlerinde dar PDF ile sorun çıkarabiliyor; noscale yeterli.
        match &target_printer {
            Some(name) => {
                s.arg("-print-to")
                    .arg(name)
                    .arg("-print-settings")
                    .arg("noscale")
                    .arg("-silent")
                    .arg("-exit-on-print")
                    .arg(pdf_path_str);
            }
            None => {
                s.arg("-print-to-default")
                    .arg("-print-settings")
                    .arg("noscale")
                    .arg("-silent")
                    .arg("-exit-on-print")
                    .arg(pdf_path_str);
            }
        }
        let st = s.status().map_err(|e| e.to_string())?;
        if !st.success() {
            return Err(
                "SumatraPDF sessiz yazdırma başarısız. Yazıcı adı / Sumatra sürümü / sürücü kuyruğunu kontrol edin."
                    .into(),
            );
        }
    } else {
        let _ = std::fs::remove_file(&pdf_path);
        return Err(
            "SumatraPDF.exe bulunamadı; PDF önizlemesi açmadan yazdırmak mümkün değil. \
Projede kök dizinde `npm run sumatra:fetch` çalıştırıp uygulamayı yeniden derleyin, SumatraPDF kurun veya \
RETEX_SUMATRA_EXE ortam değişkeniyle SumatraPDF.exe tam yolunu verin."
                .into(),
        );
    }

    let pdf_path_clone = pdf_path.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        let _ = std::fs::remove_file(pdf_path_clone);
    });

    Ok(())
}

#[tauri::command]
async fn print_html_silent(
    app: tauri::AppHandle,
    html: String,
    printer_name: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let sumatra_exe = resolve_sumatra_pdf_exe(&app);
        tokio::task::spawn_blocking(move || {
            print_html_via_edge_windows(html, printer_name, sumatra_exe)
        })
        .await
        .map_err(|e| format!("Yazdırma görevi: {}", e))?
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Fiş yazdırma bu platformda desteklenmiyor.".into())
    }
}

#[tauri::command]
async fn verify_license(key: String) -> Result<license::LicenseInfo, String> {
    Ok(license::LicenseManager::check_license(&key))
}

fn check_bootstrap_config(app: &tauri::AppHandle) {
    let bootstrap_path = if config::is_portable_mode() {
        config::get_app_data_dir().join("bootstrap.json")
    } else {
        app.path()
            .app_config_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from(r"C:\AsinERP"))
            .join("bootstrap.json")
    };
    if bootstrap_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&bootstrap_path) {
            if let Ok(bootstrap_config) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Ok(mut config) = config::get_app_config(app.clone()) {
                    if let Some(ws) = bootstrap_config.get("central_ws_url").and_then(|v| v.as_str()) {
                        config.central_ws_url = ws.to_string();
                    }
                    if let Some(amqp) = bootstrap_config.get("amqp_url").and_then(|v| v.as_str()) {
                        config.amqp_url = amqp.to_string();
                    }
                    if let Some(l_user) = bootstrap_config.get("logo_objects_user").and_then(|v| v.as_str()) {
                        config.logo_objects_user = l_user.to_string();
                    }
                    if let Some(l_pass) = bootstrap_config.get("logo_objects_pass").and_then(|v| v.as_str()) {
                        config.logo_objects_pass = l_pass.to_string();
                    }
                    if let Some(l_path) = bootstrap_config.get("logo_objects_path").and_then(|v| v.as_str()) {
                        config.logo_objects_path = l_path.to_string();
                    }
                    if let Some(l_active) = bootstrap_config.get("logo_objects_active").and_then(|v| v.as_bool()) {
                        config.logo_objects_active = l_active;
                    }
                    if let Some(cp) = bootstrap_config.get("connection_provider").and_then(|v| v.as_str()) {
                        if !cp.trim().is_empty() {
                            config.connection_provider = cp.to_string();
                        }
                    }
                    if let Some(rest) = bootstrap_config.get("remote_rest_url").and_then(|v| v.as_str()) {
                        if !rest.trim().is_empty() {
                            config.remote_rest_url = rest.to_string();
                        }
                    }
                    if let Some(mode) = bootstrap_config.get("db_mode").and_then(|v| v.as_str()) {
                        if !mode.trim().is_empty() {
                            config.db_mode = mode.to_string();
                        }
                    }
                    let _ = config::save_app_config(app.clone(), config);
                    let _ = std::fs::remove_file(bootstrap_path);
                }
            }
        }
    }
}

fn main() {
    if let Err(msg) = portable_bind::enforce_portable_volume_binding() {
        eprintln!("[portable_bind] {msg}");
        let _ = native_dialog::MessageDialog::new()
            .set_title("AsinERP — Disk bağlama")
            .set_text(&msg)
            .set_type(native_dialog::MessageType::Error)
            .show_alert();
        std::process::exit(2);
    }

    tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
        let handle = app.handle();
        let _ = config::init_config_db();
        let _ = db::init_db(&handle);
        ensure_bridge_service(&handle);

        app.manage(DbState {
            inner: Arc::new(Mutex::new(DbConnection {
                client: None,
                conn_str: None,
            })),
            query_serial: Arc::new(Mutex::new(())),
        });
        app.manage(caller_id_serial::CallerSerialHandle::default());
        
        check_bootstrap_config(&handle);

        sync::touch_app_ui_heartbeat();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(20)).await;
                sync::touch_app_ui_heartbeat();
            }
        });

        let (sync_service, rx) = BackgroundSyncService::new();
        app.manage(sync::SyncSender(sync_service.get_sender()));
        sync_service.start(Some(handle.clone()), rx);

        let app_handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(mut config) = config::get_app_config(app_handle.clone()) {
                // Auto-Migration on Startup
                if config.is_configured {
                    println!("🚀 Startup: Checking for pending database migrations...");
                    let app_version = app_handle.package_info().version.to_string();
                    match db_ops::apply_migrations_internal(&app_handle, &config, None, None, app_version).await {
                        Ok(msg) => println!("✅ Startup Migrations: {}", msg),
                        Err(e) => eprintln!("❌ Startup Migration Error: {}", e),
                    }
                    
                }

                let _ = config::save_app_config(app_handle.clone(), config.clone());
            }
        });
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        check_pg16, install_pg16, get_system_id, get_os_username, get_device_info,
        list_supabase_projects, get_supabase_tables, execute_supabase_sql, get_supabase_table_ddl, get_supabase_table_schema,
        get_supabase_functions, get_supabase_views, get_supabase_triggers, get_supabase_policies,
        dump_supabase_to_sql, pg_execute_file,
        pg_query, pg_execute, read_init_sqls,
        db_ops::create_database, db_ops::run_migrations, db_ops::open_migration_log, db_ops::diagnose_schema_gaps_cmd, db_ops::init_firm_schema, db_ops::init_period_schema, db_ops::check_db_status, db_ops::get_db_version,
        db_ops::pg_execute_supabase_dump,
        sync::send_websocket_message, sync::announce_node, sync::get_last_sync_info, sync::mpos_pull_master_now,
        sync::consume_pending_kasa_data_arrival,
        sync::list_kasa_service_sync_history,
        verify_license, check_update_status,

        maintenance::compact_database, security::verify_token,
        logger::log_from_frontend, logger::log_crud_error,
        config::get_app_config, config::save_app_config,
        config::get_dashboard_shortcuts, config::save_dashboard_shortcuts, config::reset_dashboard_shortcuts,
        backup_service::perform_manual_backup, backup_service::export_full_postgres_dump, list_system_printers, write_bytes, print_html_silent, print_escpos_tcp,
        mssql::test_mssql_connection, mssql::list_mssql_databases, mssql::get_logo_firms, mssql::get_logo_periods, mssql::get_logo_data_preview, mssql::sync_logo_data, mssql::sync_logo_delta,
        sync::enable_remote_support,
        bank_ops::get_bank_registers, bank_ops::save_bank_register, bank_ops::get_bank_transactions, bank_ops::save_bank_transaction,
        request_elevation,
        remove_retailex_windows_services,
        delete_c_retailex_folder,
        show_touch_keyboard,
        caller_id_serial::list_caller_serial_ports,
        caller_id_serial::caller_serial_start,
        caller_id_serial::caller_serial_stop,
        rongta_scale::rongta_scale_test,
        rongta_scale::rongta_scale_send_plu,
        rongta_scale::rongta_scale_fetch_sales
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, event| {
        if let tauri::RunEvent::Exit = event {
            sync::clear_app_ui_heartbeat();
        }
    });
}


/// Windows: Dokunmatik klavyeyi (TabTip) açar. Tauri WebView'da input focus'ta klavye açılmıyorsa frontend bu komutu çağırır.
#[tauri::command]
async fn show_touch_keyboard() -> Result<(), String> {
    #[cfg(windows)]
    {
        let tabtip = r"C:\Program Files\Common Files\microsoft shared\ink\TabTip.exe";
        if std::path::Path::new(tabtip).exists() {
            let _ = Command::new(tabtip)
                .platform_no_window() // CREATE_NO_WINDOW
                .spawn();
        }
    }
    #[cfg(not(windows))]
    {
        let _ = ();
    }
    Ok(())
}

/// Elle kurulum veri klasorunu siler: once `C:\AsinERP`, yoksa eski `C:\RetailEX` / `C:\RetailEx`.
#[tauri::command]
fn delete_c_retailex_folder() -> Result<String, String> {
    #[cfg(windows)]
    {
        let candidates = [r"C:\AsinERP", r"C:\RetailEX", r"C:\RetailEx"];
        let mut removed: Vec<String> = Vec::new();
        for c in candidates {
            let p = std::path::Path::new(c);
            if !p.exists() {
                continue;
            }
            std::fs::remove_dir_all(p).map_err(|e| {
                format!(
                    "{} silinemedi: {} (klasor baska programda acik olabilir veya yonetici gerekir)",
                    c, e
                )
            })?;
            removed.push(format!("{} silindi", c));
        }
        if removed.is_empty() {
            return Ok("C:\\AsinERP (veya eski C:\\RetailEX) bulunmuyor; atlandi.".into());
        }
        Ok(removed.join("; "))
    }
    #[cfg(not(windows))]
    {
        Err("Yalnizca Windows.".into())
    }
}

/// Fabrika sifirlama / "Yeniden kurulum": AsinERP Windows hizmetlerini durdurur ve kaldir (yonetici gerekebilir).
#[tauri::command]
fn remove_retailex_windows_services() -> Result<String, String> {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const SC: &str = r"C:\Windows\System32\sc.exe";

        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or("calisma dizini cozulemedi")?
            .to_path_buf();

        let pairs: &[(&str, &str)] = &[
            ("AsinERP_Service.exe", "AsinERP_Service"),
            ("AsinERP_SQL_Bridge.exe", "AsinERP_SQL_Bridge"),
            ("AsinERP_Printer.exe", "AsinERP_Printer"),
            ("AsinERP_Logo.exe", "AsinERP_Logo"),
            ("AsinERP_Logo_Connector.exe", "AsinERPLogoConnector"),
            // Eski kurulum adlari (yukseltme / fabrika sifirlama)
            ("RetailEX_Service.exe", "RetailEX_Service"),
            ("RetailEX_SQL_Bridge.exe", "RetailEX_SQL_Bridge"),
            ("RetailEX_Printer.exe", "RetailEX_Printer"),
            ("RetailEX_Logo.exe", "RetailEX_Logo"),
            ("RetailEX_Logo_Connector.exe", "RetailEXLogoConnector"),
        ];

        let mut lines: Vec<String> = Vec::new();
        for (exe_name, svc_name) in pairs {
            let exe_path = exe_dir.join(exe_name);
            let _ = Command::new(SC)
                .args(["stop", svc_name])
                .platform_no_window()
                .output();

            if exe_path.exists() {
                match Command::new(&exe_path)
                    .arg("--uninstall")
                    .platform_no_window()
                    .output()
                {
                    Ok(o) => {
                        let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
                        lines.push(format!(
                            "{} --uninstall: exit={}{}",
                            exe_name,
                            o.status,
                            if stderr.is_empty() {
                                String::new()
                            } else {
                                format!(" ({})", stderr)
                            }
                        ));
                        if !o.status.success() {
                            let del = Command::new(SC)
                                .args(["delete", svc_name])
                                .platform_no_window()
                                .output();
                            if let Ok(d) = del {
                                lines.push(format!(
                                    "  -> sc delete {}: {}",
                                    svc_name,
                                    String::from_utf8_lossy(&d.stderr).trim()
                                ));
                            }
                        }
                    }
                    Err(e) => lines.push(format!("{} --uninstall: {}", exe_name, e)),
                }
            } else {
                let del = Command::new(SC)
                    .args(["delete", svc_name])
                    .platform_no_window()
                    .output();
                match del {
                    Ok(o) => lines.push(format!(
                        "{} (exe yok): sc delete exit={} {}",
                        svc_name,
                        o.status,
                        String::from_utf8_lossy(&o.stderr).trim()
                    )),
                    Err(e) => lines.push(format!("{} sc delete: {}", svc_name, e)),
                }
            }
        }

        Ok(lines.join("\n"))
    }
    #[cfg(not(windows))]
    {
        Err("Yalnizca Windows masaustu uygulamasinda.".into())
    }
}

#[tauri::command]
async fn request_elevation() -> Result<(), String> {
    #[cfg(windows)]
    {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let path = current_exe.to_str().ok_or("Invalid executable path")?;

    println!("Elevation requested for: {}", path);

    let script = format!(
        "Start-Process -FilePath '{}' -Verb RunAs",
        path
    );

    Command::new("powershell")
        .args(["-Command", &script])
        .platform_no_window() // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Failed to spawn elevation process: {}", e))?;

    Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("Yonetici yukseltme yalnizca Windows'ta desteklenir.".into())
    }
}



/// Kurulum (NSIS) `INSTDIR` icine bridge.cjs + package.json koyar; `install-bridge.ps1` burada
/// servisi BOZMAMALI — AsinERP_SQL_Bridge.exe saricisi ImagePath'te kalir. Sadece eksik npm deps.
fn ensure_bridge_service(_handle: &tauri::AppHandle) {
    let Some(exe) = std::env::current_exe().ok() else {
        return;
    };
    let Some(dir) = exe.parent().map(|p| p.to_path_buf()) else {
        return;
    };
    if !dir.join("bridge.cjs").exists() || !dir.join("package.json").exists() {
        return;
    }
    if dir.join("node_modules").join("pg").exists() {
        return;
    }
    println!("🛠️ Startup: SQL Bridge node_modules eksik; npm install deneniyor ({})", dir.display());
    #[cfg(windows)]
    let npm_cmd = {
        let candidates = [
            std::path::PathBuf::from(r"C:\Program Files\nodejs\npm.cmd"),
            std::path::PathBuf::from(r"C:\Program Files (x86)\nodejs\npm.cmd"),
        ];
        candidates.into_iter().find(|p| p.exists()).or_else(|| {
            // PATH'te npm (kurulum sonrasi PATH guncellenmis olabilir)
            Some(std::path::PathBuf::from("npm.cmd"))
        })
    };
    #[cfg(not(windows))]
    let npm_cmd = Some(std::path::PathBuf::from("npm"));
    let Some(npm_cmd) = npm_cmd else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let out = Command::new(npm_cmd)
            .args(["install", "--omit=dev", "--no-audit", "--prefix"])
            .arg(&dir)
            .platform_no_window()
            .output();
        match out {
            Ok(o) if o.status.success() => println!("✅ SQL Bridge npm deps tamam."),
            Ok(o) => eprintln!(
                "⚠️ SQL Bridge npm install cikis {}: {}",
                o.status,
                String::from_utf8_lossy(&o.stderr)
            ),
            Err(e) => eprintln!("⚠️ SQL Bridge npm: {}", e),
        }
    });
}

#[tauri::command]
async fn check_update_status() -> Result<String, String> {
    Ok("GitHub updater: releases/latest/download/latest.json".to_string())
}
