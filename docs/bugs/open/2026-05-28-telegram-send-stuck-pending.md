---
id: 2026-05-28-telegram-send-stuck-pending
title: Исходящие через employee_bot зависают в send_status='pending', хотя реально доставлены
status: open
severity: high
area: telegram-send-message, send_status, employee_bot
first-seen: 2026-05-22 (по логам 27 мая)
last-investigated: 2026-05-28
reproduced: yes (несколько случаев, root cause не локализован)
---

## Что было

Юзер пишет сообщение в треде через UI ClientCase. Через ~60 секунд видит «крутится → ⚠️ Повторить отправку». При этом в Telegram сообщение **реально доставлено** клиенту сразу.

**Воспроизведение 2026-05-28 10:06 UTC:**
- `project_messages.id = 3c576707-e8cf-4822-b8cf-4b92ae95a555`
- content: «Понял, ну надеемся ) А пошлину в случае отказа и переподачи нужно заново платить, да?»
- workspace: `8a946780-77e9-42cd-a05b-cdb66e53c941` (client-case)
- project: `378a089c-d7c4-4675-8e53-0b344312ff28` (ВНЖ cuenta propia — Наталья Шамина)
- `telegram_bot_integration_id = ae023cda-bd89-4400-8847-d06beea72f18` (rs_help123_bot, employee)
- `send_status = pending` (НЕ failed)
- `telegram_message_id = null`
- `telegram_chat_id = null`
- `telegram_error_detail = null`
- source: `web`

Логи `telegram-send-message` за этот момент: один успешный POST 200 за 697ms.

В Telegram сообщение пришло сразу (видно на скриншоте юзера, 12:06 локального времени).

## Что показал предыдущий fix-attempt 2026-05-27

См. [docs/changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md](../../changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md).

Был добавлен:
- `statusWritten` локальный флаг в `telegram-send-message` — пишет в `console.error("BUG.no_branch_wrote_status")` и UPDATE `telegram_error_detail` если ни одна ветка не выставила send_status.
- Расширенный `trace("request.start")` с typeof body.attachments_only, preview content, флаг `content === "📎"`.

Сегодня у этой строки `telegram_error_detail = null` — это значит:
- ЛИБО statusWritten НЕ запустился (был return до его проверки, или throw до финального блока),
- ЛИБО statusWritten=true (какая-то ветка SET send_status), но потом строку «откатили» обратно в pending (что маловероятно).

**Доступа к Edge Function `console.error/log` логам через CLI 2.75 нет** (только request-метрики). Нужен Supabase Dashboard → Edge Functions → logs.

## Гипотезы (НЕ проверены, требуют логов)

### A. markMessageSent сделал UPDATE 0 строк
`markMessageSent` в `_shared/messageSendStatus.ts` может фильтровать через `.eq('send_status', 'pending')` или подобное. Если в момент вызова статус уже не pending (например, второй параллельный invoke перевёл) — UPDATE сделает 0 строк, console.warn без exception, функция вернёт 200.

**Как проверить:** прочитать `_shared/messageSendStatus.ts`, смотреть RETURNING/count в UPDATE.

### B. Race condition между двумя invocations
Фронт мог вызвать `telegram-send-message` дважды (например, debounce промахнулся, или React StrictMode в dev). Первая отправила в TG и выставила sent. Вторая увидела что строка уже sent → проигнорировала + console.log без error. Но тогда в БД должно быть `sent`, а у нас `pending`. Гипотеза не подходит.

### C. Edge function отправила через TG api, но НЕ через markMessageSent
Возможно где-то ветка кода которая делает `fetch(`...api.telegram.org/.../sendMessage`)` сразу, без последующего обновления БД. Например, если есть какой-то «прямой» путь только для employee_bot, который забыл вызвать markMessageSent.

**Как проверить:** грепнуть `sendMessage` в `telegram-send-message/*.ts`, посмотреть все ветки на отсутствие парного markMessageSent.

### D. JWT истёк / RLS блокирует service UPDATE
markMessageSent использует service_role клиент (по идее). Если случайно используется userClient — RLS может отбить UPDATE на `project_messages` в зависимости от политики. Тихий fail.

**Как проверить:** прочитать `markMessageSent` импорт клиента.

## Зона поражения

Все исходящие в TG через `employee_bot path` (telegram_employee_bot ботов).

**Не затронуто:** workspace_bot (rs1/rs2_support) — в БД для них десятки sent-сообщений за день, проблем нет.

## Следующие шаги расследования

1. **Прочитать `_shared/messageSendStatus.ts`** — точная логика markMessageSent: что фильтрует, что возвращает.
2. **Грепнуть все sendMessage / fetch с api.telegram.org в `telegram-send-message/**.ts`** — найти ветку без парного markMessageSent.
3. **Достать detailed Edge Function logs за 10:06 UTC 2026-05-28** через Supabase Dashboard. Искать маркеры `BUG.no_branch_wrote_status`, `trace("request.start")`, любые console.error по message_id `3c576707-e8cf-4822-b8cf-4b92ae95a555`.
4. **Запустить тестовый сценарий локально:** воспроизвести отправку через employee_bot путь, поставить breakpoint/console.log в каждой ветке `telegram-send-message`, посмотреть какая выполняется и почему markMessageSent не сработал.

## Workaround для пользователя

Сообщение реально доставлено — клиент его видит. UI-обманка с «Повторить отправку» можно проигнорировать. **НЕ нажимать «Повторить»** — это приведёт к **дублю** в TG (status переход failed→pending триггерит повторную отправку).

## Связано

- [docs/changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md](../../changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md) — добавленный мониторинг statusWritten.
- `.claude/rules/channels.md` → раздел Telegram (групповой бот) + send_status.
- `.claude/rules/gotchas.md` → раздел маршрутизации в `notify_telegram_on_new_message`.
