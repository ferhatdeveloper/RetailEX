#[path = "config.rs"]
mod config;

// Mock vpn module for config to satisfy imports when built as standalone
mod vpn {
    use serde::{Serialize, Deserialize};
    #[derive(Debug, Serialize, Deserialize, Clone, Default)]
    pub struct VpnConfig {
        pub private_key: String,
        pub public_key: String,
        pub listen_port: u16,
        pub virtual_ip: String,
        pub endpoint: Option<String>,
        pub enable_discovery: bool,
    }
}

use rusqlite::{params, Connection};
use std::path::{PathBuf, Path};
use native_dialog::{MessageDialog, FileDialog};
use base64::{Engine as _, engine::general_purpose};
use config::AppConfig;

slint::include_modules!();

fn encode_base64(s: &str) -> String {
    if s.is_empty() { return String::new(); }
    general_purpose::STANDARD.encode(s)
}

fn get_config_db_path() -> PathBuf {
    let app_dir = PathBuf::from("C:\\RetailEx");
    if !app_dir.exists() {
        let _ = std::fs::create_dir_all(&app_dir);
    }
    app_dir.join("config.db")
}

fn main() -> anyhow::Result<()> {
    let ui = SetupWindow::new()?;

    if let Ok(curr) = std::env::current_dir() {
        ui.set_setup_path(curr.to_string_lossy().to_string().into());
    }

    ui.on_select_folder({
        let handle = ui.as_weak();
        move || {
            if let Some(ui) = handle.upgrade() {
                if let Ok(Some(path)) = FileDialog::new().show_open_single_dir() {
                    ui.set_setup_path(path.to_string_lossy().to_string().into());
                }
            }
        }
    });

    ui.on_install_local({
        let handle = ui.as_weak();
        move || {
            if let Some(ui) = handle.upgrade() {
                let path_str = ui.get_setup_path().to_string();
                let path = Path::new(&path_str);
                
                ui.set_status_msg("Scanning for installers...".into());
                
                if let Some(exe) = scan_for_file(path, "postgresql") {
                    ui.set_status_msg("Installing PostgreSQL...".into());
                    let _ = std::process::Command::new(exe)
                        .args(["--mode", "unattended", "--superpassword", "Yq7xwQpt6c", "--servicepassword", "Yq7xwQpt6c"])
                        .status();
                }

                if let Some(msi) = scan_for_file(path, "redis") {
                    ui.set_status_msg("Installing Redis...".into());
                    let _ = std::process::Command::new("msiexec.exe")
                        .args(["/i", &msi.to_string_lossy(), "/quiet"])
                        .status();
                }

                if let Some(exe) = scan_for_file(path, "erlang") {
                    ui.set_status_msg("Installing Erlang...".into());
                    let _ = std::process::Command::new(exe).arg("/S").status();
                }

                if let Some(exe) = scan_for_file(path, "rabbitmq") {
                    ui.set_status_msg("Installing RabbitMQ...".into());
                    let _ = std::process::Command::new(exe).arg("/S").status();
                }

                ui.set_status_msg("Scan & Install cycle completed.".into());
            }
        }
    });

    ui.on_save_config({
        let handle = ui.as_weak();
        move || {
            if let Some(ui) = handle.upgrade() {
                if let Err(e) = save_config(&ui) {
                    ui.set_status_msg(format!("Error: {}", e).into());
                } else {
                    ui.set_status_msg("Configuration applied successfully!".into());
                    let _ = MessageDialog::new()
                        .set_title("Success")
                        .set_text("RetailEX initialized. You can now launch the app.")
                        .show_confirm();
                }
            }
        }
    });

    ui.run()?;
    Ok(())
}

fn scan_for_file(dir: &Path, pattern: &str) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let filename = path.file_name()?.to_string_lossy().to_lowercase();
                if filename.contains(pattern) {
                    if let Some(ext) = path.extension() {
                        let ext_low = ext.to_string_lossy().to_lowercase();
                        if ext_low == "exe" || ext_low == "msi" {
                            return Some(path);
                        }
                    }
                }
            }
        }
    }
    None
}

fn save_config(ui: &SetupWindow) -> anyhow::Result<()> {
    let db_path = get_config_db_path();
    let conn = Connection::open(db_path)?;

    conn.execute("CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, data TEXT NOT NULL)", [])?;

    let mut config = AppConfig::default();
    config.is_configured = true;
    config.terminal_name = ui.get_terminal_name().to_string();
    config.store_id = ui.get_store_id().to_string();
    config.role = ui.get_role().to_string();
    config.db_mode = ui.get_db_mode().to_string();
    
    config.pg_local_pass = encode_base64(&config.pg_local_pass);
    config.pg_remote_pass = encode_base64(&config.pg_remote_pass);
    config.erp_pass = encode_base64(&config.erp_pass);

    let json = serde_json::to_string(&config)?;
    conn.execute("INSERT INTO config (id, data) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data = ?1", params![json])?;

    Ok(())
}
