//! Caller ID fiziksel cihaz: seri port satır okuma, `rest:caller-id` / `rest:caller-id-error` olayları.

use serde::Serialize;
use std::io::BufRead;
use std::io::BufReader;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub struct SerialSession {
    stop: std::sync::Arc<AtomicBool>,
    join: thread::JoinHandle<()>,
}

pub struct CallerSerialHandle {
    pub session: Mutex<Option<SerialSession>>,
}

impl Default for CallerSerialHandle {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortRow {
    pub path: String,
    pub description: String,
}

#[tauri::command]
pub fn list_caller_serial_ports() -> Result<Vec<SerialPortRow>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    let out: Vec<SerialPortRow> = ports
        .into_iter()
        .map(|p| {
            let desc = match &p.port_type {
                serialport::SerialPortType::UsbPort(u) => {
                    format!("USB {:04x}:{:04x}", u.vid, u.pid)
                }
                serialport::SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                serialport::SerialPortType::Unknown => "Bilinmeyen".to_string(),
                serialport::SerialPortType::PciPort => "PCI".to_string(),
            };
            SerialPortRow {
                path: p.port_name.clone(),
                description: desc,
            }
        })
        .collect();
    Ok(out)
}

fn serial_read_loop(app: AppHandle, port_path: String, baud: u32, stop: std::sync::Arc<AtomicBool>) {
    let builder = serialport::new(&port_path, baud).timeout(Duration::from_millis(450));
    let mut port = match builder.open() {
        Ok(p) => p,
        Err(e) => {
            let _ = app.emit("rest:caller-id-error", format!("Port açılamadı: {}", e));
            return;
        }
    };

    let mut reader = BufReader::new(&mut port);
    let mut line = String::new();
    while !stop.load(Ordering::SeqCst) {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => thread::sleep(Duration::from_millis(80)),
            Ok(_) => {
                let t = line.trim();
                if !t.is_empty() {
                    let payload = serde_json::json!({ "raw": t });
                    let _ = app.emit("rest:caller-id", payload);
                }
            }
            Err(_) => {}
        }
    }
}

#[tauri::command]
pub fn caller_serial_start(
    app: AppHandle,
    state: State<'_, CallerSerialHandle>,
    port_path: String,
    baud: u32,
) -> Result<(), String> {
    let mut guard = state.session.lock().map_err(|e| e.to_string())?;
    if let Some(sess) = guard.take() {
        sess.stop.store(true, Ordering::SeqCst);
        let _ = sess.join.join();
    }

    let stop = std::sync::Arc::new(AtomicBool::new(false));
    let stop_t = std::sync::Arc::clone(&stop);
    let path = port_path.clone();
    let app2 = app.clone();
    let join = thread::spawn(move || serial_read_loop(app2, path, baud, stop_t));

    *guard = Some(SerialSession { stop, join });
    Ok(())
}

#[tauri::command]
pub fn caller_serial_stop(state: State<'_, CallerSerialHandle>) -> Result<(), String> {
    let mut guard = state.session.lock().map_err(|e| e.to_string())?;
    if let Some(sess) = guard.take() {
        sess.stop.store(true, Ordering::SeqCst);
        let _ = sess.join.join();
    }
    Ok(())
}
