# Wazzup-интеграция (WhatsApp) + рефакторинг мессенджер-каналов

**Дата:** 2026-05-04
**Тип:** feat + refactor + fix
**Статус:** completed

---

## Контекст

После end-to-end по MTProto (changelog от 2026-05-03) у пользователей
осталась одна большая дырка в коммуникациях — **WhatsApp**. У большинства
команд, особенно в B2C-сегментах, основной канал общения с клиентами —
именно WhatsApp, и до сегодня сервис в нём не присутствовал.

Параллельно после интеграции четвёртого канала (Wazzup) накопился долг
по архитектуре: каждый канал жил со своим набором edge-функций,
полей в `project_threads`, копи-пейста в webhook'ах и фронт-хуках.
Уже на пятом канале это начало мешать — пришлось расчистить общие
точки.

И в конце сессии всплыли два давних кейса в существующих каналах
(Gmail multi-user + Telegram-файлы без employee bot в группе),
которые не были связаны с рефакторингом, но мешали работе сейчас.

## Решение

### 1. Wazzup-интеграция с нуля

Архитектура «как у Telegram Business»: один общий API-ключ Wazzup
на воркспейс, каналы (= номера WhatsApp / IG-аккаунты) привязываются
к сотрудникам, личные диалоги клиента кладутся в системный
проект-инбокс этого сотрудника.

**БД-сторона:**

- `wazzup_settings` — API-ключ + webhook_secret на воркспейс. RLS:
  читать и писать может только менеджер с `manage_workspace_settings`.
- `wazzup_channels` — каналы (номера/инстаграмы), привязка к user_id.
- Поля в `project_threads`: `wazzup_channel_id`, `wazzup_chat_id`,
  `wazzup_chat_type` + partial UNIQUE на пару channel+chat.
- Поля в `project_messages`: `wazzup_message_id` (UNIQUE) +
  `wazzup_status` (sent/delivered/read/error).
- `system_inbox_kind` (вместо двух отдельных булевых
  `is_system_business_inbox` + `is_system_wazzup_inbox`) —
  единое строковое поле с CHECK-constraint, сразу учитывает рост
  числа каналов. Backfill из старых булевых, оба индекса заменены
  одним partial UNIQUE.
- `external_outgoing_dedup(channel, message_id)` — общая таблица
  для дедупа echo-сообщений, заменяет канал-специфичную
  `wazzup_outgoing_dedup`. Используется только для случаев, когда
  отправляемое сообщение НЕ имеет своей строки в `project_messages`
  с `<channel>_message_id` (например, эмодзи-реплай как часть
  реакции — реакция живёт в `message_reactions`, а сообщение
  во внешнем канале есть).

**Edge Functions:**

- `wazzup-webhook` (no-jwt, защищён secret в query-string —
  Wazzup не поддерживает custom headers): входящие сообщения,
  статусы доставки, обновления каналов. Поддержка медиа (image /
  video / audio / voice / document / sticker), reply-lookup по
  `quotedMessage.messageId`, авто-транскрипция voice/audio через
  существующий `transcribe-audio`, обработка `status='read'` →
  `recipient_read_at` для UI-галочек, dedup исходящих echo через
  `isOutgoingEcho` helper.
- `wazzup-send` (no-jwt, x-internal-secret OR Bearer JWT): отправка
  текста и файлов. Wazzup НЕ позволяет `text + contentUri` в одном
  запросе (`INVALID_MESSAGE_DATA`), поэтому при наличии текста и
  файлов сначала отправляется текст отдельным запросом, потом
  серия запросов на каждый файл. Caption-плейсхолдер «📎»
  фильтруется. Для всех ответов `markOutgoingExternal` → dedup-table.
- `wazzup-fetch-channels` (verify_jwt): синхронизация каналов
  Wazzup → наш `wazzup_channels` upsert.
- `wazzup-set-webhook` (verify_jwt): Wazzup не позволяет настроить
  webhook через UI кабинета, только через `PATCH /v3/webhooks` —
  делаем это автоматически из нашего UI одной кнопкой.
- `wazzup-mark-read` (verify_jwt): когда сотрудник открывает
  Wazzup-тред в нашем сервисе, `POST /v3/markread` → клиент
  в WhatsApp видит синие галочки.
- `wazzup-send-reaction` (verify_jwt): эмуляция реакций через
  quote-reply с эмодзи + текст-цитата оригинала (Wazzup quote
  в API не работает для исходящих → приходится клеить «> текст»
  в начало). Сохраняет messageId в dedup-таблицу — webhook
  не создаст дубль, когда Wazzup пришлёт echo.

**Фронт:**

- Секция «WhatsApp (Wazzup)» в `IntegrationsTab` — три-шаговый
  онбординг: ввести ключ → подписать webhook → загрузить каналы.
- Хуки `useWazzup*` (settings / channels / fetch / set-webhook /
  assign-user / mark-read).
- `useDeliveryStatus` поддерживает Wazzup (sent/delivered/read).
- `messengerService.toggleReaction` через `reactionStrategies` —
  ветка для source='wazzup'.
- Фильтр sidebar учитывает `system_inbox_kind` — чужой инбокс
  скрыт даже от пользователя с `view_all_projects`.
- В THREAD_ICONS добавлены brand-иконки: WhatsApp (filled) и
  Telegram (outline send-самолётик из lucide). При создании
  Wazzup-треда дефолт `whatsapp + emerald`, при создании
  Telegram-инбоксов (Business / MTProto) — `telegram + blue`.

**Известные ограничения каналов** (не наш баг, ограничения Wazzup +
WhatsApp Bot API):

- Native-реакции в WhatsApp Bot API нет. Эмулируем через
  quote-reply с эмодзи (как сам Wazzup делает в обратную сторону).
- `quotedMessageId` принимается API, но не отображается в WhatsApp
  у клиента → fallback на текст-цитату «> Имя\nТекст».
- Edit/Delete своих исходящих — WhatsApp Bot API не поддерживает.
- Read-receipts от клиента приходят (`status='read'` в webhook).
- Multi-file одного сообщения шлётся серией POST'ов; все messageId
  пишутся в dedup, чтобы echo не создал дубли в треде.

### 2. Рефакторинг по 9 зонам

После того как Wazzup стал пятым каналом, накопленный долг начал
мешать. Прошёлся по 12 зонам, реально сделал 9 (3 решил не делать —
over-engineering при текущем масштабе).

**Зона 2 — общие edge-helpers** (`_shared/edge.ts`): `corsHeaders`,
`preflight()`, `jsonRes()`, `okText()`, `requireInternalSecret()`,
`getServiceClient()` / `getUserClient()` / `getUser()`,
`markOutgoingExternal()` / `isOutgoingEcho()`. Все 6 wazzup-*
функций переведены — от ~30 строк бойлерплейта к 5-10 на функцию.
Telegram-функции пока не трогали — рабочий продакшн, отложили.

**Зона 4 — `system_inbox_kind`**: единое строковое поле вместо
двух булевых флагов. Расширяемо: добавление email-инбокса в
будущем не потребует ещё одного boolean'а.

**Зона 5 — общий dedup**: `external_outgoing_dedup(channel, message_id)`
вместо `wazzup_outgoing_dedup`. Helpers в `_shared/edge.ts`. При
добавлении канала dedup-таблица уже общая.

**Зона 6 — унификация UI** (`DeliveryIndicator.tsx`): единый
`useDeliveryStatus` + `DeliveryFailedBadge` заменяют
`TelegramDeliveryIndicator` + `WazzupDeliveryIndicator` +
`TelegramFailedBadge` + `WazzupFailedBadge`. `messengerReactionService`
стал тонкой обёрткой ~25 строк (было ~100), реальная логика —
в `reactionStrategies.toggleReactionByChannel`.

**Зона 7 — общий attachment-helper** (`_shared/storeAttachment.ts`):
upload в Storage + INSERT в `files` + INSERT в `message_attachments`
одним вызовом. Wazzup-webhook переведён (~40 строк boilerplate → 5).
Telegram-webhook-v2 пока оставлен — там специфика (getFile, 20МБ-warning).

**Зона 8 — perf-фикс `useWazzupMarkRead`**: до рефакторинга хук
стрелял Edge Function на КАЖДОЕ открытие любого треда (TG, email,
веб, чат внутри проекта), edge function проверяла тип и возвращала
`{skip}`, но это был полный roundtrip ~200-500ms. Теперь хук читает
`wazzup_channel_id` из уже кешированного `useProjectThreads` и не
идёт во внешний invoke для не-Wazzup тредов. ≈95% сохранённых
вызовов в типичном UX.

**Зоны 10+11 — документация** (`infrastructure.md`): добавлен раздел
«Мессенджер-каналы — единая справка»:

- Матрица возможностей × каналов по 11 фичам (текст, вложения,
  reply, реакции, edit/delete, read-receipts, mark-as-read, голосовые)
- Матрица авторизации Edge Functions: verify_jwt × x-internal-secret
  × Bearer JWT × кто вызывает
- Чек-лист «Как добавить новый мессенджер» (5 шагов: БД, Edge,
  фронт, иконка, доки) — следующая интеграция просто пройти по
  списку без копирования трёх соседних webhook'ов.

**Зона 12 — unit-тесты**: 7 тестов на `toggleReactionByChannel`
фиксируют контракт стратегий по всем каналам (telegram_business →
telegram-business-react; telegram_mtproto → telegram-mtproto-react;
wazzup → RPC + (если added=true) wazzup-send-reaction; default →
RPC + telegram-set-reaction). Все 620 тестов проекта зелёные.

**Зоны, которые отказались делать:**

- 1 (общий ChannelAdapter) — over-engineering при 5 каналах;
  общий слой `_shared/edge.ts` + dedup уже даёт практическую
  пользу, а класс-обёртка добавит синтетическую абстракцию.
- 3 (jsonb для thread channel-data) — wide-table из 9 колонок
  работает, миграция дорогая, выигрыш гипотетический. Пересмотрим
  при 15+ каналах.
- 9 (TS дискриминированный union по `source`) — преждевременно;
  плоская модель ОК для текущего объёма.

### 3. Точечные фиксы давних багов

- **`gmail-send`**: при ответе на ветку, начатую другим пользователем
  воркспейса, Gmail отбивал запрос (чужой `gmail_thread_id` не виден
  у текущего accessToken). Старый код возвращал безликий 500.
  Сделал авто-retry без `threadId` (письмо уйдёт новой веткой —
  приемлемо) + подробный error-payload (`gmail_status`, `gmail_error`,
  `first_attempt_error`) в response, чтобы фронт мог показать
  причину без лазанья в edge-логи.
- **`telegram-send-message` / файлы**: текст имел fallback на
  бот-секретаря если личный бот сотрудника не в группе, файлы —
  нет. `sendAttachments` просто логировал ошибку и возвращал false.
  Добавил `sendAttachmentsWithFallback` — обёртка с retry через
  `resolveBotToken(chat_id)` + префикс «<b>Имя:</b>\n» в caption.
  Работает с любым числом ботов-секретарей у воркспейса —
  `resolveBotToken` находит интеграцию через
  `project_telegram_chats.integration_id` именно для этой группы.

## Файлы

**Новые:**

- `supabase/functions/_shared/edge.ts` — общие Edge-helpers
- `supabase/functions/_shared/storeAttachment.ts` — единый upload+insert
- `supabase/functions/wazzup-webhook/index.ts`
- `supabase/functions/wazzup-send/index.ts`
- `supabase/functions/wazzup-fetch-channels/index.ts`
- `supabase/functions/wazzup-set-webhook/index.ts`
- `supabase/functions/wazzup-mark-read/index.ts`
- `supabase/functions/wazzup-send-reaction/index.ts`
- `supabase/migrations/20260503_wazzup_integration.sql`
- `supabase/migrations/20260503_notify_wazzup_branch.sql`
- `supabase/migrations/20260503_wazzup_enum_value.sql`
- `supabase/migrations/20260503_wazzup_rls_write_policies.sql`
- `supabase/migrations/20260503_move_thread_to_project_rpc.sql`
- `supabase/migrations/20260504_system_inbox_kind.sql`
- `supabase/migrations/20260504_wazzup_outgoing_dedup.sql`
- `supabase/migrations/20260504_external_outgoing_dedup.sql`
- `src/page-components/workspace-settings/WazzupSection.tsx`
- `src/hooks/useWazzup.ts`
- `src/hooks/messenger/useWazzupMarkRead.ts`
- `src/hooks/messenger/useMoveThreadToProject.ts`
- `src/components/messenger/DeliveryIndicator.tsx`
- `src/components/messenger/WazzupDeliveryIndicator.tsx`
- `src/components/messenger/brandIcons.tsx`
- `src/services/api/messenger/reactionStrategies.ts`
- `src/services/api/messenger/reactionStrategies.test.ts`

**Изменённые (ключевые):**

- `supabase/functions/telegram-business-webhook/index.ts` — иконка/цвет defaults, `system_inbox_kind`
- `supabase/functions/gmail-send/index.ts` — multi-user fallback
- `supabase/functions/telegram-send-message/index.ts` — sendAttachmentsWithFallback
- `mtproto-service/src/handlers/inbox.ts` — иконка/цвет defaults
- `src/components/messenger/MessageBubble.tsx` — единый deliveryFailed/deliveryStatus
- `src/components/messenger/threadConstants.ts` — brand-иконки
- `src/components/WorkspaceSidebar/useSidebarData.ts` — `system_inbox_kind`-фильтр
- `src/page-components/ProjectPage/hooks/useProjectData.ts` — Wazzup-инбокс template
- `src/components/messenger/hooks/useMessengerState.ts` — useWazzupMarkRead подключение
- `src/services/api/messenger/messengerService.ts` — Wazzup attachments invoke
- `src/services/api/messenger/messengerReactionService.ts` — обёртка
- `src/services/api/messenger/messengerService.types.ts` — `wazzup_message_id`/`wazzup_status`
- `src/components/messenger/bubbleUtils.ts` — упрощён
- `.claude/rules/infrastructure.md` — Wazzup-раздел + единая справка по каналам

## Тестирование

- TS-сборка чистая (`npx tsc --noEmit`)
- Все 620 unit-тестов зелёные (44 файла), включая 7 новых на
  `reactionStrategies`
- Smoke-test всех wazzup-функций после деплоя (POST `{test:true}`
  на webhook → `{ok:true}`)
- End-to-end в браузере: текст / файлы / реакции / reply-цитаты
  работают в обе стороны, дубль-баблы echo больше не появляются
- Sidebar и треды отображаются корректно после миграции
  `system_inbox_kind` (1 wazzup + 1 business + 2 mtproto тредов
  переведены через бэкфилл)
- Telegram-fix проверен пользователем — отправка файлов в группу
  без личного бота теперь идёт через секретаря с префиксом «Имя:»

## Деплой

Миграции и Edge Functions — задеплоены через MCP Supabase + CLI
по ходу сессии. Фронт уйдёт стандартным blue/green pipeline'ом из
`.github/workflows/deploy.yml` после push в main.

## Что осталось на потом

- Старые булевые `is_system_business_inbox` / `is_system_wazzup_inbox`
  оставлены для обратной совместимости. Дроп — отдельной миграцией
  через 1-2 недели наблюдения.
- `telegram-webhook-v2` не переведён на `_shared/storeAttachment`
  и `_shared/edge.ts` — там много канал-специфики (getFile,
  20МБ-warning), осторожный перевод оставлен на отдельный круг.
- При желании сохранять Gmail-thread между пользователями
  воркспейса — отдельная фича `(email_link_id, user_id) →
  gmail_thread_id`. Сейчас для multi-user сценария при ошибке
  отправляется новой веткой.

## Решения и компромиссы

**Wazzup vs Cloud API от Meta.** Выбрали Wazzup как путь
наименьшего сопротивления для personal-номеров сотрудников.
Cloud API даёт более чистый API (native-реакции, native-quote),
но требует отдельного бизнес-номера, верификации в Meta Business
Manager и платы Meta за разговоры. Для текущего сценария
«сотрудник пишет с личного номера» Wazzup — единственный путь.
Архитектурно подготовили слой так, что добавить Cloud API
параллельно (как ещё один канал) можно по чек-листу из
infrastructure.md за 1-2 дня.

**Quote через текст вместо `quotedMessageId`.** Wazzup API
принимает `quotedMessageId` без ошибки, но фактически не
отображает quote-bubble у клиента в WhatsApp (для исходящих
от нас). Tested through curl — это не наш баг, ограничение
их интеграции. Делаем fallback `> текст оригинала\n текст ответа`
в caption — некрасиво, но клиенту понятно к чему относится.
`quotedMessageId` продолжаем передавать на случай если
починят.

**Реакции через эмодзи-реплай.** Native-реакции в WhatsApp Bot
API нет в принципе. Wazzup в обратную сторону уже эмулирует это
сообщением с эмодзи. Делаем то же самое от нас — реакция в нашем
UI остаётся обычной (под бабблом), у клиента в WhatsApp приходит
отдельное сообщение-цитата с эмодзи. Снятие реакции у клиента
не отзовётся (нельзя удалять чужие сообщения через API) — это
ожидаемо.

**Dedup отдельной таблицей вместо UNIQUE на `project_messages`.**
В первой версии плана хотел перевести Wazzup на чистый UNIQUE по
`wazzup_message_id`, но при тщательном рассмотрении выяснилось,
что эмодзи-реплаи реакций не имеют своей записи в `project_messages`
(реакция живёт в `message_reactions`). Поэтому отдельная таблица
`external_outgoing_dedup` нужна и остаётся — но переименована в
канал-агностичный вид.

**System inbox kind вместо булевых флагов.** При добавлении email-
инбокса (если когда-нибудь будем) не нужно будет третий boolean.
Backward-compat: старые булевы оставлены, фронт и webhooks читают
`system_inbox_kind`, дроп будет через 1-2 недели.
