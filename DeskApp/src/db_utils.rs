use tokio_postgres::Error;

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
