use std::ffi::OsString;
use tokio::sync::oneshot;
use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceStatus,
        ServiceType, ServiceState, ServiceControlAccept, ServiceExitCode,
        ServiceStartType, ServiceErrorControl, ServiceAccess, ServiceInfo,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
    service_manager::{ServiceManager, ServiceManagerAccess},
};
use tracing::{info, error};

#[path = "logo_bridge.rs"]
mod logo_bridge;

slint::include_modules!();

const SERVICE_NAME: &str = "RetailEX_Logo";
const DISPLAY_NAME: &str = "RetailEX Logo Sync Service";
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

define_windows_service!(ffi_service_main, logo_connector_service_main);

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();

    // If no arguments and not running as service, show GUI
    if args.len() == 1 {
        // Try starting as service first (Windows does this automatically when started by SCM)
        if let Err(e) = service_dispatcher::start(SERVICE_NAME, ffi_service_main) {
            match e {
                windows_service::Error::Winapi(win_err) if win_err.raw_os_error() == Some(1063) => {
                    // Error 1063: The service process could not connect to the service controller.
                    // This means we are running as a normal desktop app.
                    launch_gui()?;
                }
                _ => return Err(e.into()),
            }
        }
        return Ok(());
    }

    // Handle CLI arguments (e.g., for self-install)
    if args.contains(&"--install".to_string()) {
        install_service()?;
        return Ok(());
    } else if args.contains(&"--uninstall".to_string()) {
        uninstall_service()?;
        return Ok(());
    }

    Ok(())
}

fn launch_gui() -> anyhow::Result<()> {
    let ui = LogoWindow::new()?;
    let ui_handle = ui.as_weak();

    // Initial log load
    refresh_ui_logs(ui_handle.clone());

    // Update status periodically
    let timer = slint::Timer::default();
    let status_handle = ui.as_weak();
    timer.start(slint::TimerMode::Repeated, std::time::Duration::from_secs(2), move || {
        if let Some(ui) = status_handle.upgrade() {
            let status = get_service_status().unwrap_or("Not Installed".to_string());
            ui.set_service_status(status.into());
        }
    });

    ui.on_refresh_logs({
        let handle = ui.as_weak();
        move || refresh_ui_logs(handle.clone())
    });

    let ui_handle_install = ui.as_weak();
    ui.on_install_service(move || {
        if let Ok(_) = install_service() {
            refresh_ui_logs(ui_handle_install.clone());
        }
    });

    let ui_handle_uninstall = ui.as_weak();
    ui.on_uninstall_service(move || {
        if let Ok(_) = uninstall_service() {
            refresh_ui_logs(ui_handle_uninstall.clone());
        }
    });

    ui.run()?;
    Ok(())
}

fn refresh_ui_logs(handle: slint::Weak<LogoWindow>) {
    if let Some(ui) = handle.upgrade() {
        let mut log_path = std::env::current_exe().unwrap();
        log_path.set_extension("log");
        
        if let Ok(content) = std::fs::read_to_string(log_path) {
            let lines: Vec<slint::SharedString> = content.lines()
                .rev()
                .take(50)
                .map(|l| l.into())
                .collect();
            
            let model = std::rc::Rc::new(slint::VecModel::from(lines));
            ui.set_log_lines(model.into());
            
            if let Some(last) = content.lines().last() {
                if let Some(timestamp) = last.split(']').next() {
                    ui.set_last_sync(timestamp.trim_start_matches('[').into());
                }
            }
        }
    }
}

fn get_service_status() -> anyhow::Result<String> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let status = match manager.open_service(SERVICE_NAME, windows_service::service::ServiceAccess::QUERY_STATUS) {
        Ok(service) => {
            let status = service.query_status()?;
            match status.current_state {
                ServiceState::Running => "Running",
                ServiceState::Stopped => "Stopped",
                ServiceState::StartPending => "Starting",
                ServiceState::StopPending => "Stopping",
                _ => "Unknown",
            }
        }
        Err(_) => "Not Installed",
    };
    Ok(status.to_string())
}

fn install_service() -> anyhow::Result<()> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE)?;
    let exe_path = std::env::current_exe()?;
    let status_str = get_service_status()?;

    if status_str != "Not Installed" {
        println!("Service already exists.");
        return Ok(());
    }

    println!("Installing RetailEX_Logo as Windows Service...");
    
    let info = ServiceInfo {
        name: SERVICE_NAME.to_string().into(),
        display_name: DISPLAY_NAME.to_string().into(),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: exe_path,
        launch_arguments: Vec::new(),
        dependencies: Vec::new(),
        account_name: None,
        account_password: None,
    };

    let service = manager.create_service(&info, ServiceAccess::all())?;
    
    service.start::<OsString>(&[])?;
    println!("✅ Service installed and started.");
    Ok(())
}

fn uninstall_service() -> anyhow::Result<()> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    println!("Removing RetailEX_Logo service...");
    
    if let Ok(service) = manager.open_service(SERVICE_NAME, windows_service::service::ServiceAccess::STOP | windows_service::service::ServiceAccess::DELETE) {
        let _: windows_service::service::ServiceStatus = service.stop()?;
        service.delete()?;
        println!("✅ Service removed.");
    } else {
        println!("Service not found.");
    }
    
    Ok(())
}

fn logo_connector_service_main(_arguments: Vec<OsString>) {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

    rt.block_on(async {
        tracing_subscriber::fmt()
            .with_env_filter("retailex_logo=debug")
            .init();

        info!("🚀 RetailEX_Logo Windows Service starting...");

        let (stop_tx, stop_rx) = oneshot::channel();
        let stop_tx_mutex = std::sync::Mutex::new(Some(stop_tx));

        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop => {
                    info!("🛑 Service Stop requested");
                    if let Ok(mut tx_guard) = stop_tx_mutex.lock() {
                        if let Some(tx) = tx_guard.take() {
                            let _ = tx.send(());
                        }
                    }
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle = match service_control_handler::register(SERVICE_NAME, event_handler) {
            Ok(handle) => handle,
            Err(e) => {
                error!("❌ Failed to register service control handler: {}", e);
                return;
            }
        };

        let _ = status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: std::time::Duration::default(),
            process_id: None,
        });

        dotenv::dotenv().ok();
        let pg_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let mssql_url = std::env::var("LOGO_DATABASE_URL").expect("LOGO_DATABASE_URL must be set");

        match logo_bridge::LogoBridge::new(&pg_url, &mssql_url).await {
            Ok(bridge) => {
                bridge.run(stop_rx).await;
            }
            Err(e) => {
                error!("❌ Failed to initialize bridge: {}", e);
            }
        }

        let _ = status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::Stopped,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: std::time::Duration::default(),
            process_id: None,
        });
    });
}
