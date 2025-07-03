#!/bin/bash

#
# @file scripts/backup-database.sh
# @description Automated MariaDB backup script for HomeAssistant database
# @author Michael Lee
# @created 2025-07-03
# @modified 2025-07-03
# 
# This script performs cold backup of MariaDB database using mysqldump
# with compression and rotation to prevent disk space issues.
# 
# Modification Log:
# - 2025-07-03: Initial backup script with compression and rotation
# 
# Functions:
# - Database backup with mysqldump
# - Gzip compression for space efficiency
# - Backup rotation (keep 7 daily, 4 weekly)
# - Error handling and logging
# - Cleanup of old backups
# 
# Usage:
# - Run manually: ./backup-database.sh
# - Crontab: 0 2 * * * /path/to/backup-database.sh
# 
# Requirements:
# - MariaDB/MySQL client tools
# - Write permissions to backup directory
# - Database credentials in environment or config
#

# Configuration
DB_USER="hap"
DB_PASSWORD="lovejolin"
DB_NAME="HomeAssistant"
DB_HOST="127.0.0.1"

# Backup directory
BACKUP_DIR="/var/backups/homeassistant"
LOG_FILE="/var/log/homeassistant-backup.log"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="homeassistant_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Log function
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Start backup process
log_message "Starting MariaDB backup for database: $DB_NAME"

# Perform backup with mysqldump and compress
mysqldump \
    --host="$DB_HOST" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --quick \
    --lock-tables=false \
    --add-drop-database \
    --databases "$DB_NAME" | gzip > "$BACKUP_PATH"

# Check if backup was successful
if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
    log_message "Backup completed successfully: $BACKUP_FILE (Size: $BACKUP_SIZE)"
else
    log_message "ERROR: Backup failed for database: $DB_NAME"
    exit 1
fi

# Backup rotation - keep 7 daily backups
log_message "Starting backup rotation cleanup"

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "homeassistant_backup_*.sql.gz" -mtime +7 -delete

# Count remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "homeassistant_backup_*.sql.gz" | wc -l)
log_message "Backup rotation completed. Total backups: $BACKUP_COUNT"

# Weekly backup (copy Sunday's backup to weekly directory)
if [ "$(date +%u)" -eq 7 ]; then
    WEEKLY_DIR="${BACKUP_DIR}/weekly"
    mkdir -p "$WEEKLY_DIR"
    
    WEEKLY_BACKUP="homeassistant_weekly_$(date +%Y%m%d).sql.gz"
    cp "$BACKUP_PATH" "${WEEKLY_DIR}/${WEEKLY_BACKUP}"
    
    # Keep only 4 weekly backups
    find "$WEEKLY_DIR" -name "homeassistant_weekly_*.sql.gz" -mtime +28 -delete
    
    log_message "Weekly backup created: $WEEKLY_BACKUP"
fi

# Display backup summary
log_message "Backup process completed successfully"
log_message "Latest backup: $BACKUP_FILE"
log_message "Backup location: $BACKUP_PATH"

# Optional: Send notification or upload to cloud storage
# Uncomment and modify as needed
# curl -X POST "https://your-notification-service.com/notify" \
#     -d "message=HomeAssistant DB backup completed: $BACKUP_FILE"

exit 0