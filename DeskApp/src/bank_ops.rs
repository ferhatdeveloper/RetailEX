use serde::{Deserialize, Serialize};
use tauri::command;
use tokio_postgres::NoTls;
use uuid::Uuid;
use crate::db_utils::format_pg_error;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BankRegister {
    pub id: Option<String>,
    pub code: String,
    pub bank_name: String,
    pub branch_name: Option<String>,
    pub account_no: Option<String>,
    pub iban: Option<String>,
    pub currency_code: String,
    pub balance: f64,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BankTransaction {
    pub id: Option<String>,
    pub register_id: String,
    pub fiche_no: Option<String>,
    pub date: String,
    pub amount: f64,
    pub sign: i32, // 1 for Inflow, -1 for Outflow
    pub is_active: bool,
    pub definition: Option<String>,
    pub transaction_type: Option<String>,
    pub created_at: Option<String>,
}

#[command]
pub async fn get_bank_registers(
    firm_nr: String,
    db_path: String,
    user: String,
    pass: String,
) -> Result<Vec<BankRegister>, String> {
    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let host_port_str = db_path.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        host_part, port, user, pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("DB Connection Error: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let table_name = format!("rex_{}_bank_registers", firm_nr);
    let query = format!(
        "SELECT id, code, bank_name, branch_name, account_no, iban, currency_code, balance, is_active, created_at, updated_at 
         FROM public.{} 
         ORDER BY created_at DESC",
        table_name
    );

    let rows = client
        .query(&query, &[])
        .await
        .map_err(|e| format!("Query Error: {}", e))?;

    let mut registers = Vec::new();
    for row in rows {
        registers.push(BankRegister {
            id: Some(row.get::<_, Uuid>(0).to_string()),
            code: row.get(1),
            bank_name: row.get(2),
            branch_name: row.get(3),
            account_no: row.get(4),
            iban: row.get(5),
            currency_code: row.get(6),
            balance: row.get::<_, rust_decimal::Decimal>(7).to_string().parse().unwrap_or(0.0),
            is_active: row.get(8),
            created_at: row.get::<_, Option<chrono::DateTime<chrono::Utc>>>(9).map(|dt| dt.to_rfc3339()),
            updated_at: row.get::<_, Option<chrono::DateTime<chrono::Utc>>>(10).map(|dt| dt.to_rfc3339()),
        });
    }

    Ok(registers)
}

#[command]
pub async fn save_bank_register(
    firm_nr: String,
    register: BankRegister,
    db_path: String,
    user: String,
    pass: String,
) -> Result<String, String> {
    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let host_port_str = db_path.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        host_part, port, user, pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("DB Connection Error: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let table_name = format!("rex_{}_bank_registers", firm_nr);

    if let Some(id) = register.id {
        // Update existing
        let query = format!(
            "UPDATE public.{} 
             SET code = $1, bank_name = $2, branch_name = $3, account_no = $4, iban = $5, 
                 currency_code = $6, balance = $7, is_active = $8, updated_at = NOW()
             WHERE id = $9",
            table_name
        );

        client
            .execute(
                &query,
                &[
                    &register.code,
                    &register.bank_name,
                    &register.branch_name,
                    &register.account_no,
                    &register.iban,
                    &register.currency_code,
                    &rust_decimal::Decimal::from_f64_retain(register.balance).unwrap(),
                    &register.is_active,
                    &Uuid::parse_str(&id).map_err(|e| format!("Invalid UUID: {}", e))?,
                ],
            )
            .await
            .map_err(|e| format!("Update Error: {}", format_pg_error(e)))?;

        Ok(id)
    } else {
        // Insert new
        let new_id = Uuid::new_v4();
        let query = format!(
            "INSERT INTO public.{} (id, code, bank_name, branch_name, account_no, iban, currency_code, balance, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            table_name
        );

        client
            .execute(
                &query,
                &[
                    &new_id,
                    &register.code,
                    &register.bank_name,
                    &register.branch_name,
                    &register.account_no,
                    &register.iban,
                    &register.currency_code,
                    &rust_decimal::Decimal::from_f64_retain(register.balance).unwrap(),
                    &register.is_active,
                ],
            )
            .await
            .map_err(|e| format!("Insert Error: {}", format_pg_error(e)))?;

        Ok(new_id.to_string())
    }
}

#[command]
pub async fn get_bank_transactions(
    firm_nr: String,
    register_id: Option<String>,
    db_path: String,
    user: String,
    pass: String,
) -> Result<Vec<BankTransaction>, String> {
    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let host_port_str = db_path.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        host_part, port, user, pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("DB Connection Error: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let table_name = format!("rex_{}_bank_lines", firm_nr);
    let query = if let Some(reg_id) = register_id {
        format!(
            "SELECT id, register_id, fiche_no, date, amount, sign, is_active, definition, transaction_type, created_at 
             FROM public.{} 
             WHERE register_id = '{}' 
             ORDER BY date DESC",
            table_name, reg_id
        )
    } else {
        format!(
            "SELECT id, register_id, fiche_no, date, amount, sign, is_active, definition, transaction_type, created_at 
             FROM public.{} 
             ORDER BY date DESC",
            table_name
        )
    };

    let rows = client
        .query(&query, &[])
        .await
        .map_err(|e| format!("Query Error: {}", e))?;

    let mut transactions = Vec::new();
    for row in rows {
        transactions.push(BankTransaction {
            id: Some(row.get::<_, Uuid>(0).to_string()),
            register_id: row.get::<_, Uuid>(1).to_string(),
            fiche_no: row.get(2),
            date: row.get::<_, chrono::DateTime<chrono::Utc>>(3).to_rfc3339(),
            amount: row.get::<_, rust_decimal::Decimal>(4).to_string().parse().unwrap_or(0.0),
            sign: row.get(5),
            is_active: row.get(6),
            definition: row.get(7),
            transaction_type: row.get(8),
            created_at: row.get::<_, Option<chrono::DateTime<chrono::Utc>>>(9).map(|dt| dt.to_rfc3339()),
        });
    }

    Ok(transactions)
}

#[command]
pub async fn save_bank_transaction(
    firm_nr: String,
    transaction: BankTransaction,
    db_path: String,
    user: String,
    pass: String,
) -> Result<String, String> {
    let host_part = db_path.split(':').next().unwrap_or("localhost");
    let host_port_str = db_path.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };
    let db_name = db_path.split('/').last().unwrap_or("retailex_local");

    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        host_part, port, user, pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| format!("DB Connection Error: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let table_name = format!("rex_{}_bank_lines", firm_nr);
    let register_table = format!("rex_{}_bank_registers", firm_nr);

    let new_id = Uuid::new_v4();
    let query = format!(
        "INSERT INTO public.{} (id, register_id, fiche_no, date, amount, sign, is_active, definition, transaction_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        table_name
    );

    client
        .execute(
            &query,
            &[
                &new_id,
                &Uuid::parse_str(&transaction.register_id).map_err(|e| format!("Invalid UUID: {}", e))?,
                &transaction.fiche_no,
                &chrono::DateTime::parse_from_rfc3339(&transaction.date)
                    .map_err(|e| format!("Invalid date: {}", e))?
                    .with_timezone(&chrono::Utc),
                &rust_decimal::Decimal::from_f64_retain(transaction.amount).unwrap(),
                &transaction.sign,
                &transaction.is_active,
                &transaction.definition,
                &transaction.transaction_type,
            ],
        )
        .await
        .map_err(|e| format!("Insert Error: {}", format_pg_error(e)))?;

    // Update register balance
    let balance_update = format!(
        "UPDATE public.{} 
         SET balance = balance + ($1 * $2), updated_at = NOW()
         WHERE id = $3",
        register_table
    );

    client
        .execute(
            &balance_update,
            &[
                &rust_decimal::Decimal::from_f64_retain(transaction.amount).unwrap(),
                &transaction.sign,
                &Uuid::parse_str(&transaction.register_id).map_err(|e| format!("Invalid UUID: {}", e))?,
            ],
        )
        .await
        .map_err(|e| format!("Balance Update Error: {}", format_pg_error(e)))?;

    Ok(new_id.to_string())
}
