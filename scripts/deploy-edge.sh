#!/usr/bin/env bash
# Деплой Edge Functions с автоматическим флагом --no-verify-jwt там, где он нужен.
# Убирает класс ошибок «забыл флаг → 401 от шлюза» (см. gotchas.md).
#
# Использование:
#   scripts/deploy-edge.sh <name> [<name> ...]   — задеплоить указанные
#   scripts/deploy-edge.sh --list-nojwt           — показать список функций с флагом
#   scripts/deploy-edge.sh --all                  — задеплоить ВСЕ (осторожно!)
#
# Требует установленный supabase CLI и линк проекта (project-ref ниже).
set -euo pipefail

PROJECT_REF="zjatohckcpiqmxkmfxbs"
FUNCTIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/functions"

# Функции, вызываемые БЕЗ пользовательского JWT (DB-триггеры, вебхуки сторонних
# сервисов) → шлюз Supabase отобьёт без --no-verify-jwt. Источник — gotchas.md +
# channels.md (матрица авторизации). Держать в синхроне при добавлении каналов.
NO_JWT_FUNCTIONS=(
  telegram-webhook
  telegram-webhook-v2
  telegram-business-webhook
  telegram-send-message
  telegram-business-send
  telegram-delete-message
  telegram-edit-message
  wazzup-webhook
  wazzup-send
  gmail-webhook
  email-internal-send
  impersonate-start
  fetch-telegram-avatar
  telegram-mtproto-delete
  telegram-business-delete
  wazzup-delete
  sync-source-documents
)

needs_no_jwt() {
  local name="$1"
  for f in "${NO_JWT_FUNCTIONS[@]}"; do
    [[ "$f" == "$name" ]] && return 0
  done
  return 1
}

if [[ "${1:-}" == "--list-nojwt" ]]; then
  printf '%s\n' "${NO_JWT_FUNCTIONS[@]}"
  exit 0
fi

targets=()
if [[ "${1:-}" == "--all" ]]; then
  for d in "$FUNCTIONS_DIR"/*/; do
    b="$(basename "$d")"
    [[ "$b" == "_shared" || "$b" == "types" ]] && continue
    targets+=("$b")
  done
else
  targets=("$@")
fi

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "Укажи имя функции, --all или --list-nojwt" >&2
  exit 1
fi

for name in "${targets[@]}"; do
  if [[ ! -d "$FUNCTIONS_DIR/$name" ]]; then
    echo "✗ Нет такой функции: $name" >&2
    continue
  fi
  if needs_no_jwt "$name"; then
    echo "→ deploy $name (--no-verify-jwt)"
    supabase functions deploy "$name" --no-verify-jwt --project-ref "$PROJECT_REF"
  else
    echo "→ deploy $name"
    supabase functions deploy "$name" --project-ref "$PROJECT_REF"
  fi
done
echo "✓ Готово."
