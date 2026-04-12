//! CreateService sonucu: ERROR_SERVICE_EXISTS (1073) dilinden bagimsiz kabul edilir.
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use windows_service::service::{ServiceAccess, ServiceInfo};
use windows_service::service_manager::ServiceManager;
use windows_service::Error as WsError;

/// NSIS / el ile çağrıda argüman sırası değişse bile ilk tanınan komut (vpn_tray: --console dahil).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BootstrapServiceCmd {
    Install,
    Uninstall,
    Console,
}

pub fn scan_bootstrap_service_cmd(args: &[String]) -> Option<BootstrapServiceCmd> {
    for arg in args.iter().skip(1) {
        let s = arg.trim().to_ascii_lowercase();
        match s.as_str() {
            "--console" => return Some(BootstrapServiceCmd::Console),
            "--install" | "/install" | "-install" => return Some(BootstrapServiceCmd::Install),
            "--uninstall" | "/uninstall" | "-uninstall" => {
                return Some(BootstrapServiceCmd::Uninstall);
            }
            _ => {}
        }
    }
    None
}

/// winerror.h ERROR_SERVICE_EXISTS
const ERROR_SERVICE_EXISTS: i32 = 1073;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CreateServiceOutcome {
    Created,
    AlreadyExisted,
}

pub fn error_is_service_exists(e: &WsError) -> bool {
    matches!(e, WsError::Winapi(io_err) if io_err.raw_os_error() == Some(ERROR_SERVICE_EXISTS))
}

/// Kurulum hatasını destek için ProgramData'ya yazar (konsol yok / UAC).
pub fn log_install_any_error(log_stem: &str, err: &(dyn std::error::Error + 'static)) {
    let dir = Path::new(r"C:\ProgramData\RetailEX");
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let path = dir.join(format!("{log_stem}_install_last_error.txt"));
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(
            f,
            "=== {:?} ===\n(non-CreateService) {}\n",
            std::time::SystemTime::now(),
            err
        );
    }
}

pub fn log_service_install_failure(log_stem: &str, e: &WsError) {
    let dir = Path::new(r"C:\ProgramData\RetailEX");
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let path = dir.join(format!("{log_stem}_install_last_error.txt"));
    let line = match e {
        WsError::Winapi(io_err) => format!(
            "{:?} raw_os_error={:?}\n",
            io_err,
            io_err.raw_os_error()
        ),
        _ => format!("{e:?}\n"),
    };
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "=== {:?} ===\n{}", std::time::SystemTime::now(), line);
    }
}

pub fn create_service_or_accept_exists(
    manager: &ServiceManager,
    info: &ServiceInfo,
    access: ServiceAccess,
    log_stem: &str,
) -> Result<CreateServiceOutcome, Box<dyn std::error::Error>> {
    match manager.create_service(info, access) {
        Ok(_svc) => Ok(CreateServiceOutcome::Created),
        Err(e) => {
            if error_is_service_exists(&e) {
                Ok(CreateServiceOutcome::AlreadyExisted)
            } else {
                log_service_install_failure(log_stem, &e);
                Err(Box::new(e))
            }
        }
    }
}
