#!/bin/bash

###############################################################################
# ExRetailOS Automated Backup Script
# Supports PostgreSQL, MSSQL, file backups, and cloud upload
#
# @created: 2024-12-18
# @author: ExRetailOS Team
###############################################################################

set -e  # Exit on error

# Configuration
BACKUP_DIR="/var/backups/exretailos"
LOG_DIR="/var/log/exretailos"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

# Database Configuration
DB_TYPE="${DB_TYPE:-postgresql}"  # postgresql or mssql
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-exretail}"
PG_PASSWORD="${PG_PASSWORD:-changeme}"
PG_DATABASE="${PG_DATABASE:-exretailos}"

# Cloud Storage (S3 compatible)
S3_ENABLED="${S3_ENABLED:-false}"
S3_BUCKET="${S3_BUCKET:-exretailos-backups}"
S3_ENDPOINT="${S3_ENDPOINT:-}"
AWS_ACCESS_KEY="${AWS_ACCESS_KEY:-}"
AWS_SECRET_KEY="${AWS_SECRET_KEY:-}"

# Encryption
ENCRYPT_BACKUP="${ENCRYPT_BACKUP:-true}"
GPG_KEY="${GPG_KEY:-backups@exretailos.com}"

# Notification
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
EMAIL_TO="${EMAIL_TO:-admin@exretailos.com}"

# Create directories
mkdir -p "$BACKUP_DIR"/{database,files,logs}
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/backup_$DATE.log"

###############################################################################
# Functions
###############################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo "[ERROR] $1" | tee -a "$LOG_FILE" >&2
    notify_failure "$1"
    exit 1
}

notify_slack() {
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$1\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
}

notify_failure() {
    notify_slack "❌ ExRetailOS Backup FAILED: $1"
    
    if [ -n "$EMAIL_TO" ]; then
        echo "Backup failed: $1" | mail -s "ExRetailOS Backup Failed" "$EMAIL_TO" || true
    fi
}

notify_success() {
    notify_slack "✅ ExRetailOS Backup Completed Successfully\nSize: $1\nDuration: $2"
}

###############################################################################
# PostgreSQL Backup
###############################################################################

backup_postgresql() {
    log "Starting PostgreSQL backup..."
    
    BACKUP_FILE="$BACKUP_DIR/database/postgres_${PG_DATABASE}_$DATE.sql"
    
    # Full database dump
    PGPASSWORD="$PG_PASSWORD" pg_dump \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d "$PG_DATABASE" \
        --format=custom \
        --compress=9 \
        --file="$BACKUP_FILE" \
        || error "PostgreSQL backup failed"
    
    log "PostgreSQL backup completed: $BACKUP_FILE"
    
    # Encrypt if enabled
    if [ "$ENCRYPT_BACKUP" = "true" ]; then
        encrypt_file "$BACKUP_FILE"
    fi
    
    # Compress
    gzip "$BACKUP_FILE" || error "Compression failed"
    BACKUP_FILE="${BACKUP_FILE}.gz"
    
    echo "$BACKUP_FILE"
}

###############################################################################
# MSSQL Backup
###############################################################################

backup_mssql() {
    log "Starting MSSQL backup..."
    
    BACKUP_FILE="$BACKUP_DIR/database/mssql_${PG_DATABASE}_$DATE.bak"
    
    # MSSQL backup using sqlcmd
    sqlcmd -S "$PG_HOST" -U "$PG_USER" -P "$PG_PASSWORD" -Q \
        "BACKUP DATABASE [$PG_DATABASE] TO DISK = N'$BACKUP_FILE' WITH COMPRESSION, STATS = 10" \
        || error "MSSQL backup failed"
    
    log "MSSQL backup completed: $BACKUP_FILE"
    
    if [ "$ENCRYPT_BACKUP" = "true" ]; then
        encrypt_file "$BACKUP_FILE"
    fi
    
    echo "$BACKUP_FILE"
}

###############################################################################
# File Backup (uploads, configs, etc.)
###############################################################################

backup_files() {
    log "Starting file backup..."
    
    BACKUP_FILE="$BACKUP_DIR/files/files_$DATE.tar.gz"
    
    # Backup important directories
    tar -czf "$BACKUP_FILE" \
        /opt/exretailos/backend/uploads \
        /opt/exretailos/backend/logs \
        /opt/exretailos/.env \
        /etc/exretailos \
        2>/dev/null || true
    
    log "File backup completed: $BACKUP_FILE"
    
    if [ "$ENCRYPT_BACKUP" = "true" ]; then
        encrypt_file "$BACKUP_FILE"
    fi
    
    echo "$BACKUP_FILE"
}

###############################################################################
# Encryption
###############################################################################

encrypt_file() {
    local file="$1"
    log "Encrypting $file..."
    
    gpg --encrypt --recipient "$GPG_KEY" "$file" || error "Encryption failed"
    rm "$file"  # Remove unencrypted file
    
    log "Encrypted: ${file}.gpg"
}

###############################################################################
# Cloud Upload (S3)
###############################################################################

upload_to_s3() {
    local file="$1"
    
    if [ "$S3_ENABLED" != "true" ]; then
        return 0
    fi
    
    log "Uploading to S3: $file"
    
    # Use AWS CLI
    export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY"
    
    aws s3 cp "$file" "s3://$S3_BUCKET/$(basename $file)" \
        --endpoint-url="$S3_ENDPOINT" \
        || error "S3 upload failed"
    
    log "S3 upload completed"
}

###############################################################################
# Cleanup old backups
###############################################################################

cleanup_old_backups() {
    log "Cleaning up old backups (older than $RETENTION_DAYS days)..."
    
    find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -delete
    
    log "Cleanup completed"
}

###############################################################################
# Verify backup integrity
###############################################################################

verify_backup() {
    local file="$1"
    
    log "Verifying backup integrity: $file"
    
    # Check file size
    size=$(stat -c%s "$file")
    if [ "$size" -lt 1000 ]; then
        error "Backup file too small, possibly corrupted: $file"
    fi
    
    # Verify gzip integrity
    if [[ "$file" == *.gz ]]; then
        gzip -t "$file" || error "Backup file corrupted: $file"
    fi
    
    log "Backup verified: $file (size: $size bytes)"
    echo "$size"
}

###############################################################################
# Main Execution
###############################################################################

main() {
    START_TIME=$(date +%s)
    
    log "========================================="
    log "ExRetailOS Backup Started"
    log "========================================="
    
    # Perform backups
    case "$DB_TYPE" in
        postgresql)
            BACKUP_FILE=$(backup_postgresql)
            ;;
        mssql)
            BACKUP_FILE=$(backup_mssql)
            ;;
        *)
            error "Unknown database type: $DB_TYPE"
            ;;
    esac
    
    # File backup
    FILES_BACKUP=$(backup_files)
    
    # Verify
    DB_SIZE=$(verify_backup "$BACKUP_FILE")
    FILES_SIZE=$(verify_backup "$FILES_BACKUP")
    
    # Upload to cloud
    upload_to_s3 "$BACKUP_FILE"
    upload_to_s3 "$FILES_BACKUP"
    
    # Cleanup
    cleanup_old_backups
    
    # Calculate duration
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    # Total size
    TOTAL_SIZE=$((DB_SIZE + FILES_SIZE))
    TOTAL_SIZE_MB=$((TOTAL_SIZE / 1024 / 1024))
    
    log "========================================="
    log "Backup Completed Successfully!"
    log "Database backup: $(basename $BACKUP_FILE)"
    log "Files backup: $(basename $FILES_BACKUP)"
    log "Total size: ${TOTAL_SIZE_MB} MB"
    log "Duration: ${DURATION} seconds"
    log "========================================="
    
    notify_success "${TOTAL_SIZE_MB} MB" "${DURATION}s"
}

# Run main function
main "$@"
