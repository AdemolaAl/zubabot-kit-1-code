#!/bin/bash
# Safe update: users keep everything (accounts, deposits, coins, chats, follow-ups). Run from the unzipped NEW kit folder:
#   sudo bash deploy/update.sh
# 1) backs up the database, 2) copies the new code but NEVER your .env, database, config.js or anything your team edited
#    (knowledge files edited in Admin, landing pages with pasted pixels): those are kept and the new version is saved
#    next to them as <file>.new, 3) restarts gracefully, 4) checks /api/health and rolls back the CODE if it fails
#    (the database is never rolled back, so no new sign-ups or deposits are lost).
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"; DST=${ZB_DIR:-/opt/zubabot}; TS=$(date +%F-%H%M)
copydir() { local from="$1" to="$2"; shift 2; mkdir -p "$to"; local ex=(); for e in "$@"; do ex+=(--exclude="$e"); done; tar -C "$from" "${ex[@]}" -cf - . | tar -C "$to" -xf -; }
echo "→ backup database"; $DST/deploy/backup.sh 2>/dev/null || true
mkdir -p $DST/releases
tar --exclude='*.db' --exclude='*.db-wal' --exclude='*.db-shm' --exclude='.env' -czf $DST/releases/code-before-$TS.tgz -C $DST server web site deploy tools 2>/dev/null || true

# files the team may edit: only replaced if they are still exactly as we shipped them last time
OLDMAN=$DST/deploy/shipped.sha256; NEWMAN=$SRC/deploy/shipped.sha256
smart_copy() {   # $1 = path relative to the kit root
  local rel="$1" src="$SRC/$1" dst="$DST/$1"
  mkdir -p "$(dirname "$dst")"
  if [ ! -f "$dst" ]; then cp "$src" "$dst"; return; fi
  local now old; now=$(sha256sum "$dst" | cut -d' ' -f1); old=$(grep "  $rel\$" "$OLDMAN" 2>/dev/null | cut -d' ' -f1)
  if [ "$now" = "$old" ] || cmp -s "$src" "$dst"; then cp "$src" "$dst"
  else cp "$src" "$dst.new"; echo "  kept your edited $rel (new version saved as $rel.new)"; fi
}
echo "→ copy new files"
copydir "$SRC/server" $DST/server '.env' '*.db' '*.db-wal' '*.db-shm' './knowledge/*.md'
for f in "$SRC"/server/knowledge/*.md; do [ "$(basename "$f")" = "90-team-notes.md" ] && [ -f "$DST/server/knowledge/90-team-notes.md" ] && continue; smart_copy "server/knowledge/$(basename "$f")"; done
copydir "$SRC/web" $DST/web './config.js'
[ -f $DST/web/config.js ] || cp "$SRC/web/config.js" $DST/web/config.js
if [ -d "$SRC/site" ]; then copydir "$SRC/site" $DST/site '*.html'; for f in "$SRC"/site/*.html; do smart_copy "site/$(basename "$f")"; done; fi
copydir "$SRC/deploy" $DST/deploy; [ -d "$SRC/tools" ] && copydir "$SRC/tools" $DST/tools
cp "$NEWMAN" "$OLDMAN" 2>/dev/null || true
[ -n "$NO_RESTART" ] && { echo "✓ files updated (no restart)"; exit 0; }
if ! cmp -s $DST/deploy/zubabot.service /etc/systemd/system/zubabot.service; then cp $DST/deploy/zubabot.service /etc/systemd/system/zubabot.service && systemctl daemon-reload && echo "  service file updated"; fi
cmp -s $DST/deploy/Caddyfile /etc/caddy/Caddyfile 2>/dev/null || echo "  NOTE: deploy/Caddyfile differs from /etc/caddy/Caddyfile. If you did not edit yours: sudo cp $DST/deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy"
chown -R zubabot $DST
echo "→ restart (requests in flight finish first)"; systemctl restart zubabot; sleep 4
P=$(grep -oE '^PORT=[0-9]+' $DST/server/.env 2>/dev/null | cut -d= -f2); P=${P:-8080}
if curl -fsS http://127.0.0.1:$P/api/health >/dev/null; then echo "✓ updated ($TS)"
else echo "✗ new version did not start: restoring the previous code (database untouched)"
  tar -xzf $DST/releases/code-before-$TS.tgz -C $DST; chown -R zubabot $DST; systemctl restart zubabot; exit 1; fi
