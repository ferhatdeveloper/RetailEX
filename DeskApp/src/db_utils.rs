use tokio_postgres::Error;

/// PostgreSQL 3D000 — hedef veritabanı yok.
pub fn is_database_does_not_exist(e: &Error) -> bool {
    if let Some(code) = e.code() {
        if code.code() == "3D000" {
            return true;
        }
    }
    let s = e.to_string().to_lowercase();
    s.contains("3d000") || (s.contains("database") && s.contains("does not exist"))
}

pub fn format_pg_error(e: Error) -> String {
    let mut details = Vec::new();

    // Standard error code (e.g., 28P01, 42601)
    if let Some(code) = e.code() {
        details.push(format!("Code: {}", code.code()));
    }

    // tokio_postgres::Error Display = "db error" (Kind::Db); asıl metin DbError::Display içinde.
    let primary = e
        .as_db_error()
        .map(|d| format!("{}", d))
        .unwrap_or_else(|| e.to_string());
    details.push(format!("Message: {}", primary));

    if let Some(db_err) = e.as_db_error() {
        if let Some(pos) = db_err.position() {
            details.push(format!("Position: {:?}", pos));
        }
        if let Some(detail) = db_err.detail() {
            details.push(format!("Detail: {}", detail));
        }
        if let Some(hint) = db_err.hint() {
            details.push(format!("Hint: {}", hint));
        }
        if let Some(where_ctx) = db_err.where_() {
            details.push(format!("Context: {}", where_ctx));
        }
    }

    format!("PG Error {}", details.join(" | "))
}
