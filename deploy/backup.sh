#!/bin/sh
# Daily copy of the database (add to crontab: 0 3 * * * /opt/zubabot/deploy/backup.sh)
mkdir -p /opt/zubabot/backups
sqlite3 /opt/zubabot/server/zubabot.db ".backup '/opt/zubabot/backups/zubabot-$(date +%F).db'" 2>/dev/null || cp /opt/zubabot/server/zubabot.db /opt/zubabot/backups/zubabot-$(date +%F).db
find /opt/zubabot/backups -name 'zubabot-*.db' -mtime +14 -delete
# pictures users sent to support: keep 30 days
find /opt/zubabot/server/uploads -type f -mtime +30 -delete 2>/dev/null || true
