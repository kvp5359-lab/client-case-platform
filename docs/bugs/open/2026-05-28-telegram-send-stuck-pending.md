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

### Окружение группы

В группе «Клиент [Cuenta] — Наталья Шамина» (`telegram_chat_id = ?`, project `378a089c-d7c4-4675-8e53-0b344312ff28`) сидят **оба бота** и оба админы:
- Секретарь («-», иконка наушников) — workspace bot.
- `Kirill` — личный бот юзера `rs_help123_bot` (id `ae023cda-bd89-4400-8847-d06beea72f18`, employee_bot).

Значит **«bot is not a member of the group chat» — не применимо**. Edge function правильно выбрала rs_help123 (через `telegram_bot_integration_id` сообщения), бот в группе, отправка успешна (697ms). Fallback на секретаря тоже не срабатывал (`telegram_bot_integration_id` в БД остался employee = ae023cda...).

То есть **код успешно прошёл текстовую ветку до `markMessageSent`** — это **сужает зону поиска root cause до самой функции `markMessageSent` или того, что выполняется после неё**.

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

## Действия 2026-05-28 12:10 UTC

### Manual recovery двух застрявших сообщений
```sql
UPDATE project_messages
SET send_status = 'sent', send_failed_reason = NULL,
    telegram_error_detail = 'manual_recovery_2026-05-28: stuck pending bug'
WHERE id IN (
  '3c576707-e8cf-4822-b8cf-4b92ae95a555',  -- «Понял, ну надеемся»
  '8f9dfa06-2356-4178-90ff-f706ac7e61eb'   -- «Понял, сделаем»
);
```
UI-плашки «Повторить отправку» убираются после refresh страницы.

### Защитный фикс в `_shared/messageSendStatus.ts`
`markMessageSent` и `markMessageFailed` теперь делают `.select('id')` после UPDATE и **бросают exception при 0 affected rows**. Раньше supabase-js возвращал success даже при 0 строк (id не найден / RLS) — это и был механизм тихого bypass'а.

После фикса при повторении бага:
1. markMessageSent кинет «affected 0 rows for id=…».
2. Catch в `telegram-send-message/index.ts` (строки 478 / 670) попробует fallback UPDATE — тоже 0 rows (если корень — неверный id).
3. Outer catch → 500 → watchdog за минуту переведёт pending → failed.
4. В `telegram_error_detail` будет **конкретная причина** — можно сделать post-mortem SQL'ом без Dashboard logs.

**Симптом для юзера почти не меняется** (failed появится за ~1 мин вместо 60 сек таймера), но **диагностика теперь в БД**.

Деплой: telegram-send-message, telegram-mtproto-send, telegram-business-send, wazzup-send, email-internal-send.

## Инцидент 2026-05-28 ~10:24 UTC во время этого фикса

При первом деплое выше **пропустил флаг `--no-verify-jwt`** (нарушение правила из [`gotchas.md`](../../../.claude/rules/gotchas.md) → раздел «--no-verify-jwt для webhook и *-send»). С момента деплоя ~10:15 UTC до re-deploy ~10:30 UTC pg-триггер шёл через шлюз Supabase с 401 `UNAUTHORIZED_NO_AUTH_HEADER`. Edge function НЕ запускалась.

Жертва: одно сообщение `9037729c-1cc4-4705-9475-8f68d9c9d4e2` («Хорошо, решим, не переживайте»). Watchdog перевёл pending → failed с конкретной причиной в `send_failed_reason`. Юзер увидел «Повторить отправку» сразу (без 60 сек таймера, т.к. watchdog сработал).

**В отличие от утренних случаев это сообщение НЕ было доставлено в TG** (телега не получала запрос вообще). Юзер нажал «Повторить отправку» → переход failed → pending → триггер дёрнул `telegram-send-message` (уже с правильным флагом) → доставка прошла.

Re-deploy с `--no-verify-jwt` для всех 5 функций сделан немедленно после обнаружения. Других жертв за это окно не было (SQL подтвердил по `send_failed_reason ILIKE '%UNAUTHORIZED_NO_AUTH_HEADER%'`).

**Урок:** перед каждым `supabase functions deploy *-send|*-webhook` обязательно `--no-verify-jwt`. Это уже есть в gotchas, но в стрессовой ситуации забыл. Защитный фикс на уровне CLI отсутствует — нужен local checklist или скрипт `scripts/deploy-edge.sh`, который форсит флаг для известных функций.

## Связано

- [docs/changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md](../../changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md) — добавленный мониторинг statusWritten.
- `.claude/rules/channels.md` → раздел Telegram (групповой бот) + send_status.
- `.claude/rules/gotchas.md` → раздел маршрутизации в `notify_telegram_on_new_message`.

## Действия 2026-05-28 15:00 UTC — root cause symptom **локализован**: 23505 на uq_telegram_message_per_chat

### Контекст

После коммита `3ade916` (markMessageSent ассертит affected rows) и моего фикса `b349dc4` (catch-fallback тоже ассертит) — баг теперь **не silent**. Edge function возвращает `500` с конкретной причиной в `send_failed_reason`, watchdog ставит `failed`.

### Два новых случая 2026-05-28 14:59 / 15:00 UTC (Анна Бурнаева, тред Анаит Дарбинян)

- `c76bfd54-479b-415b-9fba-9a361ecac21d` — «Насчёт пошлин - мы можем сформировать вам квитанции...»
- `6aefa4d6-eea5-475f-86fc-1ec66c0b1156` — reply на «Еще мне знакомые обещают подписать...»

**Оба упали с одинаковой ошибкой в `send_failed_reason`:**

```
Сервис telegram-send-message вернул ошибку 500:
markSent fallback UPDATE failed: duplicate key value violates
unique constraint "uq_telegram_message_per_chat" (23505)
```

### Что это значит

UNIQUE-индекс `uq_telegram_message_per_chat` определён как partial UNIQUE:
```sql
CREATE UNIQUE INDEX uq_telegram_message_per_chat ON public.project_messages
USING btree (telegram_message_id, telegram_chat_id)
WHERE telegram_message_id IS NOT NULL AND telegram_chat_id IS NOT NULL;
```

Edge function пыталась UPDATE `c76bfd54` с `(telegram_chat_id, telegram_message_id)`, который **уже занят** другой строкой в БД. Раньше (до 3ade916) supabase-js возвращал `error` молча — функция считала UPDATE'ом успешным, `statusWritten=true`, юзер видел зависший pending. Теперь error пробрасывается → failed с конкретной причиной.

### **Что в БД для треда f2b23f81 (Анаит) на момент инцидента:**

- `3472aba8-676d-45a4-ab53-bf8fef4c0d51` — Анна Бурнаева, web, **msg_id=319**, chat_id=-5065960967, sent (14:56:32)
- `c76bfd54...` — Анна Бурнаева, web, msg_id=null, chat_id=null, **failed** (14:59:02)
- следующий **msg_id=320 в БД отсутствует**.

Edge function для `c76bfd54` пыталась записать `msg_id=319` (то же что у 3472aba8) → 23505.

### Это **не**:
- Не race с webhook'ом (incoming сообщения через webhook идут с `source='telegram'` и фильтруются другим индексом `uq_project_messages_telegram_content_dedup` через `WHERE source='telegram'`).
- Не multi-bot dedup (классический сценарий из `gotchas.md`) — там у каждого бота свой `message_id` для одного и того же физического сообщения. Здесь же мы видим конфликт **внутри одного бота** (1399d46a) на разных сообщениях.

### Сильная гипотеза: **state leak / повторное использование TG-ответа между invocations**

Бот Telegram физически **не может вернуть одинаковый `message_id` для двух разных сообщений** — нумерация в группе строго инкрементная. Значит:
- ИЛИ edge function **не отправляла** второй раз, а взяла `tgData.result.message_id` из памяти/closure предыдущего вызова.
- ИЛИ был повторный вызов с idempotency через pg_net retry на сетевой timeout (но `message_send_dispatch` показывает 1 dispatch на сообщение).
- ИЛИ Telegram Bot API имеет какую-то форму dedup'а (маловероятно при разных текстах).

Самая вероятная — **shared state в Deno Edge runtime между invocations**. Deno может переиспользовать инстанс между несколькими request'ами, и если где-то осталась module-level mutable variable — могло утечь.

В коде `telegram-send-message/index.ts` все `let` и `const` объявлены **внутри** `Deno.serve(async (req) => { ... })` handler'а, что должно давать чистый closure на каждый запрос. **Нужно дополнительное расследование** — особенно на shared helpers (`telegramBotToken.ts`, `attachments.ts`).

### Manual recovery второй партии

```sql
UPDATE project_messages
SET send_status='sent', send_failed_reason=NULL,
    telegram_error_detail = COALESCE(telegram_error_detail||'; ','') ||
      'manual_recovery_2026-05-28-2: stuck on uq_telegram_message_per_chat 23505'
WHERE id IN (
  'c76bfd54-479b-415b-9fba-9a361ecac21d',
  '6aefa4d6-eea5-475f-86fc-1ec66c0b1156'
);
```

Также manually восстановлены до этого: `fb962b07-2ba2-4d24-bfc6-696eae4bbc02`, `43bc14a9-8460-44dd-9689-c102162a8fd6` (в коммите `b349dc4` — старый код без assert'а в catch-fallback, поэтому конкретная причина была заметена; но логика та же).

### Следующие шаги расследования

1. **Грепнуть module-level let/var в `telegram-send-message` и shared** (`_shared/telegramBotToken.ts`, `_shared/messageSendStatus.ts`, `_shared/edge.ts`, `telegramMigration.ts`, `helpers.ts`, `attachments.ts`).
2. **Логировать в Edge Function каждый вызов**: `trace("tg.send.response", { tg_message_id: tgData.result?.message_id, chat_id: activeChatId, prev_message_in_db: <SELECT> })`. Если `tg_message_id` совпадает с какой-то существующей записью — это shared state, а не TG.
3. **Если найдём shared state** — переписать на чистые closure-only переменные.
4. **Если shared state не найдётся** — посмотреть на pg_net behavior при network timeout: возможно ли что dispatch создаёт реально 2 net.http_post'а, но виден только один в `message_send_dispatch`?

## Связано

- `gotchas.md` → раздел про `uq_telegram_message_per_chat` и multi-bot dedup.

## Действия 2026-05-28 18:45 UTC — **РОДНАЯ ПРИЧИНА ЛОКАЛИЗОВАНА И ИСПРАВЛЕНА**

### Прорыв через candidate-диагностику

Коммит `8244045` добавил запись `(chat, tg_msg_id, integration, tg_date, elapsed_ms)` в `telegram_error_detail` **до** вызова `markMessageSent`. Это позволило при следующем падении увидеть **точное** значение, которое пытались записать, даже если потом упало.

### Следующий случай 2026-05-28 16:40 UTC — `7e8bc228-d2c2-475d-bcc8-a569f85c4e70`

```
telegram_error_detail: candidate_markSent: tg_msg_id=328,
                       chat=-5065960967,
                       integration=1399d46a-fd58-45fe-a8e2-b438bab9a46b (личный бот Анны),
                       trace=tg-send-7e8bc228-mpppyp0k,
                       elapsed_ms=453,
                       tg_date=1779986432 (= 2026-05-28 16:40:32 UTC, +2 сек от created_at)
```

`tg_date` совсем свежий → Telegram **реально** отправил это сообщение сейчас, никакого кэшированного response от прошлого вызова не было. **Гипотеза о state leak / TG idempotency опровергнута.**

### Кто **уже** в БД с (chat=-5065960967, msg_id=328)?

```sql
SELECT id, source, telegram_message_id, telegram_chat_id, telegram_bot_integration_id,
       sender_name, created_at, LEFT(content,40)
FROM project_messages WHERE telegram_message_id=328 AND telegram_chat_id=-5065960967;
```

Результат:
```
id=33053b3c-5d7f-4d57-9f74-74654da66311
source=telegram (входящее)
telegram_message_id=328
telegram_chat_id=-5065960967
telegram_bot_integration_id=ae023cda-bd89-4400-8847-d06beea72f18  ← СТАРЫЙ @relostart123_bot
sender_name=Anait
content=📎
created_at=2026-05-20 12:40:45 (8 дней назад!)
```

### Истинная корневая причина

`uq_telegram_message_per_chat` индексирует только `(telegram_chat_id, telegram_message_id)`, **не** включая `telegram_bot_integration_id`. Но **каждый бот в группе имеет свою независимую нумерацию `message_id`** — Telegram нумерует сообщения per-bot-view-of-chat, не глобально.

Сценарий:
1. **20 мая** клиент Anait отправил вложение в группу `-5065960967`.
2. Webhook **старого** бота (`ae023cda`, @relostart123_bot) поймал его → INSERT в БД с (chat, 328, bot=ae023cda, source='telegram').
3. **28 мая** Анна Бурнаева отправляет из ЛК сообщение через **другого** бота (`1399d46a`, новый личный бот Анны).
4. Telegram даёт этому новому сообщению msg_id=328 — **в нумерации нового бота**.
5. Edge Function пытается markMessageSent с `(chat, 328)` для `7e8bc228` → 23505 на UNIQUE conflict с record от старого бота.
6. catch fallback тоже падает (то же 23505).
7. Outer catch → 500 → watchdog ставит failed.

**Симптом для пользователя:** сообщение реально в Telegram доставлено (личный бот Анны успешно отправил), но в БД красное.

### Парадокс с gotchas.md

В [gotchas.md → раздел multi-bot dedup](../../../.claude/rules/gotchas.md) уже было написано:

> UNIQUE `uq_telegram_message_per_chat (telegram_chat_id, telegram_message_id)` тут **не помогает** — id разные.

Этот текст описывал случай **двух ботов в одной группе принимают то же входящее сообщение**: у каждого свой msg_id → constraint просто пропускает оба INSERT'а. Тогда казалось, что constraint безвреден.

Но **тот же факт** работает в обратную сторону: разные боты в той же группе **могут случайно получить пересекающиеся msg_id** (потому что нумерации независимы) → constraint **мешает** легитимной отправке.

Заметка в gotchas неполная — она оценивала только один сценарий.

### Фикс — миграция [20260528_fix_uq_telegram_message_per_chat_include_bot.sql](../../../supabase/migrations/20260528_fix_uq_telegram_message_per_chat_include_bot.sql)

```sql
DROP INDEX IF EXISTS public.uq_telegram_message_per_chat;

CREATE UNIQUE INDEX uq_telegram_message_per_chat
ON public.project_messages (
  telegram_chat_id,
  telegram_message_id,
  COALESCE(telegram_bot_integration_id::text, 'secretary')
)
WHERE telegram_message_id IS NOT NULL AND telegram_chat_id IS NOT NULL;
```

NULL `telegram_bot_integration_id` → COALESCE на 'secretary' (это записи от secretary-bot, у которых stamp не ставится — для них поведение остаётся прежним).

После фикса (chat, msg_id) от РАЗНЫХ ботов не считаются дублями, INSERT/UPDATE проходит.

### Подтверждение жертв

Все недавние failed/pending сообщения с этой ошибкой (manual recovery):
- `fb962b07-2ba2-4d24-bfc6-696eae4bbc02` — Анна Бурнаева, 13:00 UTC
- `43bc14a9-8460-44dd-9689-c102162a8fd6` — Анна Бурнаева, 13:08 UTC
- `c76bfd54-479b-415b-9fba-9a361ecac21d` — Анна Бурнаева, 14:59 UTC
- `6aefa4d6-eea5-475f-86fc-1ec66c0b1156` — Анна Бурнаева, 15:00 UTC
- `d3b27721-980c-4767-aa73-1baa375b8660` — Анна Бурнаева, 16:11 UTC
- `7e8bc228-d2c2-475d-bcc8-a569f85c4e70` — Анна Бурнаева, 16:40 UTC

Все через `integration=1399d46a` (личный бот Анны). У неё в момент инцидента нумерация бот-у дошла до области, которая 8 дней назад была занята другим ботом — отсюда серия конфликтов в один день.

### Обновить `gotchas.md`

Раздел про uq_telegram_message_per_chat нужно дополнить: «constraint не только не помогает multi-bot dedup'у — он ещё и **активно ломает** легитимную отправку, когда разные боты в одной группе пересекаются по msg_id». После миграции 28 мая constraint расширен на bot_integration_id.

### Статус

**RESOLVED.** Bug-doc переедет в `docs/bugs/resolved/` при следующем чекине.
