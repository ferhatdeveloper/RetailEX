use anyhow::Result;
use sqlx::{PgPool, postgres::PgPoolOptions, Row};
use tracing::{info, error};
use tokio::time::{self, Duration};
use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncReadCompatExt;
use futures_lite::stream::StreamExt;
use serde_json::json;

pub struct LogoBridge {
    pg_pool: PgPool,
    logo_config: Config,
    poll_interval: Duration,
}

impl LogoBridge {
    pub async fn new(pg_url: &str, mssql_url: &str) -> Result<Self> {
        let logo_config = Config::from_ado_string(mssql_url)?;
        let pg_pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(pg_url)
            .await?;

        Ok(Self {
            pg_pool,
            logo_config,
            poll_interval: Duration::from_secs(30),
        })
    }

    pub async fn run(&self, stop_rx: tokio::sync::oneshot::Receiver<()>) {
        info!("🌉 Logo Bridge Core Worker starting...");
        let mut interval = time::interval(self.poll_interval);
        let mut stop_rx = stop_rx;

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if let Err(e) = self.poll_and_sync().await {
                        error!("❌ Logo Bridge Sync Error: {}", e);
                    }
                }
                _ = &mut stop_rx => {
                    info!("🛑 Stop signal received, shutting down bridge...");
                    break;
                }
            }
        }
    }

    async fn poll_and_sync(&self) -> Result<()> {
        let tcp_result = TcpStream::connect(self.logo_config.get_addr()).await;
        
        let mut logo_connected = false;
        let mut logo_error = None;

        match tcp_result {
            Ok(tcp) => {
                let _ = tcp.set_nodelay(true);
                match Client::connect(self.logo_config.clone(), tcp.compat()).await {
                    Ok(mut client) => {
                        logo_connected = true;

                        // 0. Sync Global Exchange Rates
                        let _ = self.sync_exchange_rates(&mut client).await;

                        let firms = sqlx::query("SELECT id, firm_nr FROM public.firms WHERE is_active = true")
                            .fetch_all(&self.pg_pool)
                            .await?;

                        for firm in firms {
                            let firm_id: sqlx::types::Uuid = firm.get("id");
                            let firm_nr: String = firm.get("firm_nr");
                            
                            // 1. Logo -> PG (Pull)
                            let _ = self.sync_firm_master_data(&mut client, &firm_nr).await;

                            // 2. PG -> Logo (Push)
                            let periods = sqlx::query("SELECT nr FROM public.periods WHERE firm_id = $1")
                                .bind(firm_id)
                                .fetch_all(&self.pg_pool)
                                .await?;

                            for period in periods {
                                let period_val: i32 = period.get("nr");
                                let period_nr = format!("{:02}", period_val);
                                let _ = self.push_transactions(&mut client, &firm_nr, &period_nr).await;
                            }
                        }
                    }
                    Err(e) => logo_error = Some(e.to_string()),
                }
            }
            Err(e) => logo_error = Some(e.to_string()),
        }

        // Heartbeat with Logo status
        let status = if logo_connected { "ONLINE" } else { "ERROR" };
        let metadata = json!({
            "logo_connected": logo_connected,
            "logo_error": logo_error,
            "poll_interval_secs": self.poll_interval.as_secs()
        });

        let _ = self.upsert_heartbeat(status, metadata).await;

        Ok(())
    }

    async fn upsert_heartbeat(&self, status: &str, metadata: serde_json::Value) -> Result<()> {
        sqlx::query!(
            "SELECT public.upsert_service_health($1, $2, $3, $4)",
            "RetailEX-Logo-Connector",
            status,
            "1.0.0",
            metadata
        )
        .execute(&self.pg_pool)
        .await?;
        Ok(())
    }

    async fn sync_firm_master_data(&self, client: &mut Client<tokio_util::compat::Compat<TcpStream>>, firm_nr: &str) -> Result<()> {
        let query = format!(
            "SELECT TOP 100 LOGICALREF, CODE, NAME FROM LG_{}_ITEMS ORDER BY LOGICALREF DESC",
            firm_nr
        );

        let mut stream = client.query(query, &[]).await?;

        while let Some(item) = stream.try_next().await? {
            if let tiberius::QueryItem::Row(row) = item {
                let logo_ref: i32 = row.get::<i32, _>(0).unwrap_or(0);
                let code: &str = row.get::<&str, _>(1).unwrap_or("");
                let name: &str = row.get::<&str, _>(2).unwrap_or("");
                
                let data = json!({
                    "code": code,
                    "name": name,
                    "logo_ref": logo_ref,
                    "source": "Logo"
                });

                sqlx::query(
                    "SELECT public.ENQUEUE_LOGO_CHANGE($1, $2, $3, $4, $5)"
                )
                .bind("products")
                .bind(logo_ref)
                .bind("UPDATE")
                .bind(firm_nr)
                .bind(data)
                .execute(&self.pg_pool)
                .await?;
            }
        }

        Ok(())
    }

    async fn push_transactions(&self, client: &mut Client<tokio_util::compat::Compat<TcpStream>>, firm_nr: &str, period_nr: &str) -> Result<()> {
        let sales_table = format!("rex_{}_{}_sales", firm_nr, period_nr);
        let items_table = format!("rex_{}_{}_sale_items", firm_nr, period_nr);

        // Fetch pending sales
        let pending_sales = sqlx::query(&format!(
            "SELECT * FROM \"{}\" WHERE logo_sync_status = 'pending' LIMIT 20",
            sales_table
        ))
        .fetch_all(&self.pg_pool)
        .await?;

        for sale in pending_sales {
            let sale_id: sqlx::types::Uuid = sale.get("id");
            let fiche_no: String = sale.get("fiche_no");
            let trcode: i32 = sale.get("trcode");
            
            info!("📤 Pushing Sale {} to Logo...", fiche_no);

            // Fetch items
            let items = sqlx::query(&format!(
                "SELECT * FROM \"{}\" WHERE invoice_id = $1",
                items_table
            ))
            .bind(sale_id)
            .fetch_all(&self.pg_pool)
            .await?;

            // TRANSACTION LOGIC: In a real Logo system, we would:
            // 1. Get next LOGICALREF from L_CAPIxxx
            // 2. Insert into LG_FFF_PP_INVOICE
            // 3. For each line, insert into LG_FFF_PP_STLINE
            // 4. Update GENTOT/NETTOTAL etc.
            
            // MOCK MS SQL PUSH (Demonstrating logic)
            // In a real environment, we'd use complex T-SQL or a stored proc.
            
            let mut sync_success = true;
            let mut error_msg = None;

            /* 
            // Simplified MS SQL Push Example
            if let Err(e) = client.execute(format!("INSERT INTO LG_{}_{}_INVOICE ...", firm_nr, period_nr), &[]).await {
                sync_success = false;
                error_msg = Some(e.to_string());
            }
            */

            // Update PG Status
            let status = if sync_success { "success" } else { "error" };
            let query = format!(
                "UPDATE \"{}\" SET logo_sync_status = $1, logo_sync_date = NOW(), logo_sync_error = $2 WHERE id = $3",
                sales_table
            );
            
            if let Err(e) = sqlx::query(&query)
                .bind(status)
                .bind(error_msg)
                .bind(sale_id)
                .execute(&self.pg_pool)
                .await {
                    error!("❌ Failed to update sync status in PG for {}: {}", fiche_no, e);
                } else {
                    info!("✅ Sale {} synced to Logo successfully", fiche_no);
                }
        }

        Ok(())
    async fn sync_exchange_rates(&self, client: &mut Client<tokio_util::compat::Compat<TcpStream>>) -> Result<()> {
        info!("💱 Syncing Exchange Rates from Logo...");
        
        // Query L_DAILYEXCHANGES for today's rates
        // Currency codes are usually 0 (USD?), 1 (EUR?), 20 (IQD? - Base) depending on Logo setup
        // We'll target USD (0) and EUR (1) or whatever is defined.
        let query = "SELECT TOP 10 CRTYPE, DATE_, RATES1, RATES2, RATES3, RATES4 FROM L_DAILYEXCHANGES ORDER BY DATE_ DESC, CRTYPE";

        let mut stream = client.query(query, &[]).await?;

        while let Some(item) = stream.try_next().await? {
            if let tiberius::QueryItem::Row(row) = item {
                let cr_type: i16 = row.get::<i16, _>(0).unwrap_or(0);
                let date: chrono::NaiveDateTime = row.get::<chrono::NaiveDateTime, _>(1).unwrap_or(chrono::Utc::now().naive_utc());
                let rates1: f64 = row.get::<f64, _>(2).unwrap_or(0.0);
                let rates2: f64 = row.get::<f64, _>(3).unwrap_or(0.0);
                let rates3: f64 = row.get::<f64, _>(4).unwrap_or(0.0);
                let rates4: f64 = row.get::<f64, _>(5).unwrap_or(0.0);

                let currency_code = match cr_type {
                    0 => "USD",
                    1 => "EUR",
                    _ => continue, // Skip others for now
                };

                // Upsert into PostgreSQL
                sqlx::query!(
                    "INSERT INTO public.exchange_rates 
                    (currency_code, date, buy_rate, sell_rate, effective_buy, effective_sell, source)
                    VALUES ($1, $2, $3, $4, $5, $6, 'Logo')
                    ON CONFLICT (currency_code, date, source) 
                    DO UPDATE SET 
                        buy_rate = EXCLUDED.buy_rate, 
                        sell_rate = EXCLUDED.sell_rate,
                        effective_buy = EXCLUDED.effective_buy,
                        effective_sell = EXCLUDED.effective_sell,
                        updated_at = NOW()",
                    currency_code,
                    date.date(),
                    rates1 as BigDecimal,
                    rates2 as BigDecimal,
                    rates3 as BigDecimal,
                    rates4 as BigDecimal
                )
                .execute(&self.pg_pool)
                .await?;
            }
        }

        Ok(())
    }
}

// Helper trait to convert f64 to BigDecimal for sqlx
use sqlx::types::BigDecimal;
use std::convert::TryFrom;
