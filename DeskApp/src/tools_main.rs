//! RetailEX_Tools — Kurulum dizinindeki .ps1 yardımcılarını ExecutionPolicy Bypass ile çalıştırır.
//! Portable: config.db tabanlı güncelleme + migration (tools_portable).
//! Argümansız: Slint (Config benzeri) butonlu pencere. CLI: mevcut komutlar.
//! Önerilen konum: INSTDIR\RetailEXTools\RetailEX_Tools.exe (kurulum dosyaları INSTDIR kökünde).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[path = "config.rs"]
mod config;
#[path = "sql_migration_split.rs"]
mod sql_migration_split;
#[path = "tools_portable.rs"]
mod tools_portable;

use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

slint::include_modules!();

/// INSTDIR\RetailEXTools\ içinden: üst dizinde servis/bridge dosyaları aranır.
/// Düz kurulum (exe ile aynı klasörde .ps1) veya üst klasörlerde arama da desteklenir.
fn resolve_install_dir(exe_dir: &Path) -> PathBuf {
    let mut cur = Some(exe_dir);
    for _ in 0..16 {
        let Some(p) = cur else { break };
        if marker_present(p) {
            return p.to_path_buf();
        }
        if p.join("install-services-manual.ps1").exists() {
            return p.to_path_buf();
        }
        if p.join("retailex.exe").exists() || p.join("VERSION.txt").exists() {
            return p.to_path_buf();
        }
        cur = p.parent();
    }
    exe_dir.to_path_buf()
}

fn marker_present(dir: &Path) -> bool {
    dir.join("RetailEX_Service.exe").exists()
        || dir.join("RetailEX_SQL_Bridge.exe").exists()
        || dir.join("bridge.cjs").exists()
}

fn run_ps1(install_dir: &Path, script: &str, extra: &[String]) -> i32 {
    let ps1 = install_dir.join(script);
    if !ps1.exists() {
        eprintln!("[RetailEX_Tools] Script bulunamadı: {}", ps1.display());
        return 1;
    }
    let mut cmd = Command::new("powershell.exe");
    cmd.arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&ps1);
    for a in extra {
        cmd.arg(a);
    }
    let st = match cmd.status() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[RetailEX_Tools] powershell başlatılamadı: {}", e);
            return 1;
        }
    };
    st.code().unwrap_or(1)
}

fn print_banner(install_dir: &Path) {
    println!("RetailEX Tools");
    println!("Kurulum dizini: {}", install_dir.display());
    println!();
}

fn list_scripts(install_dir: &Path) {
    let names = [
        "install-services-manual.ps1",
        "install-bridge-npm.ps1",
        "install-bridge.ps1",
        "retailex-admin.ps1",
        "pg-windows-expose-remote.ps1",
    ];
    println!("Script durumu:");
    for n in names {
        let p = install_dir.join(n);
        let ok = p.exists();
        println!("  [{}] {}", if ok { "OK" } else { "--" }, n);
    }
    let pgexe = install_dir.join("RetailEX_PostgreSQLRemote.exe");
    println!(
        "  [{}] {}",
        if pgexe.exists() { "OK" } else { "--" },
        "RetailEX_PostgreSQLRemote.exe"
    );
    let ver = install_dir.join("VERSION.txt");
    println!(
        "  [{}] VERSION.txt",
        if ver.exists() { "OK" } else { "--" }
    );
    println!();
}

fn script_status_text(install_dir: &Path) -> String {
    let names = [
        "install-services-manual.ps1",
        "install-bridge-npm.ps1",
        "install-bridge.ps1",
        "retailex-admin.ps1",
        "pg-windows-expose-remote.ps1",
        "RetailEX_PostgreSQLRemote.exe",
        "VERSION.txt",
    ];
    names
        .iter()
        .map(|n| {
            let ok = install_dir.join(n).exists();
            format!("[{}] {}", if ok { "OK" } else { "--" }, n)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Yonetici (UAC) ile RetailEX_PostgreSQLRemote.exe — argümansız menü icin.
fn run_postgres_remote_elevated(install_dir: &Path) -> i32 {
    let exe = install_dir.join("RetailEX_PostgreSQLRemote.exe");
    if !exe.exists() {
        eprintln!(
            "[RetailEX_Tools] Bulunamadı: {} — tam kurulum (NSIS) veya projede cargo build.",
            exe.display()
        );
        return 1;
    }
    let fp = exe.to_string_lossy().replace('\'', "''");
    let script = format!(
        "if (-not (Test-Path -LiteralPath '{fp}')) {{ exit 1 }}; Start-Process -LiteralPath '{fp}' -Verb RunAs -Wait"
    );
    let st = match Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .status()
    {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[RetailEX_Tools] powershell: {}", e);
            return 1;
        }
    };
    st.code().unwrap_or(1)
}

fn pause() {
    print!("Devam etmek için Enter...");
    let _ = io::stdout().flush();
    let mut buf = String::new();
    let _ = io::stdin().lock().read_line(&mut buf);
}

fn run_named_action(install_dir: &Path, action: &str) -> (i32, String) {
    match action {
        "services" => (
            run_ps1(install_dir, "install-services-manual.ps1", &[]),
            "Servis kurulumu tamamlandı.".into(),
        ),
        "bridge-npm" => {
            let prefix = install_dir.display().to_string();
            let code = run_ps1(
                install_dir,
                "install-bridge-npm.ps1",
                &["-Prefix".into(), prefix],
            );
            (code, "Bridge npm adımı bitti.".into())
        }
        "bridge" => (
            run_ps1(install_dir, "install-bridge.ps1", &[]),
            "SQL Bridge kur / onar bitti.".into(),
        ),
        "admin" => (
            run_ps1(install_dir, "retailex-admin.ps1", &["-Menu".into()]),
            "Yönetim menüsü kapandı.".into(),
        ),
        "pg" => (
            run_ps1(install_dir, "pg-windows-expose-remote.ps1", &[]),
            "PostgreSQL uzaktan erişim scripti bitti.".into(),
        ),
        "pg-remote" => (
            run_postgres_remote_elevated(install_dir),
            "PostgreSQL LAN (UAC) bitti.".into(),
        ),
        "update" => (
            tools_portable::run_portable_update(install_dir),
            "Güncelleme işlemi bitti.".into(),
        ),
        "migrate" => (
            tools_portable::run_portable_migrate(install_dir),
            "Migration işlemi bitti.".into(),
        ),
        "setup-db" => (
            tools_portable::run_portable_setup_db(install_dir),
            "DB oluştur + migration bitti.".into(),
        ),
        "fetch-sql" => (
            tools_portable::run_portable_fetch_sql(install_dir),
            "GitHub SQL çekme bitti.".into(),
        ),
        "sync-migrate" => (
            tools_portable::run_portable_sync_migrate(install_dir),
            "SQL çek + migration bitti.".into(),
        ),
        "config" => match tools_portable::config_summary_text() {
            Ok(text) => (0, text),
            Err(e) => (1, e),
        },
        "refresh" => (0, "Script durumu yenilendi.".into()),
        other => (1, format!("Bilinmeyen komut: {}", other)),
    }
}

fn menu_loop(install_dir: &Path) -> i32 {
    loop {
        print_banner(install_dir);
        list_scripts(install_dir);
        println!("1) Servisleri elle kur (install-services-manual.ps1)");
        println!("2) SQL Bridge npm bağımlılıkları (install-bridge-npm.ps1)");
        println!("3) SQL Bridge kur / onar (install-bridge.ps1)");
        println!("4) Yönetim menüsü (retailex-admin.ps1)");
        println!("5) PostgreSQL uzaktan erisim (pg-windows-expose-remote.ps1)");
        println!("6) PostgreSQL LAN (.exe, UAC) — RetailEX_PostgreSQLRemote.exe");
        println!("7) Güncelle (portable EXE, GitHub)");
        println!("8) Migration uygula (yerel SQL → PG)");
        println!("9) DB oluştur + migration (config.db)");
        println!("B) GitHub'dan güncel SQL çek");
        println!("C) GitHub SQL çek + migration uygula");
        println!("A) config.db özeti");
        println!("L) Script listesini yenile");
        println!("0) Çıkış");
        print!("Secim: ");
        let _ = io::stdout().flush();
        let mut line = String::new();
        if io::stdin().lock().read_line(&mut line).is_err() {
            return 1;
        }
        let choice = line.trim().to_ascii_lowercase();
        let (code, detail) = match choice.as_str() {
            "1" => run_named_action(install_dir, "services"),
            "2" => run_named_action(install_dir, "bridge-npm"),
            "3" => run_named_action(install_dir, "bridge"),
            "4" => run_named_action(install_dir, "admin"),
            "5" => run_named_action(install_dir, "pg"),
            "6" => run_named_action(install_dir, "pg-remote"),
            "7" => run_named_action(install_dir, "update"),
            "8" => run_named_action(install_dir, "migrate"),
            "9" => run_named_action(install_dir, "setup-db"),
            "b" => run_named_action(install_dir, "fetch-sql"),
            "c" => run_named_action(install_dir, "sync-migrate"),
            "a" | "10" => run_named_action(install_dir, "config"),
            "l" => {
                println!();
                continue;
            }
            "0" | "q" | "" => return 0,
            _ => {
                println!("Geçersiz seçim.\n");
                continue;
            }
        };
        if choice == "a" || choice == "10" {
            println!("\n{}", detail);
        }
        println!("\nÇıkış kodu: {}\n", code);
        pause();
        println!();
    }
}

fn dispatch_cli(install_dir: &Path, args: &[String]) -> i32 {
    if args.is_empty() {
        return menu_loop(install_dir);
    }
    match args[0].as_str() {
        "services" | "servisler" => run_named_action(install_dir, "services").0,
        "bridge-npm" | "npm" => run_named_action(install_dir, "bridge-npm").0,
        "bridge" => run_ps1(install_dir, "install-bridge.ps1", &args[1..].to_vec()),
        "admin" => {
            let mut v = vec!["-Menu".into()];
            v.extend_from_slice(&args[1..]);
            run_ps1(install_dir, "retailex-admin.ps1", &v)
        }
        "pg" | "expose" => run_ps1(install_dir, "pg-windows-expose-remote.ps1", &args[1..].to_vec()),
        "pg-remote" | "pgexe" => {
            let exe = install_dir.join("RetailEX_PostgreSQLRemote.exe");
            if !exe.exists() {
                eprintln!("RetailEX_PostgreSQLRemote.exe yok: {}", exe.display());
                return 1;
            }
            let mut c = Command::new(&exe);
            for a in &args[1..] {
                c.arg(a);
            }
            match c.status() {
                Ok(s) => s.code().unwrap_or(1),
                Err(e) => {
                    eprintln!("{}", e);
                    1
                }
            }
        }
        "update" | "guncelle" | "güncelle" => run_named_action(install_dir, "update").0,
        "migrate" | "migration" => run_named_action(install_dir, "migrate").0,
        "setup-db" | "init-db" | "createdb" => run_named_action(install_dir, "setup-db").0,
        "fetch-sql" | "pull-sql" | "sql" => run_named_action(install_dir, "fetch-sql").0,
        "sync-migrate" | "sync-sql" => run_named_action(install_dir, "sync-migrate").0,
        "config" | "config-db" => {
            let (code, detail) = run_named_action(install_dir, "config");
            println!("{}", detail);
            code
        }
        "menu" | "console" => menu_loop(install_dir),
        "help" | "-h" | "/?" => {
            println!(
                "Kullanım: RetailEX_Tools.exe [komut]\n\
                 Argümansız: butonlu pencere (Slint).\n\
                 Komutlar: services | bridge-npm | bridge | admin | pg | pg-remote\n\
                           update | migrate | setup-db | fetch-sql | sync-migrate | config\n\
                           menu (eski konsol menü)\n\
                 update: GitHub RetailEX-*.exe indirip kurulum dizinine yazar\n\
                 migrate: yerel SQL → PostgreSQL bekleyen migration\n\
                 setup-db: CREATE DATABASE (yoksa) + migration\n\
                 fetch-sql: GitHub main database/migrations → _up_\\database\\migrations\n\
                 sync-migrate: fetch-sql + migrate (önerilen SQL güncelleme)\n\
                 Ortam: RETAILEX_SQL_REF=main (veya tag/branch)\n\
                 config: config.db özeti"
            );
            0
        }
        _ => {
            eprintln!("Bilinmeyen komut: {} (help yazın)", args[0]);
            1
        }
    }
}

#[cfg(windows)]
fn attach_or_alloc_console() {
    use windows::Win32::System::Console::{AllocConsole, AttachConsole, ATTACH_PARENT_PROCESS};
    unsafe {
        if AttachConsole(ATTACH_PARENT_PROCESS).is_err() {
            let _ = AllocConsole();
        }
    }
}

fn run_gui(install_dir: PathBuf) -> i32 {
    let ui = match ToolsWindow::new() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("Tools penceresi açılamadı: {}", e);
            return 1;
        }
    };

    ui.set_install_dir(install_dir.display().to_string().into());
    ui.set_script_status(script_status_text(&install_dir).into());
    ui.set_status_msg("Hazır — bir işlem seçin.".into());
    ui.set_busy(false);

    let install_dir = Arc::new(install_dir);

    ui.on_run_command({
        let ui_handle = ui.as_weak();
        let install_dir = Arc::clone(&install_dir);
        move |cmd| {
            let action = cmd.to_string();
            let ui_handle = ui_handle.clone();
            let install_dir = Arc::clone(&install_dir);

            if let Some(ui) = ui_handle.upgrade() {
                if ui.get_busy() {
                    return;
                }
                ui.set_busy(true);
                ui.set_status_msg(format!("Çalışıyor: {} …", action).into());
            }

            std::thread::spawn(move || {
                let (code, detail) = if action == "refresh" {
                    let status = script_status_text(&install_dir);
                    (0, status)
                } else {
                    run_named_action(&install_dir, &action)
                };

                let _ = slint::invoke_from_event_loop(move || {
                    if let Some(ui) = ui_handle.upgrade() {
                        ui.set_busy(false);
                        if action == "refresh" {
                            ui.set_script_status(detail.clone().into());
                            ui.set_status_msg("Script durumu yenilendi.".into());
                        } else if action == "config" {
                            ui.set_status_msg(detail.into());
                        } else {
                            ui.set_script_status(script_status_text(&install_dir).into());
                            ui.set_status_msg(
                                format!("{}\nÇıkış kodu: {}", detail, code).into(),
                            );
                        }
                    }
                });
            });
        }
    });

    if let Err(e) = ui.run() {
        eprintln!("Tools UI: {}", e);
        return 1;
    }
    0
}

fn main() {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("current_exe: {}", e);
            std::process::exit(1);
        }
    };
    let exe_dir = exe
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let install_dir = resolve_install_dir(&exe_dir);
    let args: Vec<String> = std::env::args().skip(1).collect();

    let code = if args.is_empty() {
        run_gui(install_dir)
    } else {
        #[cfg(windows)]
        attach_or_alloc_console();
        dispatch_cli(&install_dir, &args)
    };
    std::process::exit(code);
}
