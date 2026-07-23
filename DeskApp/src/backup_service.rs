use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use crate::config::{AppConfig, get_app_config};

// Helper to parse DB name from connection string "host:port/dbname"
fn parse_db_name(conn_str: &str) -> String {
    if let Some(pos) = conn_str.rfind('/') {
        if pos + 1 < conn_str.len() {
            return conn_str[pos + 1..].to_string();
        }
    }
    "retailex_local".to_string()
}

fn parse_pg_host_port_db(db_path: &str) -> (String, u16, String) {
    let host_part = db_path.split(':').next().unwrap_or("127.0.0.1").to_string();
    let host_port_str = db_path.split('/').next().unwrap_or("127.0.0.1:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };
    let db_name = db_path
        .split('/')
        .last()
        .unwrap_or("retailex_local")
        .to_string();
    (host_part, port, db_name)
}

fn resolve_pg_dump_exe() -> Result<PathBuf, String> {
    let candidates = [
        r"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        r"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        r"C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
        r"C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
    ];
    for p in candidates {
        if Path::new(p).is_file() {
            return Ok(PathBuf::from(p));
        }
    }
    let probe = Command::new("pg_dump").arg("--version").output();
    if probe.map(|o| o.status.success()).unwrap_or(false) {
        return Ok(PathBuf::from("pg_dump"));
    }
    Err(
        "pg_dump bulunamadı. PostgreSQL istemci araçlarını (ör. 15–17) kurun veya PATH'e ekleyin.".to_string(),
    )
}

fn backup_target_dir(config: &AppConfig) -> PathBuf {
    config
        .backup_config
        .as_ref()
        .map(|b| b.backup_path.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if crate::config::is_portable_mode() {
                crate::config::get_backups_dir()
            } else {
                PathBuf::from(r"C:\AsinERP_Backups")
            }
        })
}

/// Sistem ayarlarından: `db_mode == online` ise uzak PG, aksi halde yerel (hibritte yerel şube yedeği).
#[tauri::command]
pub fn export_full_postgres_dump(app_handle: AppHandle) -> Result<String, String> {
    let config = get_app_config(app_handle)?;
    export_full_postgres_dump_internal(&config)
}

pub fn export_full_postgres_dump_internal(config: &AppConfig) -> Result<String, String> {
    let use_remote = config.db_mode.trim().eq_ignore_ascii_case("online");
    let (db_path, user, pass) = if use_remote {
        (&config.remote_db, &config.pg_remote_user, &config.pg_remote_pass)
    } else {
        (&config.local_db, &config.pg_local_user, &config.pg_local_pass)
    };

    let (host, port, db_name) = parse_pg_host_port_db(db_path);
    let pg_dump = resolve_pg_dump_exe()?;

    let backup_dir = backup_target_dir(config);
    if !backup_dir.exists() {
        std::fs::create_dir_all(&backup_dir)
            .map_err(|e| format!("Yedek klasörü oluşturulamadı: {}", e))?;
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let safe_stub = parse_db_name(db_path).replace(['/', '\\', ':'], "_");
    let filename = format!("{}_{}_full.sql", safe_stub, timestamp);
    let file_path = backup_dir.join(&filename);

    let output = Command::new(&pg_dump)
        .env("PGPASSWORD", pass)
        .arg("-h")
        .arg(&host)
        .arg("-p")
        .arg(port.to_string())
        .arg("-U")
        .arg(user)
        .arg("-F")
        .arg("p")
        .arg("--no-owner")
        .arg("--no-acl")
        .arg("-f")
        .arg(&file_path)
        .arg(&db_name)
        .output()
        .map_err(|e| format!("pg_dump çalıştırılamadı: {}", e))?;

    if output.status.success() {
        Ok(format!(
            "Tam yedek oluşturuldu ({}): {}",
            if use_remote { "uzak" } else { "yerel" },
            file_path.to_string_lossy()
        ))
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("pg_dump hatası: {}", err))
    }
}

#[tauri::command]
pub fn perform_manual_backup(app_handle: AppHandle) -> Result<String, String> {
    let config = get_app_config(app_handle.clone())?;
    BackupService::perform_backup_internal(config)
}

pub struct BackupService;

impl BackupService {
    pub fn perform_backup_internal(mut config: AppConfig) -> Result<String, String> {
        if let Some(ref mut backup_conf) = config.backup_config {
            if !backup_conf.enabled {
                return Err("Yedekleme devre dışı.".to_string());
            }

            let backup_path_str = if backup_conf.backup_path.trim().is_empty() {
                if crate::config::is_portable_mode() {
                    crate::config::get_backups_dir().to_string_lossy().to_string()
                } else {
                    r"C:\AsinERP_Backups".to_string()
                }
            } else {
                backup_conf.backup_path.clone()
            };

            let backup_dir = PathBuf::from(&backup_path_str);

            if !backup_dir.exists() {
                std::fs::create_dir_all(&backup_dir)
                    .map_err(|e| format!("Klasör oluşturulamadı: {}", e))?;
            }

            let db_name = parse_db_name(&config.local_db);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();

            let filename = format!("{}_{}_backup.sql", db_name, timestamp);
            let file_path = backup_dir.join(&filename);

            let (host, port, db_only) = parse_pg_host_port_db(&config.local_db);
            let pg_dump = resolve_pg_dump_exe()?;

            println!("Starting backup for {} to {:?}", db_name, file_path);

            let output = Command::new(&pg_dump)
                .env("PGPASSWORD", &config.pg_local_pass)
                .arg("-h")
                .arg(&host)
                .arg("-p")
                .arg(port.to_string())
                .arg("-U")
                .arg(&config.pg_local_user)
                .arg("-F")
                .arg("p")
                .arg("-f")
                .arg(&file_path)
                .arg(&db_only)
                .output()
                .map_err(|e| format!("pg_dump çalıştırılamadı: {}", e))?;

            if output.status.success() {
                println!("Backup successful: {:?}", file_path);

                backup_conf.last_run = Some(timestamp.to_string());

                use crate::config::save_app_config_internal;
                save_app_config_internal(config)?;

                Ok(format!("Yedekleme başarılı: {}", file_path.to_string_lossy()))
            } else {
                let err = String::from_utf8_lossy(&output.stderr);
                Err(format!("Yedekleme hatası: {}", err))
            }
        } else {
            Err("Yedekleme yapılandırması bulunamadı.".to_string())
        }
    }
}
