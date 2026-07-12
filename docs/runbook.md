# 🚑 Runbook — что делать при инцидентах

> **Назначение.** Action-инструкции для оперативных ситуаций: не «почему сломалось»
> (это в [`messenger-ledger.md`](../.claude/rules/messenger-ledger.md) и
> [`gotchas.md`](../.claude/rules/gotchas.md)), а **что нажать прямо сейчас**.
> Рассчитан на того, кто НЕ держит проект в голове (новый человек, AI-ассистент,
> ты сам через полгода). Каждый пункт: **симптом → диагностика → действие → эскалация**.
>
> Доступы, которые могут понадобиться: `ssh vps`, Supabase CLI (залогинен),
> `SUPABASE_SERVICE_ROLE_KEY` (в `mtproto-service/.env` на VPS), MCP Supabase.
> Общая карта проекта — [`.claude/rules/infrastructure.md`](../.claude/rules/infrastructure.md).

---

## 0. Первичная диагностика (с чего начать ЛЮБОЙ инцидент)

```bash
# Здоровье каналов (застрявшие отправки, незакрытые failures, Gmail watch, mtproto):
SUPABASE_URL=https://zjatohckcpiqmxkmfxbs.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<ключ> node scripts/channel-health.mjs

# Дрейф схемы репо↔прод + инварианты БД:
node scripts/db-drift-check.mjs
node scripts/check-db-invariants.mjs
```
Ключ: `ssh vps 'grep SUPABASE_SERVICE_ROLE_KEY /opt/clientcase/mtproto-service/.env'` (не светить в чат).

---

## 1. Не уходят исходящие сообщения (висят «Отправляется» / «Повторить»)

**Диагностика** (MCP `execute_sql` или Supabase SQL):
```sql
-- застрявшие исходящие
SELECT id, thread_id, send_status, telegram_error_detail, created_at
FROM project_messages
WHERE send_status IN ('pending','failed') AND source='web'
ORDER BY created_at DESC LIMIT 20;

-- ответы шлюза/каналов (ошибки доставки)
SELECT status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 10;
```
**Действие:**
- `401` от шлюза (тело пустое/generic) → функция задеплоена без флага. Передеплой:
  `scripts/deploy-edge.sh <имя>` (флаг `--no-verify-jwt` проставится сам).
- `401` от нашего кода (`{"error":"Unauthorized"}`) → рассинхрон `INTERNAL_FUNCTION_SECRET`
  (см. [`gotchas.md`](../.claude/rules/gotchas.md#internal_function_secret--x-internal-secret)).
- Единичное застревание при доставленном в канал сообщении → баг класса msg_id/failures;
  кнопка «Повторить» в UI (это UPDATE `failed→pending`, повторно диспатчит).
- Массовое → проверь `net._http_response`, при 5xx от канала — проблема на стороне канала.

**Эскалация:** `supabase functions logs <имя> --project-ref zjatohckcpiqmxkmfxbs`.

---

## 2. Не приходят входящие (канал «онемел»)

**Диагностика:**
```bash
# Telegram: проверить, куда реально смотрит webhook каждого бота (источник правды!)
# (getWebhookInfo по токенам ботов — см. ledger F1). Быстрее — health:
node scripts/channel-health.mjs
```
```sql
-- Gmail watch протух? (почта в Gmail есть, в сервис не идёт)
SELECT email, watch_expires_at FROM email_accounts WHERE is_active AND watch_expires_at < now();
```
**Действие:**
- Gmail watch протух → крон `gmail-watch-refresh` мёртв. Проверь его
  ([`gotchas.md` → pg_cron](../.claude/rules/gotchas.md#pg_cron--service_role_key-ключ-зашит-в-команду-крона)),
  при смене service-ключа — обнови команду крона.
- Telegram webhook сбит → `telegram-register-webhook` перерегистрирует бота (v2).
- mtproto молчит → см. §6.

---

## 3. Откат (что-то сломалось после деплоя)

**Фронт** (Next-приложение):
```bash
git revert <sha>        # откатить коммит
git push origin main    # CI выкатит blue/green автоматически
```
**Edge-функция:** `git revert` + `scripts/deploy-edge.sh <имя>` (передеплоит предыдущую версию).
Либо в Supabase Dashboard → Functions → откатить версию.

**БД-функция:** восстановить прежнее тело миграцией. **Живое тело снимать с прода:**
`SELECT pg_get_functiondef('public.<fn>(<сигнатура>)'::regprocedure)` → в миграцию.
После `CREATE OR REPLACE`/`DROP` — восстановить GRANT'ы и снять `PUBLIC`/`anon`
у SECURITY DEFINER (иначе `check-db-invariants` заругается).

**mtproto:** откатить код (`git revert`) → rsync + rebuild (см. §6).

**VPS blue/green:** активный цвет виден в `/opt/relostart/nginx/conf.d/clientcase-upstream.conf`.
Деплой-скрипт переключает сам; вручную не править.

---

## 4. Как задеплоить (что чем катится)

| Что | Как | Авто? |
|-----|-----|-------|
| Фронт (Next) | `git push origin main` | ✅ CI (quality-гейт lint+test → blue/green) |
| Edge Functions | `scripts/deploy-edge.sh <имя> [<имя>…]` | ❌ вручную (+ смок карантина) |
| Миграции БД | `supabase db push` ИЛИ MCP `apply_migration` | ❌ вручную |
| mtproto | rsync + docker build на VPS (§6) | ❌ вручную |

После правки БД-функций: `node scripts/db-drift-check.mjs --update` + коммит манифеста.
Мессенджер/`*-send`/вебхуки — **только со смоком** (см. §7), это карантин.

---

## 5. Утечка внутреннего сообщения клиенту (visibility)

**Симптом:** сообщение «Только команде / Заметка / Только я» ушло клиенту в канал.
**Диагностика:**
```sql
SELECT id, visibility, telegram_message_id, has_attachments
FROM project_messages WHERE id = '<id>';
```
Ушедшее наружу → `telegram_message_id`/`wazzup_message_id` заполнены при `visibility<>'client'`.
**Действие:** гейты стоят в трёх местах — триггер `dispatch_message_to_channels` (текст),
фронт `messengerService.send`/`publishDraft` (вложения), черновики
`saveDraftMessage` (сохраняет visibility). Автотест `messengerDraftService.publish.test.ts`
ловит регрессию. Если утекло — проверь, что сообщение реально имело `visibility<>'client'`
на момент отправки (не проставилось из-за старого фронта → передеплой фронта).

---

## 6. mtproto-service (личный Telegram сотрудников)

**Диагностика:**
```bash
ssh vps 'docker ps --filter name=clientcase-mtproto --format "{{.Names}}: {{.Status}}"'
ssh vps 'docker logs --tail 30 clientcase-mtproto'
```
`Up (healthy)` + `/health` 200 = живой. Не поднялся → логи покажут (частые: gramjs
WebSocket требует Node 22; FLOOD_WAIT; невалидная сессия).
**Деплой/перезапуск:**
```bash
rsync -a --delete --exclude node_modules --exclude dist --exclude .env \
  ./mtproto-service/ vps:/opt/clientcase/mtproto-service/
ssh vps 'cd /opt/clientcase && docker compose build mtproto && docker compose up -d mtproto'
```
Простой ~5с, сессии переподнимаются из БД. `.env` на VPS не перезатирать.

---

## 7. Смок-тест каналов (после деплоя карантина — ОБЯЗАТЕЛЬНО)

```bash
# read-only (ничего не шлёт): застрявшие, failures, watch, mtproto
node scripts/channel-health.mjs

# реальная отправка в ТЕСТОВЫЕ треды (allowlist smoke_test_threads):
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/smoke-channels.mjs --confirm
# полная матрица (текст/файл/альбом/реакция/… по всем каналам):
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… SMOKE_BOT_PASSWORD=… \
  node scripts/smoke-matrix.mjs --confirm
```
Автоматически гоняется кроном (`smoke-channels.yml`, 06:00 UTC). Ручной прогон — после
любого деплоя edge/mtproto/БД, затрагивающего каналы.

---

## 8. Секрет утёк / ротация `INTERNAL_FUNCTION_SECRET`

Захардкожен в **3 БД-функциях** (`dispatch_send_http`, `notify_google_calendar_mirror`,
`convert_external_event_to_task`) + edge env + `mtproto-service/.env`. Полная процедура —
[`gotchas.md`](../.claude/rules/gotchas.md#internal_function_secret--x-internal-secret).
**🔴 НЕ коммитить тела функций** (`prod-functions.sql` и т.п.) — там секрет, GitGuardian-алерт.
Для сверки дрейфа коммитить только `schema-manifest.json` (хеши).

---

## Куда смотреть дальше

- **Почему сломалось / история** — [`messenger-ledger.md`](../.claude/rules/messenger-ledger.md) (журнал расследований), [`docs/bugs/`](bugs/).
- **Ловушки перед правкой** — [`gotchas.md`](../.claude/rules/gotchas.md).
- **Как устроены каналы** — [`channels.md`](../.claude/rules/channels.md).
- **Инфраструктура/деплой/VPS** — [`infrastructure.md`](../.claude/rules/infrastructure.md).
- **Онбординг с нуля** — [`docs/START-HERE.md`](START-HERE.md).
