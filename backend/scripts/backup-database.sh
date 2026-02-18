#!/bin/bash
# Database Backup Script
# Phase 5.3: Database Management

# Configuration
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/restaurant"}
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Perform backup
echo "Starting MongoDB backup..."
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "✅ Backup completed successfully: $BACKUP_DIR/$DATE"
    
    # Compress backup
    cd $BACKUP_DIR
    tar -czf "$DATE.tar.gz" "$DATE"
    rm -rf "$DATE"
    echo "✅ Backup compressed: $DATE.tar.gz"
    
    # Remove old backups
    find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
    echo "✅ Old backups cleaned (retention: $RETENTION_DAYS days)"
else
    echo "❌ Backup failed!"
    exit 1
fi
