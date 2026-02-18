use std::fs::OpenOptions;
use std::io::Write;
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
