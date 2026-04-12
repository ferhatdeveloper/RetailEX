#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::ffi::OsString;
use std::fs::OpenOptions;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::mpsc;
use std::time::Duration;
use windows_service::define_windows_service;
use windows_service::service::{
    ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl, ServiceExitCode,
    ServiceInfo, ServiceStartType, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::service_dispatcher;
use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};

#[path = "windows_service_install.rs"]
mod windows_service_install;

const SERVICE_NAME: &str = "RetailEX_SQL_Bridge";
const DISPLAY_NAME: &str = "RetailEX SQL Bridge";
const LOG_FILE: &str = "C:\\ProgramData\\RetailEX\\sql_bridge_service.log";

fn main() {
    if let Err(e) = run() {
        log_line(&format!("Fatal error: {}", e));
        eprintln!("RetailEX_SQL_Bridge error: {}", e);
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    match windows_service_install::scan_bootstrap_service_cmd(&args) {
        Some(windows_service_install::BootstrapServiceCmd::Install) => return install_service(),
        Some(windows_service_install::BootstrapServiceCmd::Uninstall) => return uninstall_service(),
        Some(windows_service_install::BootstrapServiceCmd::Console) => {
            println!("Usage: RetailEX_SQL_Bridge.exe [--install | --uninstall]");
            return Ok(());
        }
        None => {}
    }
    if args.len() > 1 {
        println!("Usage: RetailEX_SQL_Bridge.exe [--install | --uninstall]");
        return Ok(());
    }
    service_dispatcher::start(SERVICE_NAME, ffi_service_main).map_err(|e| e.into())
}

fn install_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE,
    )
    .map_err(|e| {
        windows_service_install::log_service_install_failure("RetailEX_SQL_Bridge", &e);
        Box::new(e) as Box<dyn std::error::Error>
    })?;
    let exe_path = env::current_exe().map_err(|e| {
        windows_service_install::log_install_any_error("RetailEX_SQL_Bridge", &e);
        Box::new(e) as Box<dyn std::error::Error>
    })?;

    let info = ServiceInfo {
        name: SERVICE_NAME.into(),
        display_name: DISPLAY_NAME.into(),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: exe_path,
        launch_arguments: Vec::new(),
        dependencies: Vec::new(),
        account_name: None,
        account_password: None,
    };

    match windows_service_install::create_service_or_accept_exists(
        &manager,
        &info,
        ServiceAccess::all(),
        "RetailEX_SQL_Bridge",
    )? {
        windows_service_install::CreateServiceOutcome::Created => {
            println!("Service installed successfully.");
        }
        windows_service_install::CreateServiceOutcome::AlreadyExisted => {
            println!("Service already exists.");
        }
    }
    Ok(())
}

fn uninstall_service() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service(SERVICE_NAME, ServiceAccess::DELETE)?;
    service.delete()?;
    println!("Service uninstalled successfully.");
    Ok(())
}

define_windows_service!(ffi_service_main, my_service_main);

fn my_service_main(_args: Vec<OsString>) {
    if let Err(e) = run_service() {
        log_line(&format!("Service run failed: {}", e));
    }
}

fn run_service() -> windows_service::Result<()> {
    let (shutdown_tx, shutdown_rx) = mpsc::channel();
    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Interrogate => {
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    log_line("RetailEX SQL Bridge service started.");

    let mut bridge = match spawn_bridge_child() {
        Ok(c) => c,
        Err(e) => {
            log_line(&format!("Bridge spawn failed: {}", e));
            status_handle.set_service_status(ServiceStatus {
                service_type: ServiceType::OWN_PROCESS,
                current_state: ServiceState::Stopped,
                controls_accepted: ServiceControlAccept::empty(),
                exit_code: ServiceExitCode::Win32(1),
                checkpoint: 0,
                wait_hint: Duration::default(),
                process_id: None,
            })?;
            return Ok(());
        }
    };

    loop {
        if shutdown_rx.try_recv().is_ok() {
            let _ = stop_child(&mut bridge);
            log_line("RetailEX SQL Bridge service stopped by SCM.");
            status_handle.set_service_status(ServiceStatus {
                service_type: ServiceType::OWN_PROCESS,
                current_state: ServiceState::Stopped,
                controls_accepted: ServiceControlAccept::empty(),
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: Duration::default(),
                process_id: None,
            })?;
            return Ok(());
        }

        match bridge.try_wait() {
            Ok(Some(status)) => {
                log_line(&format!("Bridge process exited: {:?}", status.code()));
                match spawn_bridge_child() {
                    Ok(c) => {
                        bridge = c;
                        log_line("Bridge process restarted.");
                    }
                    Err(e) => {
                        log_line(&format!("Bridge restart failed: {}", e));
                        status_handle.set_service_status(ServiceStatus {
                            service_type: ServiceType::OWN_PROCESS,
                            current_state: ServiceState::Stopped,
                            controls_accepted: ServiceControlAccept::empty(),
                            exit_code: ServiceExitCode::Win32(1),
                            checkpoint: 0,
                            wait_hint: Duration::default(),
                            process_id: None,
                        })?;
                        return Ok(());
                    }
                }
            }
            Ok(None) => {}
            Err(e) => log_line(&format!("Bridge state check failed: {}", e)),
        }

        std::thread::sleep(Duration::from_secs(2));
    }
}

fn spawn_bridge_child() -> Result<Child, Box<dyn std::error::Error>> {
    let current = env::current_exe()?;
    let base = current
        .parent()
        .ok_or("Cannot resolve install directory")?
        .to_path_buf();

    let node = resolve_node_path().ok_or("node.exe not found")?;
    let bridge = base.join("bridge.cjs");
    if !bridge.exists() {
        return Err("bridge.cjs not found beside service executable".into());
    }

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let child = Command::new(node)
        .arg(bridge)
        .current_dir(&base)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()?;

    log_line(&format!("Spawned bridge child, pid={}", child.id()));
    Ok(child)
}

fn resolve_node_path() -> Option<PathBuf> {
    let fixed = PathBuf::from(r"C:\Program Files\nodejs\node.exe");
    if fixed.exists() {
        return Some(fixed);
    }

    let out = Command::new("where").arg("node.exe").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let first = String::from_utf8_lossy(&out.stdout).lines().next()?.trim().to_string();
    if first.is_empty() {
        None
    } else {
        Some(PathBuf::from(first))
    }
}

fn stop_child(child: &mut Child) -> Result<(), Box<dyn std::error::Error>> {
    let pid = child.id().to_string();
    let _ = Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .status();
    Ok(())
}

fn log_line(message: &str) {
    let _ = std::fs::create_dir_all("C:\\ProgramData\\RetailEX");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(LOG_FILE) {
        let _ = writeln!(file, "[{}] {}", chrono::Local::now(), message);
    }
}
