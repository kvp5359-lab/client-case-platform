# Кнопка «Повторить отправку» для сообщений, не доставленных в Telegram

**Дата:** 2026-04-14
**Тип:** feat
**Статус:** completed

---

## Проблема

Если сообщение из веб-версии не доставлялось в привязанную Telegram-группу (триггер БД или edge function падали — 401, сетевой сбой, недоступность Telegram API), пользователь видел только красную иконку `AlertCircle` в правом верхнем углу пузыря. Способа пересоздать отправку без удаления и повторного ввода сообщения не было — приходилось писать всё заново.

Статус «не доставлено» вычислялся в `useTelegramDeliveryStatus`: если через 30 секунд у сообщения не было `telegram_message_id`, или вложения записывались с `telegram_attachments_delivered = false`, пузырь помечался как failed.

## Решение

Добавлена кнопка **«Повторить отправку»** в правом нижнем углу пузыря, которая появляется при `tgFailed && !message.is_draft`. По клику повторно вызывает edge function `telegram-send-message` для уже существующего сообщения — та идемпотентна по `message_id` и переписывает `telegram_message_id` / `telegram_attachments_delivered` в БД.

Логика работы:
- Для сообщений с вложениями — вызов с `attachments_only: true` и `content` реального текста: если `telegram_message_id` пуст, текст уйдёт как caption к первому файлу; если уже записан — не задвоится.
- Для сообщений без вложений — обычный вызов (триггер БД на `INSERT` срабатывает один раз, при retry текст ушлёт сама edge function и запишет `telegram_message_id`).
- Оптимистичное обновление сдвигает `created_at` в кеше React Query, чтобы таймер failed в `useTelegramDeliveryStatus` сбросился и индикатор вернулся в `pending` на 30 секунд.

Стилистически кнопка переиспользует подход `DraftPublishButton` (пилюля 11 px, иконка `RefreshCw`), но в красной палитре — визуально подсвечивает, что это действие из ошибки.

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `src/services/api/messenger/messengerService.ts` | Функция `retryTelegramSend` — находит `telegram_chat_id` по треду/проекту и вызывает edge function `telegram-send-message`. |
| `src/hooks/messenger/useRetryTelegramSend.ts` | Новый хук-мутация с оптимистичным сбросом таймера failed и рефетчем после ответа edge function. |
| `src/hooks/messenger/index.ts` | Экспорт `useRetryTelegramSend`. |
| `src/components/messenger/hooks/useMessengerState.ts` | Подключение `useRetryTelegramSend(threadId)` и проброс мутации наверх. |
| `src/components/messenger/hooks/useMessengerHandlers.ts` | Handler `handleRetryTelegramSend`, берёт `senderName/Role` из `currentParticipant`. |
| `src/components/messenger/MessengerContext.tsx` | Проп `onRetryTelegramSend` в контексте. |
| `src/components/messenger/MessengerTabContent.tsx` | Передача handler в `MessengerProvider`. |
| `src/components/messenger/BubbleTextContent.tsx` | Новый экспорт `RetrySendButton` + рендер рядом с `ChevronDown` для длинных сообщений. |
| `src/components/messenger/MessageBubble.tsx` | Рендер `RetrySendButton` в правом нижнем углу пузыря для коротких failed-сообщений. |
| `.gitignore` | Добавлен `test-results.json` — артефакт `npm test`. |
