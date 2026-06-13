#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! RetailEX Terazi Köprüsü — kurulum sihirbazı ve yönetim arayüzü başlatıcısı.
//! Varsayılan: Windows servisini başlatır ve http://127.0.0.1:3012/ui/ açar.

use std::env;
use std::path::PathBuf;
use std::process::Command;

const SERVICE_NAME: &str = "RetailEX_Scale_Bridge";
const BRIDGE_EXE: &str = "RetailEX_Scale_Bridge.exe";
const UI_URL: &str = "http://127.0.0.1:3012/ui/";
const CONFIG_DIR: &str = "C:\\ProgramData\\RetailEX";

fn main() {
    if let Err(e) = run() {
        eprintln!("RetailEX_ScaleBridge_Manager error: {}", e);
        let _ = native_dialog::MessageDialog::new()
            .set_title("RetailEX Terazi Köprüsü")
            .set_text(&format!("Hata: {}", e))
            .show_alert();
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let install_dir = resolve_install_dir()?;
    let bridge_exe = install_dir.join(BRIDGE_EXE);

    if !bridge_exe.exists() {
        return Err(format!(
            "{} bulunamadı. Kurulumu yeniden çalıştırın.",
            bridge_exe.display()
        )
        .into());
    }

    match args.get(1).map(|s| s.as_str()) {
        Some("--install") => return cmd_install(&bridge_exe),
        Some("--uninstall") => return cmd_uninstall(&bridge_exe),
        Some("--help") | Some("-h") => {
            println!(
                "RetailEX_ScaleBridge_Manager\n  (varsayılan) Yönetim arayüzünü aç\n  --install    Windows servisini kur\n  --uninstall  Windows servisini kaldır"
            );
            return Ok(());
        }
        _ => cmd_open_ui(&bridge_exe),
    }
}

fn resolve_install_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let exe = env::current_exe()?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Kurulum dizini çözülemedi".into())
}

fn cmd_install(bridge_exe: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let status = Command::new(bridge_exe)
        .arg("--install")
        .status()
        .map_err(|e| format!("Servis kurulumu başlatılamadı: {}", e))?;
    if !status.success() {
        return Err("Servis kurulumu başarısız".into());
    }
    let _ = std::fs::create_dir_all(CONFIG_DIR);
    let _ = try_start_service();
    native_dialog::MessageDialog::new()
        .set_title("RetailEX Terazi Köprüsü")
        .set_text(&format!(
            "Kurulum tamamlandı.\n\nServis: {}\nConfig: {}\\scale-bridge.json\n\nYönetim arayüzü açılıyor…",
            SERVICE_NAME, CONFIG_DIR
        ))
        .show_alert();
    open_ui_browser()?;
    Ok(())
}

fn cmd_uninstall(bridge_exe: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let status = Command::new(bridge_exe)
        .arg("--uninstall")
        .status()
        .map_err(|e| format!("Servis kaldırma başlatılamadı: {}", e))?;
    if !status.success() {
        return Err("Servis kaldırma başarısız".into());
    }
    native_dialog::MessageDialog::new()
        .set_title("RetailEX Terazi Köprüsü")
        .set_text("Servis kaldırıldı.")
        .show_alert();
    Ok(())
}

fn cmd_open_ui(bridge_exe: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let _ = try_start_service();
    std::thread::sleep(std::time::Duration::from_millis(800));
    if let Err(e) = open_ui_browser() {
        let _ = native_dialog::MessageDialog::new()
            .set_title("RetailEX Terazi Köprüsü")
            .set_text(&format!(
                "Tarayıcı açılamadı: {}\n\nServis kurulu değilse yönetici olarak --install çalıştırın.",
                e
            ))
            .show_alert();
        return Err(e);
    }
    let _ = bridge_exe;
    Ok(())
}

fn try_start_service() -> Result<(), Box<dyn std::error::Error>> {
    let _ = Command::new("net")
        .args(["start", SERVICE_NAME])
        .status();
    Ok(())
}

fn open_ui_browser() -> Result<(), Box<dyn std::error::Error>> {
    Command::new("cmd")
        .args(["/C", "start", "", UI_URL])
        .spawn()
        .map_err(|e| format!("Tarayıcı açılamadı: {}", e))?;
    Ok(())
}
