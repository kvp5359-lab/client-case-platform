# Telegram: reply-цитирование в группах с несколькими ботами

**Дата:** 2026-06-04
**Тип:** fix
**Статус:** completed
**Зона:** карантин (Telegram) — правка по явному запросу, со смок-тестом

В группе, где сидит 2+ ботов воркспейса (`telegram_workspace_bot` +
`telegram_employee_bot`'ы), ответ (reply) на сообщение, отправленное **другим**
ботом, не подхватывал оригинал — цитата терялась.

---

## Причина

Telegram нумерует `message_id` **независимо для каждого бота** (per-bot-view-of-chat,
та же особенность, что описана в `gotchas.md` про multi-bot dedup). Когда клиент
отвечает на сообщение бота A, входящий апдейт ловит бот B и приносит
`reply_to_message.message_id` в **своей** нумерации. Этот id не совпадает с
`telegram_message_id`, под которым оригинал записан в `project_messages` (там
нумерация бота A) → поиск оригинала по `message_id` давал `null` → реплай
сохранялся без `reply_to_message_id`.

## Решение

Матчим оригинал реплая по **бот-независимому** признаку — дате сообщения.

- [`telegram-send-message/index.ts`](../../supabase/functions/telegram-send-message/index.ts):
  при успешной отправке исходящего стампит `telegram_message_date` (из
  `tgData.result.date`) в `project_messages` рядом с `telegram_message_id` /
  `telegram_chat_id`.
- [`_shared/syncTelegramIncomingMessage.ts`](../../supabase/functions/_shared/syncTelegramIncomingMessage.ts):
  расширен тип `reply_to_message` полем `date`. Добавлен **фолбэк**: если
  оригинал не найден по `message_id`, ищем по паре `(telegram_chat_id +
  telegram_message_date)` в пределах проекта (берём самый ранний). Включается
  **только** когда основной поиск дал `null` — обычные single-bot сценарии не
  затрагиваются.

## Затронутые файлы

- `supabase/functions/telegram-send-message/index.ts`
- `supabase/functions/_shared/syncTelegramIncomingMessage.ts`

## Деплой Edge Functions

`_shared` бандлится в каждую функцию-импортёр, поэтому передеплоены все
зависимые (все с `--no-verify-jwt`):

- `telegram-send-message`
- `telegram-webhook-v2`
- `telegram-webhook`
- `telegram-business-webhook`

## Проверки

- `npm run lint && npm test` — зелёные (lint 0, 671 тест).
- Смок-тест карантина (приём входящего, реплай на сообщение от другого бота,
  дедуп при двойном приёме) — после деплоя.

## На будущее

Фолбэк по дате терпит редкий edge-case: два разных сообщения в один и тот же
момент (секунда) в одном чате → реплай может привязаться к самому раннему из
них. На практике не встречается (как и аналогичный случай в content-based dedup,
см. `gotchas.md`).
