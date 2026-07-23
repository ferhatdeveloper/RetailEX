use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use chrono::Local;

pub fn log_sync_error(record_id: &str, action: &str, error: &str) {
    let log_entry = format!(
        "[{}] [ERROR] [Record: {}] [Action: {}] - Reason: {}\n",
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        record_id,
        action,
        error
    );

    let log_path = "sync_errors.log"; // Root directory for simplicity

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = file.write_all(log_entry.as_bytes());
    } else {
        eprintln!("Failed to write to log file: {}", log_entry);
    }
}

pub fn log_sync_success(record_id: &str, action: &str) {
    let log_entry = format!(
        "[{}] [SUCCESS] [Record: {}] [Action: {}] - Transferred Successfully\n",
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        record_id,
        action
    );

    let log_path = "sync_history.log";

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = file.write_all(log_entry.as_bytes());
    }
}

pub fn log_system_error(level: &str, context: &str, details: &str) {
    let log_entry = format!(
        "[{}] [{}] [{}] - {}\n",
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        level.to_uppercase(),
        context,
        details
    );

    let log_path = "retailex_system.log";

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = file.write_all(log_entry.as_bytes());
    } else {
        eprintln!("Failed to write to system log file: {}", log_entry);
    }
}

#[tauri::command]
pub fn log_from_frontend(level: String, context: String, details: String) {
    log_system_error(&level, &context, &details);
}

/// Writes a CRUD error as a JSON line to C:\RetailEX\log\crud_errors.json
#[tauri::command]
pub fn log_crud_error(payload: String) {
    let log_dir = Path::new(r"C:\RetailEX\log");
    if !log_dir.exists() {
        if let Err(e) = fs::create_dir_all(log_dir) {
            eprintln!("[logger] Failed to create log dir: {}", e);
            return;
        }
    }

    let log_path = log_dir.join("crud_errors.json");
    // Each call appends one JSON line (NDJSON format)
    let line = format!("{}\n", payload.trim());

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = file.write_all(line.as_bytes());
    } else {
        eprintln!("[logger] Failed to write crud error: {}", line);
    }
}
