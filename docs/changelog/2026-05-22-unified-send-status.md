# Унификация статуса доставки исходящих сообщений (send_status)

**Дата:** 2026-05-22
**Тип:** refactor + UX + bugfix
**Статус:** completed

---

## Контекст

22 мая утром словили инцидент: исходящее сообщение в Telegram-группу
ушло корректно (клиент его получил мгновенно), в UI висело «отправляется»,
через 2 минуты перешло в «не отправлено», через ещё минуту — стало
«отправлено», и одновременно в Telegram пришёл **дубль**.

Расследование: первая отправка действительно прошла, edge function
`telegram-send-message` вернула `{"ok":true}`, но `UPDATE
telegram_message_id` в БД молча провалился (supabase-js не бросает
исключения на ошибках UPDATE — кладёт в `{error}`, который наш код
не проверял). Через 2 минуты cron `retry-undelivered-telegram` увидел
`telegram_message_id IS NULL` и переотправил → дубль клиенту.

Это **повторяющийся класс багов** — за полгода ловили уже 3 раза, каждый
раз чинили локально. Решили перестроить отправку сразу по всем каналам
по индустриальному стандарту, а не лепить ещё один пластырь.

Из исследования лучших практик (Outbox pattern, grammY reliability,
issues `tdlib/telegram-bot-api#126` про idempotency keys, обсуждения
паттернов в Supabase PGMQ): **Bot API не поддерживает дедупликацию
сообщений на своей стороне, никогда не поддерживал и не планирует**.
Это ограничение платформы, не наша проблема. Единственный надёжный
путь — никаких автоматических повторов + явный статус доставки +
кнопка «Повторить» под рукой у юзера.

## Главное 1: единый `send_status` enum

Миграция [`20260522_unified_send_status.sql`](../../supabase/migrations/20260522_unified_send_status.sql):

- Enum `outgoing_send_status` (`pending` / `sent` / `failed`).
- Колонки `send_status`, `send_failed_reason`, `send_attempted_at`
  в `project_messages`. Частичный индекс по `failed` для глобальных
  тостов и realtime-подписок.
- Backfill: всё с подтверждённой доставкой (есть `telegram_message_id`,
  `wazzup_message_id`, `email_message_id`, либо source ≠ 'web') →
  `sent`. Свежие (<7 дней) без id → `failed` (чтобы юзер мог нажать
  «Повторить»). Старые без id → `sent` (исторические битые сообщения,
  не actionable, не стоит плодить красные баблы в истории).
- BEFORE-INSERT триггер `set_initial_send_status` ставит `pending`
  только для исходящих (`source='web'`, не draft, не scheduled).
  Всё остальное (входящие webhook'и, системные) сразу `sent`.
- Дроп cron `retry-undelivered-telegram` + функция
  `retry_undelivered_telegram_messages` — источник дублей. Колонка
  `telegram_retry_count` тоже удалена.

## Главное 2: helper для edge functions

Новый файл [`_shared/messageSendStatus.ts`](../../supabase/functions/_shared/messageSendStatus.ts)
с двумя функциями:

- `markMessageSent(service, messageId, { channelFields })` — выставляет
  `send_status='sent'` + поля канала (`telegram_message_id` /
  `wazzup_message_id` / `email_message_id` / …). Везде вызов
  `.throwOnError()` — UPDATE-ошибки больше не глотаются.
- `markMessageFailed(service, messageId, reason, opts)` — выставляет
  `send_status='failed'` + причина + дублирует в `message_send_failures`
  для глобального тоста.

Все 5 каналов отправки переведены на helper:

- [`telegram-send-message`](../../supabase/functions/telegram-send-message/index.ts) —
  убран идемпотентный guard (был под cron-retry, cron'а больше нет),
  все ветки fallback'ов (reply_dropped, employee bot → секретарь,
  split-text, attachments) проставляют либо `sent`, либо `failed`.
  Дополнительно: остальные UPDATE'ы (стампы `telegram_error_detail`,
  `telegram_bot_integration_id`) обёрнуты в `.throwOnError()` —
  фикс корня бага.
- [`wazzup-send`](../../supabase/functions/wazzup-send/index.ts) —
  short-circuit по `send_status='sent'`, единый стамп результата.
- [`telegram-business-send`](../../supabase/functions/telegram-business-send/index.ts) —
  то же.
- [`telegram-mtproto-send`](../../supabase/functions/telegram-mtproto-send/index.ts) —
  failed-ветки переключены; запись `sent` делает сам mtproto-service
  после фактической отправки в gramjs.
- [`email-internal-send`](../../supabase/functions/email-internal-send/index.ts) —
  обе ветки (Gmail OAuth и Resend) выставляют статус в success/error
  точках.

**mtproto-service** (Node на VPS, `/opt/clientcase/mtproto-service`)
тоже обновлён: `/messages/send` ставит `send_status='sent'` после
успешного gramjs-send, при exception → `failed`. UPDATE проверяет
`error` и бросает, если он есть.

## Главное 3: watchdog как страховка

Миграция [`20260522_scan_dispatch_failures_set_send_status.sql`](../../supabase/migrations/20260522_scan_dispatch_failures_set_send_status.sql):

Существующий cron `scan-dispatch-failures` (раз в минуту, читает
`net._http_response`) теперь дополнительно переводит сообщение
в `send_status='failed'`, если pg_net увидел не-2xx ответ от edge
function. Условие — только `pending → failed`, чтобы не перетереть
уже выставленный `sent` (на случай гонок).

Закрывает редкий, но возможный случай: edge function упала с throw
до того, как успела сама отметить статус (например, наш
`markMessageFailed` не дописал — UPDATE упал по дедлоку).

## Главное 4: фронт читает send_status напрямую

[`DeliveryIndicator.tsx`](../../src/components/messenger/DeliveryIndicator.tsx)
полностью переписан. Раньше — три разных хука
(useTelegramDeliveryStatus, useWazzupDeliveryStatus + кусок email-логики),
каждый собирал статус косвенно (наличие `telegram_message_id`,
комбинация `telegram_attachments_delivered`, локальный 90-сек таймер).

Сейчас — один хук `useDeliveryStatus(message, isOwn)`:

1. Optimistic ID → `pending`.
2. `send_status` напрямую (`failed`/`pending`/`sent`).
3. Поверх — тонкий слой read-семантики (доступен не во всех каналах):
   - Telegram MTProto: `recipient_read_at` → `read`.
   - Wazzup: `wazzup_status='read'` → `read`.
   - Email (Resend): `email_delivery_status ∈ {opened, clicked}` или
     `email_metadata.read_at` → `read`.
4. Client-side таймер на зависший `pending` (60 сек) — страховка
   на случай, когда pg_net тихо не дёрнул edge function, а
   `scan_dispatch_failures` ещё не догнал.

Удалены файлы `TelegramDeliveryIndicator.tsx` и
`WazzupDeliveryIndicator.tsx`. `isSoftTelegramError` (для семантики
«reply_dropped: цитата потерялась, но сообщение доехало») перенесён
в `DeliveryIndicator.tsx`.

## Главное 5: универсальная кнопка «Повторить»

Миграция [`20260522_retry_via_send_status.sql`](../../supabase/migrations/20260522_retry_via_send_status.sql):

AFTER-UPDATE триггер `notify_on_send_status_retry` на
`project_messages.send_status`. Срабатывает только на переход
`failed → pending` и вызывает `dispatch_message_to_channels(NEW.id)` —
тот же путь, что при INSERT. Это делает retry универсальным для всех
каналов на стороне БД.

На фронте:

- [`useRetryTelegramSend`](../../src/hooks/messenger/useRetryTelegramSend.ts)
  переписан — теперь это просто UPDATE `send_status='pending'`.
  Никаких прямых `supabase.functions.invoke('telegram-send-message')`.
  Имя сохранено для совместимости с местами вызова (по факту
  универсально для всех каналов).
- [`SendFailureToasts`](../../src/components/messenger/SendFailureToasts.tsx)
  — добавлена кнопка «Повторить» прямо в тосте о фейле. «Открыть чат»
  оставлено как вторичная кнопка. Если `metadata.project_message_id`
  отсутствует (старые failure-записи) — fallback на «Открыть чат».
- Удалена `retryTelegramSend` из
  `messengerService.edit.ts` — больше не нужна.

## Главное 6: дедуп оптимистических баббл

В split-режиме (текст + файлы → 2 INSERT'а в БД) фронт делает 2
оптимистических вставки. Между `onMutate` и `onSuccess` realtime
может успеть подтянуть реальные строки в кэш → визуально 4 баббла
вместо 2 на 0.5-2 секунды. До этого рефакторинга было незаметно —
индикатор pending рисовался тонко. После — pending-плашка стала
яркой, дубль бросался в глаза.

[`MessageList.tsx`](../../src/components/messenger/MessageList.tsx) —
добавлен фильтр: если в кэше есть «реальный близнец» оптимистика
(тот же автор + контент + наличие вложений в окне ±60 сек),
оптимистик не рендерится. Логика не пострадала — это чистый
визуальный фильтр.

## Регенерация типов

[`src/types/database.ts`](../../src/types/database.ts) перегенерирован
из живой схемы (через `supabase generate types`). Удалена
`telegram_retry_count`. Добавлены `send_status`, `send_failed_reason`,
`send_attempted_at`, enum `outgoing_send_status`.

## Чего НЕ делаем (осознанные решения)

1. **Idempotency-сверка через MTProto.** Рассматривали: при таймауте
   fetch к Bot API сверять историю чата через mtproto-service (поскольку
   у нас уже есть эта инфраструктура). Решили не делать — MTProto
   не у всех организаций; в платформе не должно быть базовых возможностей,
   зависящих от опционального компонента.
2. **Полный outbox-pattern с lease через `SELECT FOR UPDATE SKIP LOCKED`.**
   Не нужен, если нет автоматических повторов — некому конкурировать
   за «арендой» строки. Упрощённая модель `pending → sent / failed`
   достаточна.
3. **Переезд на pgmq (Supabase Queues).** Overkill сейчас. Текущая
   инфраструктура (`message_send_dispatch` + watchdog) уже даёт нужное.
   Если в будущем понадобится ещё несколько подобных пайплайнов —
   рассмотрим.

## Известные ограничения

- При нажатии «Повторить» возможен **редкий дубль**, если оригинал
  всё-таки дошёл до клиента (а таймаут был ложным). Это осознанный
  риск, без него Bot API в принципе невозможно использовать. Решение
  юзера, не системы.
- Watchdog `scan_dispatch_failures` срабатывает с задержкой до минуты
  (cron-интервал). До этого момента покрывает только client-side
  таймер 60 сек.

## Документация

В [`.claude/rules/infrastructure.md`](../../.claude/rules/infrastructure.md)
добавлен раздел «Унифицированный send_status (2026-05-22)» —
жизненный цикл, retry-механика, watchdog, чек-лист для нового
канала отправки.

## Файлы

- Миграции:
  [`20260522_unified_send_status.sql`](../../supabase/migrations/20260522_unified_send_status.sql),
  [`20260522_scan_dispatch_failures_set_send_status.sql`](../../supabase/migrations/20260522_scan_dispatch_failures_set_send_status.sql),
  [`20260522_retry_via_send_status.sql`](../../supabase/migrations/20260522_retry_via_send_status.sql).
- Helper: [`supabase/functions/_shared/messageSendStatus.ts`](../../supabase/functions/_shared/messageSendStatus.ts).
- Edge functions: `telegram-send-message`, `wazzup-send`,
  `telegram-business-send`, `telegram-mtproto-send`,
  `email-internal-send`.
- mtproto-service: `src/routes/commands.ts`.
- Фронт: `DeliveryIndicator.tsx` (новый), `MessageBubble.tsx`,
  `MessageList.tsx`, `SendFailureToasts.tsx`, `useRetryTelegramSend.ts`,
  `useSendMessage.ts`, `useOptimisticEmail.ts`,
  `messengerService.types.ts`, `messengerService.edit.ts`,
  `messengerService.ts`, `database.ts`.
- Удалены: `TelegramDeliveryIndicator.tsx`, `WazzupDeliveryIndicator.tsx`,
  функция `retryTelegramSend`.
