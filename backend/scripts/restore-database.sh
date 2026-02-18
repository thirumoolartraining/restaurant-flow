#!/bin/bash
# Database Restore Script
# Phase 5.3: Database Management

# Configuration
BACKUP_DIR="/backup/mongodb"
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/restaurant"}

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: ./restore-database.sh <backup-file>"
    echo "Available backups:"
    ls -lh $BACKUP_DIR/*.tar.gz
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Extract backup
echo "Extracting backup..."
TEMP_DIR=$(mktemp -d)
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Restore database
echo "Restoring MongoDB..."
mongorestore --uri="$MONGODB_URI" --drop "$TEMP_DIR"

# Check if restore was successful
if [ $? -eq 0 ]; then
    echo "✅ Database restored successfully from: $BACKUP_FILE"
    rm -rf "$TEMP_DIR"
else
    echo "❌ Restore failed!"
    rm -rf "$TEMP_DIR"
    exit 1
fi
