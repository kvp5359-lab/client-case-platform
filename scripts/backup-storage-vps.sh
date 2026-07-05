#!/bin/sh
# Референс: обёртка ночного бэкапа Storage на VPS (реальная копия лежит в
# /opt/clientcase/scripts/backup-storage.sh, вне git — /opt/clientcase не репо).
#
# Крон (crontab -l на VPS):
#   30 3 * * * /opt/clientcase/scripts/backup-storage.sh >> /var/log/clientcase-storage-backup.log 2>&1
#
# Качает новые/изменённые объекты приватных бакетов (files, document-files,
# message-attachments, document-templates) в /opt/clientcase/storage-backup.
# Env берёт из mtproto-service/.env (там SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
set -e
cd /opt/clientcase
export $(grep -E "^SUPABASE_(URL|SERVICE_ROLE_KEY)=" mtproto-service/.env | xargs)
exec docker run --rm \
  -v /opt/clientcase/scripts:/scripts:ro \
  -v /opt/clientcase/storage-backup:/backup \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -e BACKUP_DIR=/backup \
  node:22-alpine node /scripts/backup-storage.mjs
