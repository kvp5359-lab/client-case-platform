# Скрипт `scripts/deploy-edge.sh` с whitelist'ом `--no-verify-jwt`

**Дата создания:** 2026-05-28
**Тип:** tooling / safety
**Приоритет:** средний (предотвращение знакомой ошибки)

---

## Проблема

Edge functions делятся на две группы:

- **С пользовательским JWT** (`verify_jwt = true` по умолчанию). Юзер вызывает через `supabase.functions.invoke(...)`, шлюз проверяет Authorization.
- **Без JWT** (`--no-verify-jwt` при деплое). Вызываются pg-триггером (`net.http_post`), webhook'ом от Telegram/Wazzup, или внутренним cron'ом. У них собственная защита (`x-internal-secret`, secret в URL, или валидация в коде).

Правило задокументировано в [`.claude/rules/gotchas.md`](../../.claude/rules/gotchas.md) → раздел «--no-verify-jwt для webhook и *-send». **Но опираться на память человека опасно:**

- 2026-05-28 ~10:15 UTC я задеплоил 5 send-функций без флага → шлюз отбивал pg-триггер с 401 → одно сообщение клиенту не доставилось (см. [bug-doc](../bugs/open/2026-05-28-telegram-send-stuck-pending.md), раздел «Инцидент»).

CLI `supabase functions deploy <name>` сам по себе не подсказывает что для конкретной функции нужен флаг — это знание живёт у человека.

---

## Решение

`scripts/deploy-edge.sh <function-name> [<function-name> ...]` — обёртка над `supabase functions deploy`, которая:

1. **Whitelist:** массив имён функций, требующих `--no-verify-jwt`. Сам список — единственный источник правды (синхронизирован с gotchas).
2. Для каждой переданной функции:
   - Если в whitelist'е — деплой с `--no-verify-jwt`, печать «🔓 deployed without JWT verification».
   - Если нет — обычный деплой, печать «🔒 deployed with JWT verification».
3. `--project-ref` — берётся из `.env` или передаётся флагом.
4. Поддержка `--all` — деплой всех функций из директории `supabase/functions/`.

### Whitelist (на 2026-05-28)

```bash
NO_JWT_FUNCTIONS=(
  # webhook'и (вызываются сторонними сервисами)
  "telegram-webhook"
  "telegram-webhook-v2"
  "telegram-business-webhook"
  "wazzup-webhook"
  "gmail-webhook"

  # *-send (вызываются pg-триггером notify_telegram_on_new_message)
  "telegram-send-message"
  "telegram-business-send"
  "telegram-mtproto-send"
  "wazzup-send"
  "email-internal-send"

  # impersonation (вызывается со специальным claim'ом)
  "impersonate-start"

  # фоновые
  "fetch-telegram-avatar"
)
```

### Использование

```bash
# Один файл
./scripts/deploy-edge.sh telegram-send-message

# Несколько
./scripts/deploy-edge.sh telegram-send-message telegram-mtproto-send wazzup-send

# Все функции
./scripts/deploy-edge.sh --all
```

### Защита от ошибки

Если человек забыл флаг для функции из whitelist'а — скрипт **всё равно** деплоит её с `--no-verify-jwt`. Невозможно сделать ошибку через скрипт. Это и есть цель.

Обратная защита (если случайно положить функцию в whitelist, которой флаг не нужен) — менее критична: внутри функции своя JWT-проверка, безопасность не падает.

---

## Что НЕ нужно добавлять

- **Не deploy через GitHub Actions.** Edge functions у нас деплоятся вручную через CLI (см. `infrastructure.md` → раздел Supabase). Это намеренно — карантинная зона, человек должен явно подтвердить каждый деплой. Скрипт не меняет процесс, только параметризует команду.
- **Не CI-проверка `--no-verify-jwt`.** Сложно понять из кода функции — нужен ли ей флаг. Whitelist надёжнее.
- **Не обновление gotchas.md скриптом.** Скрипт читает whitelist из себя, gotchas — для людей. Синхронизация — ручная (раз в год при добавлении новой функции).

---

## Скоуп

- Один shell-скрипт ~50 строк.
- README обновить (или infrastructure.md): упомянуть `scripts/deploy-edge.sh` как preferred-способ деплоя.

Сложность: ~30 минут.

## Связано

- [`.claude/rules/gotchas.md`](../../.claude/rules/gotchas.md) → «--no-verify-jwt для webhook и *-send»
- [bug 2026-05-28-telegram-send-stuck-pending](../bugs/open/2026-05-28-telegram-send-stuck-pending.md) → «Инцидент» — спровоцировавший этот backlog
