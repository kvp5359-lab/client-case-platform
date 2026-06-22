#!/usr/bin/env bash
#
# Blue/green деплой ClientCase на VPS. Выполняется на VPS через stdin:
#   ssh user@host "GH_PAT=.. REGISTRY=.. IMAGE_NAME=.. bash -s" < scripts/deploy-vps.sh
#
# Вынесен из deploy.yml, чтобы обернуть вызов в retry (интермиттирующие
# сетевые таймауты Actions->VPS) без дублирования логики. Идемпотентен:
# при неудаче держит текущий цвет живым, повторный запуск безопасен.
#
# Требуемые env: GH_PAT, REGISTRY, IMAGE_NAME.
set -e

cd /opt/clientcase

# Авторизация в GitHub Container Registry
echo "$GH_PAT" | docker login ghcr.io -u kvp5359-lab --password-stdin

# Загружаем новый образ
docker pull "$REGISTRY/$IMAGE_NAME:latest"

# ----- Zero-downtime blue/green switch -----
UPSTREAM_FILE=/opt/relostart/nginx/conf.d/clientcase-upstream.conf
CURRENT=$(grep -oE 'clientcase-app-(blue|green)' "$UPSTREAM_FILE" | head -1 | sed 's/.*-//')
[ -z "$CURRENT" ] && CURRENT=blue
if [ "$CURRENT" = "blue" ]; then NEXT=green; PORT=3006; else NEXT=blue; PORT=3005; fi
echo "Active: $CURRENT  ->  Deploying to: $NEXT (port $PORT)"

# Поднимаем второй цвет на новом образе
docker compose up -d --force-recreate "app-$NEXT"

# Ждём пока новый контейнер начнёт отдавать 200/302/307
echo "Waiting for app-$NEXT to become ready..."
READY=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" || echo 000)
  if [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; then
    echo "app-$NEXT ready (HTTP $code) after ${i} attempts"
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" != "1" ]; then
  echo "ERROR: app-$NEXT did not become ready — aborting, keeping $CURRENT live"
  docker compose logs --tail 80 "app-$NEXT"
  docker compose stop "app-$NEXT"
  exit 1
fi

# Атомарно переключаем nginx upstream на новый цвет
cat > "$UPSTREAM_FILE" <<EOF
# Managed by ClientCase deploy.yml — do not edit manually.
# Active blue/green target. Switched atomically by deploy script.
upstream clientcase {
    server clientcase-app-$NEXT:3000;
    keepalive 64;
}
EOF
cd /opt/relostart
# ВАЖНО: скрипт подаётся в `bash -s` через stdin (ssh ... < deploy-vps.sh).
# `docker compose exec` читает stdin и без `</dev/null` «съедает» остаток
# скрипта — тогда reload/stop/prune/финальный curl не выполнятся, а job
# завершится с кодом 0 («успех»), но трафик останется на старом цвете
# (инцидент 2026-06-22). Поэтому отвязываем stdin у всех exec-команд.
docker compose exec -T nginx nginx -t </dev/null
docker compose exec -T nginx nginx -s reload </dev/null

# Даём активным соединениям дотечь и гасим старый цвет
sleep 5
cd /opt/clientcase
docker compose stop "app-$CURRENT"

# Очищаем старые образы
docker image prune -f

# Финальная проверка
curl -fsSI https://clientcase.kvp-projects.com/ -o /dev/null && echo "Site live on $NEXT"
