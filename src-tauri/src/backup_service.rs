use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use crate::config::{AppConfig, get_app_config};

// Helper to parse DB name from connection string "host:port/dbname"
fn parse_db_name(conn_str: &str) -> String {
    if let Some(pos) = conn_str.rfind('/') {
        if pos + 1 < conn_str.len() {
            return conn_str[pos+1..].to_string();
        }
    }
    "retailex_local".to_string() // Fallback
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

            // 1. Prepare Target Directory
            let backup_path_str = if backup_conf.backup_path.trim().is_empty() {
                "C:\\RetailEX_Backups".to_string()
            } else {
                backup_conf.backup_path.clone()
            };
            
            let backup_dir = PathBuf::from(&backup_path_str);

            if !backup_dir.exists() {
                std::fs::create_dir_all(&backup_dir).map_err(|e| format!("Klasör oluşturulamadı: {}", e))?;
            }

            // 2. Format Filename
            let db_name = parse_db_name(&config.local_db);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            
            let filename = format!("{}_{}_backup.sql", db_name, timestamp);
            let file_path = backup_dir.join(&filename);

            // 3. Command Construction (pg_dump)
            // Ideally should find pg_dump path. For now assuming PATH.
            println!("Starting backup for {} to {:?}", db_name, file_path);
            
            let output = Command::new("pg_dump")
                .env("PGPASSWORD", &config.pg_local_pass)
                .arg("-h").arg("localhost")
                .arg("-p").arg("5432") 
                .arg("-U").arg(&config.pg_local_user)
                .arg("-F").arg("p") // Plain SQL
                .arg("-f").arg(&file_path)
                .arg(&db_name)
                .output()
                .map_err(|e| format!("pg_dump çalıştırılamadı: {}", e))?;

            if output.status.success() {
                println!("Backup successful: {:?}", file_path);
                
                // Update last run time
                backup_conf.last_run = Some(timestamp.to_string());
                
                // Save updated config using INTERNAL method (no AppHandle needed)
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
