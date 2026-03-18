-- İade işlemlerini kayıt altına almak için log tablosu (sebep zorunlu, rapor için)
CREATE TABLE IF NOT EXISTS rest.return_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number   VARCHAR(50) NOT NULL,
    original_receipt VARCHAR(100),
    product_id      UUID,
    product_name    VARCHAR(255) NOT NULL,
    quantity        DECIMAL(15,3) NOT NULL DEFAULT 1,
    unit_price      DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
    return_reason   TEXT NOT NULL,
    staff_name     VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_return_log_created_at ON rest.return_log(created_at);
CREATE INDEX IF NOT EXISTS idx_return_log_reason ON rest.return_log(return_reason);
