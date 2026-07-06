# Per-bot telegram_message_id: правильные реакции и reply в multi-bot группах

**Дата:** 2026-07-06
**Тип:** feat / fix (карантин, Telegram)
**Статус:** edge + миграция — в проде; ждёт смока

---

## Проблема (общий корень реакций и reply)

В TG-группе с несколькими ботами воркспейса Telegram даёт **каждому боту свой
message_id** для одного сообщения. И реакция, и нативный reply «именные» —
привязаны к конкретному боту и требуют message_id цели **для этого бота**. Мы же
хранили только ОДИН message_id (бота-«победителя» дедупа). Следствие:
- **Реакция** ставилась не тем ботом (ложная подпись «от коллеги») либо не
  ставилась вовсе.
- **Reply** отображался как цитата-блокквот с именем автора вместо нативного
  reply — потому что сохранённый id принадлежал чужому боту.

## Решение — одна карта на всё

Колонка `project_messages.telegram_bot_msg_ids jsonb` = `{ "secretary": 328,
"<integration_id>": 5171, ... }` — message_id по каждому боту, который видел
сообщение. Ключ = integration_id employee-бота или литерал `'secretary'`.

- **БД** (`20260706160000_telegram_per_bot_message_ids.sql`): колонка + атомарный
  RPC `record_telegram_bot_msg_id` (`jsonb_set` под row-lock, не перезаписывает
  существующий ключ; service_role).
- **Захват** (`_shared/syncTelegramIncomingMessage.ts`): `recordBotMsgId` на всех
  исходах дедупа (`inserted`/`enriched`/`duplicate` — ключевое: в `duplicate`
  раньше id терялся).
- **Реакция** (`telegram-set-reaction`): убрана цепочка кандидатов. Бот
  реагирующего (личный employee по `owner_user_id`, иначе секретарь) → его id из
  карты → `setMessageReaction` им. Нет своего id → в TG не ставим (в сервисе
  остаётся), не чужим ботом.
- **Reply** (`telegram-send-message`): общий хелпер `resolveReplyIdForSendingBot`
  берёт id цели для отправляющего бота из карты → нативный `reply_to`. Нет своего
  id → сохранённый (fallback «висячего» reply = blockquote, как раньше).
  Подключены и текст, и **reply с файлом** (`attachmentReplyTo`).

## Границы

- Работает для **новых** сообщений — карта копится с деплоя. На старых (до
  сегодня) карта пуста → реакции в TG нет, reply остаётся цитатой. Backfill не
  делаем.
- Приём входящих reply/реакций клиента — отдельный механизм (по контенту/владельцу),
  здесь не менялся.

## Разное

- `InboxChatItem.tsx` (параллельная сессия): `flex-1` на строке инбокса — короткий
  проект не резался при свободном месте справа.

## Проверки

Edge: deno check — set-reaction 0, webhook-v2/telegram-send-message только
пред-существующий strict-null шум supabase-js (мои строки чисты). Фронт: tsc 0,
lint 0, 819 тестов. Задеплоено: `telegram-webhook-v2`, `telegram-set-reaction`,
`telegram-send-message`. Миграция — в проде через MCP.

## Смок

В multi-bot группе (новое сообщение после деплоя): реагирую своим ботом → реакция
от моего бота; отвечаю текстом и файлом → нативный reply (не цитата). Приём
входящих не сломан.

## Ссылки

- ledger 2026-07-06 (реализация C + reply на карте).
- план: `docs/feature-backlog/2026-07-06-per-bot-telegram-message-ids.md`.
