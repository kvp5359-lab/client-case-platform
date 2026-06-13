# ClientCase — Мессенджер-каналы

> **⚠️ Карантинная зона.** При полном аудите/рефакторинге эти модули не трогаются. Трогать только по явной просьбе и со смок-тестом (см. [`refactoring.md`](./refactoring.md)).

Перед правкой канала — прочитать соответствующий раздел целиком, плюс [`gotchas.md`](./gotchas.md) (RLS short-circuit, multi-bot dedup, `--no-verify-jwt`, секреты).

## Матрица возможностей

| Возможность                       | TG group | TG Business | TG MTProto | Wazzup (WA) | Email |
|-----------------------------------|----------|-------------|------------|-------------|-------|
| Текст в обе стороны               | ✅       | ✅          | ✅         | ✅          | ✅    |
| Вложения (приём)                  | ✅       | ✅          | ✅         | ✅          | ✅    |
| Вложения (отправка)               | ✅       | частично    | частично   | ✅          | ✅    |
| Reply-цитирование (приём)         | ✅       | ✅          | ✅         | ✅          | n/a   |
| Reply-цитирование (отправка)      | ✅       | ✅          | ✅         | 🟡 fallback в текст | n/a   |
| Reactions (приём)                 | ✅       | 🟡 как сообщение | ✅      | 🟡 как сообщение | ❌ |
| Reactions (отправка)              | 🟡 если бот админ | 🟡 reply-эмодзи | ✅ native | 🟡 reply-эмодзи | ❌ |
| Edit/Delete своих исходящих       | ✅       | ✅          | ✅         | ❌          | ❌    |
| Read-receipts (от клиента)        | ❌       | ❌          | ✅ MTProto | ✅          | 🟡 пиксель |
| Mark-as-read (мы → внешний)       | ❌       | ❌          | ✅         | ✅          | n/a   |
| Голосовые с автотранскрипцией     | ✅       | ✅          | ✅         | ✅          | n/a   |

Легенда: ✅ — нативно, 🟡 — эмуляция/частично, ❌ — не поддерживается каналом.

## Общий слой Edge Functions

[`supabase/functions/_shared/edge.ts`](../../supabase/functions/_shared/edge.ts) — единые helpers: `corsHeadersFor(req)` (динамический CORS-whitelist), `corsHeaders` (статический wildcard, **@deprecated**), `preflight(req?)`, `jsonRes(payload, status, req?)`, `okText()`, `requireInternalSecret(req, allowBearer?)`, `getServiceClient()`, `getUserClient(req)`, `getUser(req)`. Всем новым функциям использовать с `req` — это даёт правильный Origin-whitelist из [`_shared/cors.ts`](../../supabase/functions/_shared/cors.ts) (clientcase.app + поддомены + env ALLOWED_ORIGINS).

### Авторизация Edge Functions — матрица

| Функция                    | verify_jwt | x-internal-secret | Bearer JWT | Кто вызывает |
|----------------------------|------------|-------------------|------------|--------------|
| `*-webhook` (TG, Wazzup)   | false      | —                 | —          | Сторонний сервис, защита через secret в URL/header |
| `*-send` (TG group, Business, Wazzup) | false | да | ⚠️ см. ниже | pg-триггер `notify_telegram_on_new_message` + фронт (attachments_only) |
| `wazzup-mark-read` / `wazzup-fetch-channels` / `wazzup-set-webhook` / `*-react` (Business/MTProto) | true | — | да | Только фронт (RLS внутри) |
| `wazzup-send-reaction`     | true       | —                 | да         | Фронт |

> ⚠️ **Bearer у `*-send` НЕ аутентифицирует.** При `verify_jwt=false` шлюз Bibika не проверяет JWT, а `requireInternalSecret(req, true)` смотрит только на **префикс** `Bearer ` (не валидирует токен). Реальная защита `*-send` держится на `x-internal-secret` + неугадываемом `message_id`. С 2026-06-12 функции с фронт-путём (`email-internal-send`, `fetch-telegram-avatar`) делают настоящий `getUser` + проверку членства, не полагаясь на Bearer-префикс.

## Унифицированный send_status

Единый источник правды по доставке исходящего — `project_messages.send_status` (enum `outgoing_send_status`: `pending`/`sent`/`failed`).

- **Жизненный цикл**: INSERT исходящего → `send_status='pending'` (триггер `set_initial_send_status`). Edge function канала после `fetch` → `markMessageSent` или `markMessageFailed` (см. [`_shared/messageSendStatus.ts`](../../supabase/functions/_shared/messageSendStatus.ts)). Все UPDATE'ы под `.throwOnError()`.
- **Кнопка «Повторить»** = UPDATE `send_status='failed' → 'pending'`. Триггер `notify_on_send_status_retry` ловит переход и снова дёргает `dispatch_message_to_channels`.
- **Авторетраев НЕТ** — это осознанное решение. Bot API не поддерживает idempotency keys, любой авто-повтор → риск дубля. Cron `retry-undelivered-telegram` удалён, колонка `telegram_retry_count` дропнута. Управление повтором — кнопка под красным баблом.
- **Watchdog `scan_dispatch_failures`** (cron 1/min): при не-2xx ответе edge function переводит `pending → failed`.
- **Client-side таймер 60 сек** в [`DeliveryIndicator.tsx`](../../src/components/messenger/DeliveryIndicator.tsx) — локально показывает `failed`.
- **Глобальный тост** [`SendFailureToasts`](../../src/components/messenger/SendFailureToasts.tsx) подписан на `message_send_failures`.

При добавлении нового канала: в edge function — `markMessageSent({ channelFields: { имя_канала_message_id, ... } })` на успехе и `markMessageFailed(reason, { failureSource })` на фейле. UI получает индикатор автоматически.

## Telegram (групповой секретарь + личные боты сотрудников)

С 2026-05-28 единый webhook [`telegram-webhook-v2`](../../supabase/functions/telegram-webhook-v2/index.ts) обслуживает оба типа интеграций — `telegram_workspace_bot` (секретарь, например `@rs2_support_bot`) и `telegram_employee_bot` (личный бот сотрудника). Различение через `IntegrationContext.mode` ([types.ts](../../supabase/functions/telegram-webhook-v2/types.ts) → `IntegrationContext`), прокидывается из entry-функции во все handler'ы.

| Функционал | `workspace` mode | `employee` mode |
|------------|-----------------|-----------------|
| Приём сообщений + dedup + edit + реакции | ✅ | ✅ |
| Retry на скачивание вложений (3 попытки exp backoff) | ✅ | ✅ |
| `migrate_to_chat_id` (group → supergroup) | ✅ | ✅ |
| `/start`, `/help`, `/link`, `/unlink` | ✅ | ✅ |
| `/menu`, `/knowledge`, `/upload`, `/status`, `/requirements` | ✅ | ❌ молчит |
| Inline-кнопки (`callback_query`) | ✅ | ❌ молчит |
| Многошаговые сессии (`telegram_bot_sessions`) | ✅ | ❌ |
| MENU-reply-кнопка «📋 Меню» | ✅ | ❌ |
| `asPersonalBot` в `syncTelegramIncomingMessage` | `null` (секретарь) | `{ integrationId, workspaceId, botId }` (для multi-bot dedup) |

**v1 webhook (`telegram-webhook`)** — после миграции F1 (2026-06-13) **не получает трафик**: все 5 ботов воркспейса переведены на v2 (`getWebhookInfo` подтвердил). До этого v1 держался на одном `rs_help103_bot` (employee, живой тред «Клиенты»). `telegram-register-webhook` теперь регистрирует новых ботов на **v2** (раньше v1 — источник дрейфа). **v1 пока НЕ удалён** — ждёт смок-подтверждения, что «Клиенты» исправно принимает после миграции; только после — `supabase functions delete telegram-webhook` + дроп `bot_version`. Zero-loss ключ: v1 биндит чат по `telegram_chat_id` без фильтра `bot_version`, v2 — с фильтром `bot_version='v2'` (`bindings.ts`), поэтому при миграции `bot_version` флипали ДО переноса webhook. Полностью — F1 в [`docs/audit/2026-06-13-quarantine-audit.md`](../../docs/audit/2026-06-13-quarantine-audit.md).

⚠️ `bot_version` **активно используется** в коде, вопреки прежней пометке «историческое поле»: фильтры `.eq("bot_version", BOT_VERSION)` в `bindings.ts`/`sync.ts`/`commands.ts`, резолв v1/v2 в `_shared/telegramBotToken.ts`, фильтр `bot_version !== 'v1'` в `IntegrationsTab.tsx`. Дроп колонки сломает маршрутизацию — не трогать.

**Регрессионная ловушка в `v2/sync.ts`** (исправлена 2026-05-28): `downloadAttachments` вызывать только при `sync.outcome === "inserted"`, не на любом непустом `rowId`. Иначе при multi-bot (workspace + employee в одной группе) второй бот через `enrich`-ветку даст rowId существующей строки → повторный upload в Storage с `upsert:false` → 23505 → `attachment_status='failed'` поверх успешной загрузки. См. [gotchas.md → раздел про downloadAttachments outcome](./gotchas.md#downloadattachments-только-при-outcomeinserted).

### Распил telegram-webhook-v2 (2026-05-11)

Раньше монолит 2227 строк, после распила:

| Модуль | ~Строк | Что |
|--------|--------|-----|
| `index.ts` | 96 | Entry: auth (читает токен из `workspace_integrations`) + маршрутизация update → handler |
| `shared.ts` | 31 | `service`, `getBotToken()/setBotToken()`, `SUPABASE_URL/KEY` |
| `types.ts` | 106 | Типы Telegram API + `TgChatBinding`, `TgFileDescriptor`, `BotSession` |
| `pure.ts` | 181 | Чистые helpers — форматирование, парсинг |
| `tg-api.ts` | 68 | `sendMessage`, `editMessage`, `answerCallback`, `tgCall` |
| `bindings.ts` | 20 | `findChatBinding(chat_id)` |
| `participants.ts` | 64 | `participantByTgId`, `findOrCreateParticipant` |
| `media.ts` | 81 | `fetchTelegramFile`, `downloadAttachments` |
| `session.ts` | 49 | `telegram_bot_sessions` CRUD |
| `knowledge.ts` | 279 | База знаний в TG: `showKbGroups`, `showArticle`, `resolvePrefixId` |
| `commands.ts` | 271 | `/start`, `/menu`, `/link`, `/unlink`, `showMainMenu` |
| `upload-slot.ts` | 875 | Загрузка документов |
| `callbacks.ts` | 111 | Маршрутизатор inline-кнопок |
| `sync.ts` | 159 | `handleMessage`, `syncGroupMessage`, `handlePrivateMessage` |
| `callback-data.ts` | 120 | Кодирование/декодирование `callback_data` (64-байтовый лимит) |
| `tiptap.ts` | 186 | Рендер `knowledge_articles` в Telegram-HTML с чанками 4096 |

При добавлении: команды → `commands.ts`, callback кнопок → `callbacks.ts`, экраны загрузок → `upload-slot.ts`. Cross-module helpers → `pure.ts` или тематический модуль.

## Telegram Business (личные диалоги сотрудников)

Реализовано 2026-05-03, перевод на модель «без проектов» — 2026-05-10. Архитектура «как у Planfix» — общий бот сервиса `@clientcase_bot` (id `8669511732`), которого сотрудники подключают как делегата своего личного TG через **Telegram → Settings → Business → Chatbots**. Требует Telegram Premium у сотрудника.

- **Бот**: `@clientcase_bot`, токен в Supabase secrets как `TELEGRAM_BUSINESS_BOT_TOKEN`. В BotFather включён **Business Mode**.
- **Webhook**: [`telegram-business-webhook`](../../supabase/functions/telegram-business-webhook/index.ts), деплой `--no-verify-jwt`. Защита — `X-Telegram-Bot-Api-Secret-Token` (значение в `TELEGRAM_BUSINESS_WEBHOOK_SECRET`).
- **Двухшаговое подключение**:
  1. UI → [`telegram-business-link-init`](../../supabase/functions/telegram-business-link-init/index.ts) → deep-link `t.me/clientcase_bot?start=biz_<uuid>`. TTL 30 мин.
  2. Сотрудник жмёт START → webhook пишет связку в `user_telegram_links`.
  3. В Telegram → Settings → Business → Chatbots добавляет бота с правом «Reply to messages» → `business_connection` → запись в `telegram_business_connections`.
- **Хранение**: тред с `project_id = NULL`, `owner_user_id = <employee>`, `business_connection_id`, `business_client_tg_user_id` (UNIQUE пара).
- **Отправка**: [`telegram-business-send`](../../supabase/functions/telegram-business-send/index.ts). Триггер `notify_telegram_on_new_message` маршрутизирует туда сообщения с заполненным `business_connection_id`. Поддерживается `reply_parameters`. После отправки стампится `telegram_chat_id` + `telegram_message_id`.
- **Реплаи**: общий хелпер `_shared/syncTelegramIncomingMessage.ts` ищет оригинал по `telegram_message_id` и проставляет `reply_to_message_id`.
- **Реакции — НЕ работают на уровне Bot API**:
  - `setMessageReaction` не имеет параметра `business_connection_id`.
  - Webhook `message_reaction` не приходит для 1-на-1 чатов (нужен бот-админ).
  - Реакции из сервиса остаются только в сервисе — фронт `messengerReactionService.ts` пропускает вызов для `source = 'telegram_business'`.

## Telegram MTProto (личный аккаунт сотрудника)

Параллельный канал через gramjs — даёт реакции в обе стороны, read-receipts, online presence, typing. **Только private chats**; групповые — на бот-секретаре.

- **Архитектура**: фронт → Edge Function `telegram-mtproto-*` (JWT + права) → `mtproto-service` (gramjs, Fastify) → Telegram → Supabase. `mtproto-service` никогда не доступен из браузера напрямую.
- **Сервис**: `mtproto-service/` — отдельный Node 20 контейнер. Подробнее в [`infrastructure.md`](./infrastructure.md#mtproto-service).
- **Edge Functions**: `telegram-mtproto-auth`, `telegram-mtproto-send`, `telegram-mtproto-react`, `telegram-mtproto-backfill`.
- **Тред**: `project_id = NULL`, `owner_user_id`, `mtproto_session_user_id`, `mtproto_client_tg_user_id`.
- **Backfill истории** (2026-05-12): кнопка «Загрузить ещё 50 из Telegram» в [`MessageList.tsx`](../../src/components/messenger/MessageList.tsx) когда сотрудник дошёл до самого старого сообщения в БД. Цепочка: фронт → `telegram-mtproto-backfill` → `mtproto-service POST /messages/backfill` → `Api.messages.GetHistory` с `offset_id = min(telegram_message_id треда)`, `limit=50`. Идемпотентно через UNIQUE (thread_id, telegram_message_id, source). Rate-limit: 2 сек между запросами per-session; FLOOD_WAIT → 429 с Retry-After.
- **Аватары**: эндпоинт `POST /users/fetch-avatar` в mtproto-service → `client.downloadProfilePhoto` → Storage → `participants.avatar_url`. Авто из `handleNewMessage` (fire-and-forget, идемпотентно).

## Wazzup (WhatsApp / Instagram)

Реализовано 2026-05-03. Платный шлюз https://wazzup24.com — обёртка над WhatsApp Web / IG / TG. Один API-ключ на воркспейс, каналы (= номера) привязываются к сотрудникам.

- **Webhook**: [`wazzup-webhook`](../../supabase/functions/wazzup-webhook/index.ts), `--no-verify-jwt`. Защита — секрет в query-string (`?key=<secret>`), потому что Wazzup **не поддерживает custom headers**.
- **Подписка webhook через API**: только через `PATCH /v3/webhooks` (UI кабинета этого не умеет). Делает [`wazzup-set-webhook`](../../supabase/functions/wazzup-set-webhook/index.ts) — кнопка «Подписать webhook» в UI.
- **Подписки**: `messagesAndStatuses` + `channelsUpdates`. Парсятся: `messages[]`, `statuses[]`, `channelsUpdates[]`, `{test:true}`.
- **Отправка**: [`wazzup-send`](../../supabase/functions/wazzup-send/index.ts). REST `POST /v3/message` с `Authorization: Bearer <api_key>`. Триггер БД маршрутизирует туда сообщения с заполненным `wazzup_channel_id` (пропускает с `has_attachments=true` — фронт сам инициирует через invoke).
- **Загрузка каналов**: [`wazzup-fetch-channels`](../../supabase/functions/wazzup-fetch-channels/index.ts) — `GET /v3/channels` → upsert в `wazzup_channels`.
- **Тред**: `project_id = NULL`, `owner_user_id`, `wazzup_channel_id`, `wazzup_chat_id` (телефон без `+` для WA, username для IG). UNIQUE на пару + `is_deleted=false`.
- **Сообщение**: `source = 'wazzup'`, `wazzup_message_id` (UNIQUE для дедупа), `wazzup_status` (sent/delivered/read/error). `isEcho=true` — отправлено сотрудником с телефона.
- **Вложения (приём)**: webhook v2 скачивает `contentUri`, кладёт в Storage `files/<workspace>/<project>/<message>/<file>`, создаёт `files` + `message_attachments`.
- **Вложения (отправка)**: signed URL (1 час) → `POST /v3/message` с `contentUri`. У первого файла — `text` как caption и `quotedMessageId` (если reply).
- **Голосовые транскрипция**: webhook fire-and-forget'ом дёргает `transcribe-audio` → `message_attachments.transcription`.
- **Reply при отправке**: `wazzup-send` ищет `wazzup_message_id` оригинала по `reply_to_message_id` и передаёт в `quotedMessageId`.
- **Mark as read**: [`wazzup-mark-read`](../../supabase/functions/wazzup-mark-read/index.ts) → `POST /v3/markread`. Хук [`useWazzupMarkRead`](../../src/hooks/messenger/useWazzupMarkRead.ts) дёргает при открытии Wazzup-треда.
- **Read-receipts от клиента**: webhook при `status='read'` обновляет `wazzup_status` + `recipient_read_at` → UI рисует синие галочки. Индикатор: [`WazzupDeliveryIndicator.tsx`](../../src/components/messenger/WazzupDeliveryIndicator.tsx) (`pending → sent → delivered → read → failed`).
- **Имена клиентов**: webhook берёт `contact.name → authorName → username → phone → chatId`.
- **Известные ограничения**: реакции и edit/delete сообщений не поддерживаются WhatsApp Business / Wazzup webhook схемой — пропускаем.

## Email (Gmail OAuth + Resend)

- Edge Functions: `gmail-auth`, `gmail-callback`, `gmail-disconnect`, `gmail-webhook`, `gmail-send`, `gmail-watch-refresh`, `email-internal-send`, `email-track`, `provision-email-domain`, `provision-domain`.
- **Gmail watch** живёт 7 дней. Продление: pg_cron `gmail-watch-refresh` (`0 3 * * *`). Симптом мёртвого крона — `email_accounts.watch_expires_at` в прошлом, входящие в Gmail видны, в сервис не приходят. Подробнее про секреты крона — [`infrastructure.md`](./infrastructure.md#pg_cron-и-service_role_key).
- **Resend webhook**: `/api/resend-webhook` (Next.js API route, не Edge Function) — приём событий доставки.
- Read-receipt: пиксель + `email-track`.

## Личные диалоги (Personal Dialogs)

Архитектурный сдвиг 2026-05-10: личные диалоги сотрудника (TG Business / Wazzup / личная почта) **больше не лежат в фейковом системном проекте** — это треды без `project_id` (`NULL`) с владельцем `project_threads.owner_user_id`.

- **Что НЕ делаем**: не создавать новые системные инбокс-проекты. Паттерн «создать проект под личные диалоги» устаревший, удалён миграцией `20260510_drop_system_inbox_projects.sql`.
- **Страница**: [`/workspaces/[id]/personal-dialogs`](../../src/app/(app)/workspaces/[workspaceId]/personal-dialogs/page.tsx) — **с 2026-06 это только redirect** на `/tasks?filter=no_project` (унифицированная страница «Без проекта», показывает И чаты, И задачи без `project_id`). Старый отдельный UI личных диалогов (`PersonalDialogsPage`, `usePersonalDialogs`, `useMoveThreadToProject`, `personalDialogsService`) удалён в аудит-чистке 2026-06-13.
- **Доступ**: тред видит только `owner_user_id` + менеджеры воркспейса с `manage_workspace_settings`.
- **RPC `move_thread_to_project(thread_id, project_id)`** — переносит тред между «личные» (`NULL`) и проектом. Меняет `project_id` у треда + всех сообщений. ⚠️ С фронта больше не вызывается (хук удалён), осталась в БД.
- **Скрытие из общих списков**: тред с `project_id=NULL` фильтруется из обычных списков на уровне RPC.

## Подсветка сообщений сотрудников в клиентских чатах

В клиентских тредах сообщения от сотрудников помечаются: кольцо вокруг аватара + левая полоса на бабле (`border-l-2`, в 2 раза тоньше красной полосы непрочитанного `border-l-4`). Цвет — динамический под акцент чата. Красная полоса непрочитанного перебивает.

- **«Сотрудник»**: автор с проектной ролью из `TEAM_ROLES = ['Администратор', 'Владелец', 'Сотрудник', 'Исполнитель']` ([`MessageBubble.tsx`](../../src/components/messenger/MessageBubble.tsx) — `isTeamSender(message.sender_role)`).
- **«Клиентский тред»** — хук [`useThreadHasClient`](../../src/hooks/messenger/useThreadHasClient.ts) + сигналы из `MessengerTabContent`. Тред клиентский если:
  1. Подключён к Telegram (`telegram_chat_link` на тред).
  2. Подключён к Email (`email_chat_link`).
  3. Среди `project_participants` есть «Клиент» с доступом к этому треду (через `access_type='all'/roles/custom`).
- **Что НЕ работает как сигнал**: `MessageChannel` ('client' | 'internal') — это легаси для project_messages, не для тредов. Task-треды по умолчанию `channel='client'`, но клиентскими не являются.

## Аватары собеседников во «Входящих»

Реализовано 2026-05-10. RPC [`get_inbox_threads_v2`](../../supabase/migrations/20260510_inbox_v2_counterpart_avatar.sql) возвращает `counterpart_name` + `counterpart_avatar_url`. Приоритет:
1. `participants.avatar_url`
2. `telegram_user_avatars.avatar_url` — для TG Business, MTProto, group
3. `project_threads.wazzup_contact_avatar_url`
4. NULL → инициал

- **Кэш TG**: `telegram_user_avatars (tg_user_id PK, avatar_url, is_missing, fetched_at)`. TTL: hit 30 дней, miss 7 дней.
- **Edge Function `fetch-telegram-avatar`** (`--no-verify-jwt`): Bot API `getUserProfilePhotos` + `getFile` → Storage `participant-avatars/tg/<tg_user_id>.jpg`. **Не работает для MTProto-юзеров** — Bot API возвращает «user not found».
- **MTProto аватары** — отдельный путь через mtproto-service (см. раздел выше).
- **Wazzup**: webhook сохраняет `msg.contact.avatarUri` в `project_threads.wazzup_contact_avatar_url`. URL публичный.
- **Email**: gravatar не используется (большинство адресов без gravatar). Остаётся инициал по `contact_email`.
- **Image hostnames** (`next.config.ts`): `*.wazzup24.com`, `pps.whatsapp.net`, `*.googleusercontent.com`, Supabase Storage.

## Чек-лист «Как добавить новый мессенджер»

1. **БД (миграция)**:
   - `<channel>_settings` (workspace_id, api_key, webhook_secret) + RLS только менеджерам
   - `<channel>_channels` (привязка к user_id) + RLS
   - Поля в `project_threads`: `<channel>_channel_id`, `<channel>_chat_id` + partial UNIQUE
   - Поля в `project_messages`: `<channel>_message_id` (UNIQUE) + `<channel>_status` если нужны статусы
   - `ALTER TYPE message_source ADD VALUE 'newchan'`
   - Ветка в триггер `notify_telegram_on_new_message` (skip 'newchan' source + маршрутизация)
2. **Edge Functions**:
   - `<channel>-webhook` — query-param/header secret
   - `<channel>-send` — REST канала; auth через x-internal-secret + Bearer
   - При необходимости: `<channel>-mark-read`, `<channel>-send-reaction`, `<channel>-fetch-channels`
   - Все на helpers из `_shared/edge.ts`
   - На отправке: `markMessageSent` / `markMessageFailed` из `_shared/messageSendStatus.ts`
3. **Фронт**:
   - Хук `use<Channel>Settings` / `use<Channel>Channels`
   - Секция в `IntegrationsTab` (3-шаговый онбординг по аналогии с WazzupSection)
   - Расширить `ProjectMessage.source` enum
   - Стратегия в `reactionStrategies.toggleReactionByChannel` (если есть реакции)
   - Хук `use<Channel>MarkRead` (если есть API) → подключить в `useMessengerState`
4. **Иконка**: `THREAD_ICONS` + дефолты при создании треда внутри webhook.
5. **Документация**: обновить матрицу в этом файле + добавить раздел канала.
