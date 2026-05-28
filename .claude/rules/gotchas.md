# ClientCase — Ловушки и known issues

Места, где интуиция обманывает. Перед изменением одного из этих узлов — прочитать соответствующий раздел.

## ✅ RLS на `project_threads` — закрыто 2026-05-24

**Фикс применён**: миграция `20260524_can_user_access_thread_row_overload.sql`. Добавлен overload `can_user_access_thread(t project_threads, p_user_id uuid)` — функция получает row через тип, не перечитывает таблицу. Полиция `project_threads_select` теперь одна строка:

```sql
CREATE POLICY project_threads_select ON public.project_threads
  FOR SELECT TO public
  USING (can_user_access_thread(project_threads, (SELECT auth.uid())));
```

Short-circuit `created_by = auth.uid()` больше **не нужен**. При следующем рефакторинге RLS его восстанавливать не надо — функция терпима к INSERT...RETURNING сама.

Старая сигнатура `(uuid, uuid)` оставлена — её используют 8 политик на смежных таблицах (message_*, project_messages, project_threads delete/update), где перечитывание не вызывает проблему.

### История (зачем держали костыль до 2026-05-24)

**Почему ломалось**: `can_user_access_thread(uuid, uuid)` — `SECURITY DEFINER STABLE`, перечитывал тред: `SELECT … FROM project_threads WHERE id = p_thread_id`. PostgREST шлёт `Prefer: return=representation` → `INSERT…RETURNING *`. К RETURNING-строке применяется SELECT-полиция. Внутри SECURITY DEFINER функции свежевставленная строка ещё не видна snapshot'у → `NOT FOUND` → `RETURN false` → RLS отбивал INSERT с 42501.

**Регрессии** (баг ловили 5 раз):
- `20260404191200_fix_thread_select_policy_inline.sql` — первый фикс.
- `20260426_thread_access_rls.sql` — переписала без short-circuit → сломалось.
- `20260427_fix_thread_select_returning.sql` — восстановила.
- `20260510_personal_dialogs_rls.sql` — снова переписала → сломалось.
- `20260513083503_fix_thread_select_returning_after_personal_dialogs.sql` — восстановила.
- `20260524_can_user_access_thread_row_overload.sql` — **постоянный фикс**, цикл закрыт.

Подробно: [docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md](../../docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md).

## ⚠️ Дедуп между несколькими ботами в одной Telegram-группе

Если в одной TG-группе сидят 2+ ботов воркспейса (`telegram_workspace_bot` + `telegram_employee_bot`'ы), при включённом privacy mode Telegram даёт **каждому боту свой message_id** для одного и того же сообщения клиента. То есть на одно реальное сообщение `/telegram-webhook` получает 2-3 разных update'а с разными `message.message_id`, но одинаковыми `chat.id`, `from.id`, `date`, `text`.

UNIQUE `uq_telegram_message_per_chat (telegram_chat_id, telegram_message_id, COALESCE(telegram_bot_integration_id::text, 'secretary'))` тут **не помогает дедупу incoming** — id у разных ботов разные, constraint их пропускает как разные записи. Дедуп incoming обеспечивает второй UNIQUE: `uq_project_messages_telegram_content_dedup (telegram_chat_id, telegram_sender_user_id, telegram_message_date, md5(content), COALESCE(telegram_file_unique_id, '')) WHERE source='telegram'`. Первый webhook записывает, второй/третий получают 23505 → `outcome='duplicate'` в `_shared/syncTelegramIncomingMessage.ts`.

**Edge case**: один клиент шлёт идентичный текст в одну секунду → второе дедуплено (потеря). На практике не встречается.

**При добавлении нового типа TG-интеграции** не предполагать, что `message_id` уникален — это верно только в пределах одного бота. Полагаться на content-based dedup.

Подробно: [docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md](../../docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md).

### ⚠️ uq_telegram_message_per_chat **обязательно** включает bot_integration_id

До миграции `20260528_fix_uq_telegram_message_per_chat_include_bot` индекс был по `(chat_id, msg_id)` без бота. Это ломало outgoing: разные боты в одной группе имеют **независимую нумерацию msg_id** (Telegram нумерует per-bot-view-of-chat), и legitimно могут получить одинаковый id для разных сообщений. Старый бот когда-то занял `(chat, 328)`, новый бот через 8 дней добирается до своего `msg_id=328` → 23505 на markMessageSent → сообщение зависает в pending/failed, хотя в TG доставлено.

Фикс — расширить partial UNIQUE на третью колонку `COALESCE(telegram_bot_integration_id::text, 'secretary')`. NULL bot (legacy secretary-bot без stamp'а) → 'secretary' placeholder.

**При любых будущих изменениях этого индекса** — оставлять `telegram_bot_integration_id` в ключе. Подробно: [docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md](../../docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md).

## Dev-сервер на Webpack, не Turbopack

В `package.json` у `dev` стоит `--webpack`. Turbopack (дефолтный в Next 16) на этом проекте раздувал кеш `.next/dev/cache/turbopack` до 2.5+ ГБ и зависал HMR (компиляция 900+ сек, CPU 1200%). Webpack: `Ready in 187ms`, кеш 250-400 МБ. **Не менять обратно.**

Если dev опять тормозит:
```bash
pkill -f "next dev"; rm -rf .next tsconfig.tsbuildinfo
```

## `--no-verify-jwt` для webhook и `*-send`

CLI по умолчанию `verify_jwt = true`. Webhook'и (Telegram, Wazzup) и `*-send` функции вызываются **без пользовательского JWT** (Telegram, постгрес-триггер через `net.http_post`). Шлюз Supabase отбивает на уровне инфраструктуры до нашего кода → `UNAUTHORIZED_NO_AUTH_HEADER` в `net._http_response.content`.

**Деплоить с `--no-verify-jwt`** все: `telegram-webhook*`, `telegram-business-webhook`, `telegram-send-message`, `telegram-business-send`, `wazzup-webhook`, `wazzup-send`, `gmail-webhook`, `email-internal-send`, `impersonate-start`, `fetch-telegram-avatar`.

Если задеплоил без флага — redeploy. Признак: 401 от шлюза (тело пустое или generic), не от нашего кода.

## `INTERNAL_FUNCTION_SECRET` / `x-internal-secret`

Триггер `notify_telegram_on_new_message` шлёт `x-internal-secret` header. Значение должно совпадать с env-переменной `INTERNAL_FUNCTION_SECRET` в Supabase secrets. Если разошлись — все исходящие из ЛК отбиваются с 401 от нашего кода.

**Диагностика**:
```sql
SELECT content, status_code FROM net._http_response ORDER BY created DESC LIMIT 10;
```

**Если `supabase secrets list` показывает значение, но функция не видит** — принудительно переустановить тем же `secrets set`. Это «оживит» в рантайме.

## `JWT_SIGNING_SECRET` (impersonation)

Edge Function `impersonate-start` требует env `JWT_SIGNING_SECRET` — HS256 секрет GoTrue (Project Settings → API → JWT Secret). Без него — 500.

```bash
supabase secrets set JWT_SIGNING_SECRET=<значение из Dashboard> --project-ref zjatohckcpiqmxkmfxbs
```

## pg_cron + service_role_key (ключ зашит в команду крона)

На Supabase Cloud `ALTER DATABASE postgres SET app.settings.service_role_key = '...'` запрещён по правам. Стандартный паттерн `current_setting('app.settings.service_role_key')` не работает — нужно **хардкодить ключ в команду крона**.

**Где взять ключ**: Supabase Dashboard → Project Settings → API → вкладка «Publishable and secret API keys» → раздел «Secret keys» (формат `sb_secret_...`). **Не легаси-JWT** — Edge Functions проверяют через `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`, в env инжектится новый формат. Признак неправильного — функция возвращает 401 от нашего кода.

**При ротации ключа** обязательно обновить команду крона:
```sql
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'gmail-watch-refresh'),
  command := $$
    SELECT net.http_post(
      url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/gmail-watch-refresh',
      headers := jsonb_build_object(
        'Authorization', 'Bearer sb_secret_НОВЫЙ_КЛЮЧ',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

**Диагностика крона**:
```sql
SELECT jrd.start_time, jrd.status, jrd.return_message
FROM cron.job_run_details jrd
JOIN cron.job j ON jrd.jobid = j.jobid
WHERE j.jobname = 'gmail-watch-refresh'
ORDER BY start_time DESC LIMIT 10;
```

## Nginx буферы при добавлении нового домена

В конфигах nginx для ClientCase на VPS обязательны жирные буферы:
```nginx
proxy_buffer_size      256k;
proxy_buffers        8 512k;
proxy_busy_buffers_size 512k;
```

Меньшие значения → 502 «upstream sent too big header» на залогиненных запросах. Next.js + Supabase шлёт жирные `Set-Cookie`/RSC headers.

**Два конфига на VPS** — `/opt/relostart/nginx/conf.d/app-relostart.conf` (для `app.relostart.com`) и `clientcase-kvp.conf` (для `clientcase.kvp-projects.com`). При добавлении нового домена скопировать буферы.

## `task_panel_tabs` upsert (partial unique)

Миграция `20260510_task_panel_tabs_contact_scope.sql` переделала UNIQUE constraints на **partial** (по scope project/contact). PostgREST `.upsert({ onConflict: 'user_id,project_id' })` с partial unique падает с `42P10` — «no unique or exclusion constraint matching». С 10 мая ни одна новая запись не писалась.

**Фикс** в [`useTaskPanelTabs.ts`](../../src/components/tasks/useTaskPanelTabs.ts) `upsertMutation`: ручной SELECT id → UPDATE по id или INSERT. **Костыль на месте.** При рефакторинге можно мигрировать на RPC `INSERT … ON CONFLICT (cols) WHERE …` или сменить тип constraint.

## `reorderWithinZones`

Функция **не сортирует** входной массив — нумерует `order` **по текущему порядку**. Если нужна сортировка из БД — сначала `arr.sort((a,b) => a.order - b.order)`, потом `reorderWithinZones`.

Это сделано чтобы `moveWithinZone` (swap двух соседей) не терялся внутри reorder — раньше функция сортировала по old order и перетирала swap (фикс 2026-05-13).

## Edge Function видит старое значение секрета после `secrets set`

Изредка после `supabase secrets set KEY=value` функция продолжает читать старое значение. Решение — переустановить ещё раз тем же значением, либо передеплоить функцию (`supabase functions deploy <name> ...`).

## Маршрутизация исходящих в триггере `notify_telegram_on_new_message`

Триггер — единая точка маршрутизации исходящих по каналам. Логика веток:
1. `mtproto_session_user_id IS NOT NULL` → `telegram-mtproto-send`
2. `business_connection_id IS NOT NULL` → `telegram-business-send`
3. `wazzup_channel_id IS NOT NULL` → `wazzup-send`
4. Иначе `telegram_chat_id IS NOT NULL` → `telegram-send-message`
5. Email — отдельным путём через `email-internal-send`.

**Skip-conditions**: `source IN ('telegram', 'telegram_business', 'wazzup', 'telegram_mtproto', 'email')` — чтобы входящие не запускали отправку.

**Skip для вложений Wazzup**: `has_attachments=true` — фронт сам инициирует через `supabase.functions.invoke('wazzup-send', { body: { message_id, attachments_only: true } })`. Триггер не отправит.

При добавлении нового канала отправки — обязательно добавить ветку и skip-условие в `source`.

## `downloadAttachments` только при `outcome='inserted'`

В [`telegram-webhook-v2/sync.ts`](../../supabase/functions/telegram-webhook-v2/sync.ts) `downloadAttachments` вызывать **строго** при `sync.outcome === "inserted" && sync.rowId`, не на любом непустом `rowId`.

**Почему.** В общем хелпере [`_shared/syncTelegramIncomingMessage.ts`](../../supabase/functions/_shared/syncTelegramIncomingMessage.ts) есть три исхода с непустым `rowId`:
- `inserted` — первый webhook, строка новая.
- `enriched` — вторая попытка от **личного бота** (когда секретарь уже вставил эту же строку). Возвращает rowId существующей строки + UPDATE'ит `telegram_bot_integration_id` на личного.

`enriched` означает что **первый webhook уже скачал/качает файл** в Storage. Повторный `downloadAttachments` от второго бота попытается залить в тот же путь `<ws>/<proj>/<msg_id>/<file>` с `upsert:false` → 23505 «resource already exists» → `media.ts` перепишет `attachment_status='failed'` поверх уже успешной загрузки. UI покажет ложную плашку «Файл из Telegram не загружен», хотя файл реально лежит и привязан в `message_attachments`.

Регрессия 2026-05-28: пришла вместе с фазой 1 унификации webhook'ов (employee-боты теперь шлют на v2 с непустым `asPersonalBot` → enrich-ветка активировалась). До этого не проявлялась, потому что v2 всегда был секретарём (`asPersonalBot=null`), и 23505 → `outcome='duplicate'` (`rowId=null`).

Защита присутствует в [v1/index.ts:398](../../supabase/functions/telegram-webhook/index.ts:398) — там `if (sync.outcome === "inserted" && sync.rowId)`. Воспроизводится только если в группе сидят оба бота (workspace + employee) и они обрабатывают одну media_group параллельно — большой файл с гонкой за Storage.

## MessageChannel enum — НЕ сигнал клиентского треда

`MessageChannel` ('client' | 'internal') в типах сервиса — легаси-разделение для `project_messages`, не для тредов. Task-треды по умолчанию `channel='client'`, но клиентскими **не являются**. Для определения «клиентский тред» — см. [`channels.md`](./channels.md#подсветка-сообщений-сотрудников-в-клиентских-чатах).

## `participants.module_access` НЕ синхронизируется с `enabled_modules`

Если модуль отключают в `project_templates.enabled_modules`, в `project_roles.module_access` он остаётся `true`. Это by design — чтобы не терять настройку при временном отключении. Модуль скрыт фильтром `enabled_modules`. См. [`data-model.md`](./data-model.md#права-доступа-к-модулям-проекта).

## Дефолтный промпт дневника проекта — в двух местах

`src/lib/digestDefaults.ts` (фронт) **и** константа `DEFAULT_SYSTEM_PROMPT` в `supabase/functions/generate-project-digest/index.ts` (бэкенд). **При изменении синхронизировать оба места.**

## `auth.admin.signOut(jwt)` не подходит для блокировки

Требует access-token самого юзера. Для блокировки используется RPC `revoke_all_user_sessions(uuid)` (DELETE из `auth.sessions/refresh_tokens`) — `SECURITY DEFINER`, GRANT только service_role. См. [`data-model.md`](./data-model.md#блокировка-участника-participantscan_login).

## `project_template_tasks` — дропнута

Таблица дропнута 2026-04-11 (`20260411_drop_project_template_tasks.sql`). Все задачи теперь в `thread_templates`. В коде могут оставаться комментарии с упоминанием — игнорировать.

## Формы — нативные `useState`, не `react-hook-form`/`zod`

`react-hook-form` и `zod` есть в зависимостях исторически (из shadcn-init), но в реальных формах не используются. Формы — на чистом контролируемом React. При написании новой формы не подтягивать эти библиотеки.

## Файл middleware — `src/proxy.ts`, не `middleware.ts`

В Next 16 стандартное имя — `proxy.ts`. Если ищешь middleware и не находишь — он в `src/proxy.ts`.
