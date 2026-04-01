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

fn decode_base64(s: &str) -> String {
    if s.is_empty() { return String::new(); }
    match general_purpose::STANDARD.decode(s) {
        Ok(bytes) => String::from_utf8(bytes).unwrap_or_else(|_| s.to_string()),
        Err(_) => s.to_string(),
    }
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

    if let Ok(cfg) = load_config() {
        ui.set_terminal_name(cfg.terminal_name.into());
        ui.set_store_id(cfg.store_id.into());
        ui.set_role(cfg.role.into());
        ui.set_db_mode(cfg.db_mode.into());
        ui.set_logo_active(cfg.logo_objects_active);
        ui.set_logo_user(cfg.logo_objects_user.into());
        ui.set_logo_pass(cfg.logo_objects_pass.into());
        ui.set_logo_path(cfg.logo_objects_path.into());
        if let Some(backup) = cfg.backup_config {
            ui.set_backup_enabled(backup.enabled);
            ui.set_backup_period_min(backup.periodic_min.to_string().into());
        }
    }

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

    ui.on_browse_logo_dll({
        let handle = ui.as_weak();
        move || {
            if let Some(ui) = handle.upgrade() {
                if let Ok(Some(path)) = FileDialog::new()
                    .add_filter("DLL", &["dll"])
                    .show_open_single_file()
                {
                    ui.set_logo_path(path.to_string_lossy().to_string().into());
                }
            }
        }
    });

    ui.on_install_services({
        let handle = ui.as_weak();
        move || {
            if let Some(ui) = handle.upgrade() {
                match install_services_nearby() {
                    Ok(msg) => ui.set_status_msg(msg.into()),
                    Err(e) => ui.set_status_msg(format!("Service error: {}", e).into()),
                }
            }
        }
    });

    ui.on_check_services({
        let handle = ui.as_weak();
        move || {
            if let Some(ui) = handle.upgrade() {
                match get_services_health() {
                    Ok(msg) => ui.set_status_msg(msg.into()),
                    Err(e) => ui.set_status_msg(format!("Health error: {}", e).into()),
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
    config.logo_objects_active = ui.get_logo_active();
    config.logo_objects_user = ui.get_logo_user().to_string();
    config.logo_objects_pass = encode_base64(&ui.get_logo_pass().to_string());
    config.logo_objects_path = ui.get_logo_path().to_string();
    if let Some(mut backup) = config.backup_config.clone() {
        backup.enabled = ui.get_backup_enabled();
        backup.periodic_min = ui.get_backup_period_min().parse::<i32>().unwrap_or(30);
        config.backup_config = Some(backup);
    }
    
    config.pg_local_pass = encode_base64(&config.pg_local_pass);
    config.pg_remote_pass = encode_base64(&config.pg_remote_pass);
    config.erp_pass = encode_base64(&config.erp_pass);

    let json = serde_json::to_string(&config)?;
    conn.execute("INSERT INTO config (id, data) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data = ?1", params![json])?;

    Ok(())
}

fn load_config() -> anyhow::Result<AppConfig> {
    let db_path = get_config_db_path();
    let conn = Connection::open(db_path)?;
    conn.execute("CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, data TEXT NOT NULL)", [])?;
    let mut stmt = conn.prepare("SELECT data FROM config WHERE id = 1")?;
    let json: String = stmt.query_row([], |row| row.get(0))?;
    let mut cfg: AppConfig = serde_json::from_str(&json)?;
    cfg.logo_objects_pass = decode_base64(&cfg.logo_objects_pass);
    Ok(cfg)
}

fn install_services_nearby() -> anyhow::Result<String> {
    let exe = std::env::current_exe()?;
    let base = exe.parent().ok_or_else(|| anyhow::anyhow!("Install dir not found"))?;
    let svc = base.join("RetailEX_Service.exe");
    let vpn = base.join("RetailEX_VPN.exe");
    let bridge_exe = base.join("RetailEX_SQL_Bridge.exe");
    let bridge = base.join("install-bridge.ps1");

    if svc.exists() {
        let _ = std::process::Command::new(&svc).arg("--install").status();
        let _ = std::process::Command::new("sc").args(["start", "RetailEX_Service"]).status();
    }
    if vpn.exists() {
        let _ = std::process::Command::new(&vpn).arg("--install").status();
        let _ = std::process::Command::new("sc").args(["start", "RetailEX_VPN"]).status();
    }
    if bridge_exe.exists() {
        let _ = std::process::Command::new(&bridge_exe).arg("--install").status();
        let _ = std::process::Command::new("sc").args(["start", "RetailEX_SQL_Bridge"]).status();
    } else if bridge.exists() {
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &bridge.to_string_lossy()])
            .status();
    }
    Ok("Servis kurulum islemleri tetiklendi. Yonetici olarak calistirdiginizdan emin olun.".to_string())
}

fn get_services_health() -> anyhow::Result<String> {
    let script = "Get-Service -Name RetailEX_Service,RetailEX_VPN,RetailEX_SQL_Bridge -ErrorAction SilentlyContinue | Select-Object Name,Status | Format-Table -HideTableHeaders";
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()?;
    if out.status.success() {
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if text.is_empty() {
            Ok("Servis bulunamadi.".to_string())
        } else {
            Ok(text)
        }
    } else {
        Err(anyhow::anyhow!(String::from_utf8_lossy(&out.stderr).to_string()))
    }
}
