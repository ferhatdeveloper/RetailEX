#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! RetailEX Terazi Köprüsü — kurulum ve masaüstü yönetim arayüzü (Slint).

use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

slint::include_modules!();

mod scale_bridge_gui;

const SERVICE_NAME: &str = "RetailEX_Scale_Bridge";
const BRIDGE_EXE: &str = "RetailEX_Scale_Bridge.exe";
const UI_URL: &str = "http://127.0.0.1:3012/ui/";
const STATUS_URL: &str = "http://127.0.0.1:3012/status";
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

    let quiet = args.iter().any(|a| {
        let s = a.trim().to_ascii_lowercase();
        s == "--quiet" || s == "/quiet" || s == "-quiet" || s == "/silent" || s == "--silent"
    });

    match args.get(1).map(|s| s.as_str()) {
        Some("--install") => return cmd_install(&bridge_exe, quiet),
        Some("--uninstall") => return cmd_uninstall(&bridge_exe, quiet),
        Some("--web") => return cmd_open_web(&bridge_exe),
        Some("--help") | Some("-h") => {
            println!(
                "RetailEX_ScaleBridge_Manager\n  (varsayılan) Masaüstü yönetim penceresi\n  --web        Tarayıcı arayüzü\n  --install    Windows servisini kur\n  --uninstall  Windows servisini kaldır"
            );
            return Ok(());
        }
        _ => scale_bridge_gui::launch_gui(&bridge_exe),
    }
}

fn resolve_install_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let exe = env::current_exe()?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Kurulum dizini çözülemedi".into())
}

fn cmd_install(bridge_exe: &PathBuf, quiet: bool) -> Result<(), Box<dyn std::error::Error>> {
    let status = Command::new(bridge_exe)
        .arg("--install")
        .status()
        .map_err(|e| format!("Servis kurulumu baslatilamadi: {}", e))?;
    if !status.success() {
        let detail = read_install_error_hint();
        return Err(format!(
            "Servis kurulumu basarisiz. {}\nLog: C:\\ProgramData\\RetailEX\\RetailEX_Scale_Bridge_install_last_error.txt",
            detail
        )
        .into());
    }
    let _ = std::fs::create_dir_all(CONFIG_DIR);
    let _ = try_start_service();
    if !quiet {
        native_dialog::MessageDialog::new()
            .set_title("RetailEX Terazi Köprüsü")
            .set_text(&format!(
                "Kurulum tamamlandı.\n\nServis: {}\nConfig: {}\\scale-bridge.json\n\nYönetim penceresi açılıyor…",
                SERVICE_NAME, CONFIG_DIR
            ))
            .show_alert();
    }
    if !wait_for_bridge_ready(45) {
        return Err(
            "Kurulum tamamlandı ancak köprü HTTP yanıt vermiyor. diagnose-windows.ps1 çalıştırın.".into(),
        );
    }
    if !quiet {
        scale_bridge_gui::launch_gui(bridge_exe)?;
    }
    Ok(())
}

fn wait_for_bridge_ready(max_wait_secs: u64) -> bool {
    let attempts = max_wait_secs * 2;
    for i in 0..attempts {
        if bridge_http_ready() {
            return true;
        }
        if i == 0 || i % 4 == 0 {
            let _ = try_start_service();
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

fn bridge_http_ready() -> bool {
    let script = format!(
        "try {{ $r = Invoke-WebRequest -Uri '{}' -UseBasicParsing -TimeoutSec 2; $r.StatusCode -eq 200 }} catch {{ $false }}",
        STATUS_URL
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let s = String::from_utf8_lossy(&o.stdout);
            s.trim().eq_ignore_ascii_case("true")
        }
        _ => false,
    }
}

fn read_service_log_hint() -> String {
    let path = r"C:\ProgramData\RetailEX\scale_bridge_service.log";
    std::fs::read_to_string(path)
        .ok()
        .map(|s| {
            let tail: String = s
                .lines()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n");
            if tail.is_empty() {
                "Servis logu boş — node.exe veya scale-bridge/server.mjs eksik olabilir.".to_string()
            } else {
                format!("Son log satırları:\n{}", tail)
            }
        })
        .unwrap_or_else(|| "Log dosyası yok: scale_bridge_service.log".to_string())
}

fn cmd_uninstall(bridge_exe: &PathBuf, quiet: bool) -> Result<(), Box<dyn std::error::Error>> {
    let _ = Command::new("net")
        .args(["stop", SERVICE_NAME])
        .status();
    let status = Command::new(bridge_exe)
        .arg("--uninstall")
        .status()
        .map_err(|e| format!("Servis kaldırma başlatılamadı: {}", e))?;
    if !status.success() {
        return Err("Servis kaldırma başarısız".into());
    }
    if !quiet {
        native_dialog::MessageDialog::new()
            .set_title("RetailEX Terazi Köprüsü")
            .set_text("Servis kaldırıldı.")
            .show_alert();
    }
    Ok(())
}

fn cmd_open_web(bridge_exe: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let _ = try_start_service();
    if !wait_for_bridge_ready(45) {
        let detail = read_service_log_hint();
        return Err(format!(
            "Terazi köprüsü HTTP yanıt vermiyor (port 3012).\n\n\
             1) Yönetici olarak: \"{}\" --install\n\
             2) services.msc → {} → Başlat\n\
             3) Teşhis: scale-bridge\\diagnose-windows.ps1\n\n\
             {}",
            env::current_exe()
                .ok()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "RetailEX_ScaleBridge_Manager.exe".into()),
            SERVICE_NAME,
            detail
        )
        .into());
    }
    open_ui_browser()?;
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
    let started = Command::new("cmd")
        .args(["/C", "start", "", UI_URL])
        .spawn()
        .is_ok();
    if started {
        return Ok(());
    }
    Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", UI_URL])
        .spawn()
        .map_err(|e| format!("Tarayici acilamadi: {}", e))?;
    Ok(())
}

fn read_install_error_hint() -> String {
    let path = r"C:\ProgramData\RetailEX\RetailEX_Scale_Bridge_install_last_error.txt";
    std::fs::read_to_string(path)
        .ok()
        .map(|s| {
            let tail: String = s.lines().rev().take(3).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" | ");
            if tail.is_empty() { "Yonetici olarak calistirin.".to_string() } else { tail }
        })
        .unwrap_or_else(|| "Yonetici olarak calistirin.".to_string())
}
