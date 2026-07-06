# (C) Per-bot telegram_message_id — правильная подпись реакций в multi-bot группах

**Дата:** 2026-07-06
**Тип:** feature / карантин (Telegram)
**Приоритет:** важный (реакции в группах с несколькими ботами)
**Оценка:** ~0.5–1 день + смок

---

## Проблема

В TG-группе с несколькими ботами воркспейса (секретарь + личные боты сотрудников)
Telegram присваивает **каждому боту свой `message_id`** для одного и того же
сообщения (privacy mode, см. gotchas «multi-bot dedup», ledger §G1).

Реакция в Telegram **«именная»** — привязана к боту, который её отправил
(`setMessageReaction`). Чтобы поставить реакцию **от бота реагирующего сотрудника**
(правильная подпись), нужен `message_id` этого сообщения **именно для его бота**.

Сейчас мы храним только ОДИН `message_id` на сообщение (`project_messages.telegram_message_id`)
+ бота, который его записал (`telegram_bot_integration_id`) — это «победитель» дедупа
(первый webhook). `message_id` остальных ботов **выбрасывается** на дедупе
(outcome `duplicate`). Есть массив `telegram_message_ids[]`, но он **без привязки**
«какой id какому боту принадлежит».

**Следствие:** если сообщение первым увидел чужой бот, поставить реакцию ботом
реагирующего нельзя (у него нет сохранённого своего `message_id`). Приходится либо
не ставить (текущее поведение после отката 2026-07-06 — «правильно или никак»),
либо ставить чужим ботом (ложная подпись — отвергнуто).

## Цель

Реакция в multi-bot группе **всегда** доходит до Telegram И подписана **ботом
реагирующего** (или его собственным). Для этого хранить `message_id`
**по каждому боту**, который видел сообщение.

## Дизайн

### 1. Хранение: jsonb-карта на сообщении (без новой таблицы)

Колонка `project_messages.telegram_bot_msg_ids jsonb` (DEFAULT `'{}'`):
```
{ "secretary": 328, "<integration_id_1>": 5171, "<integration_id_2>": 903 }
```
Ключ = `COALESCE(bot_integration_id::text, 'secretary')`, значение = `message_id`
этого бота.

**Почему jsonb + атомарный RPC, а не сторонняя таблица:** несколько webhook'ов
(разные боты) прилетают почти одновременно (multi-file/multi-bot) → read-modify-write
на массиве/строке = гонка. Атомарный `UPDATE ... SET map = jsonb_set(...)` держит
row-lock и безопасен без сторонней таблицы. Путь реакции и так уже читает строку
сообщения — карта доступна без join.

RPC (SECURITY DEFINER, service_role):
```sql
record_telegram_bot_msg_id(p_row_id uuid, p_bot_key text, p_msg_id bigint)
  → UPDATE project_messages
    SET telegram_bot_msg_ids = jsonb_set(COALESCE(telegram_bot_msg_ids,'{}'), ARRAY[p_bot_key], to_jsonb(p_msg_id), true)
    WHERE id = p_row_id AND NOT (telegram_bot_msg_ids ? p_bot_key);  -- не перезаписывать
```

### 2. Захват: во ВСЕХ исходах дедупа

Файл `_shared/syncTelegramIncomingMessage.ts` — после определения исхода звать
`record_telegram_bot_msg_id(rowId, botKey, telegramMessageId)`:
- **`inserted`** — rowId есть → записать (botKey первого бота).
- **`enriched`** — `existing.id` есть → записать (botKey личного бота). *(частично уже
  делается через массив; заменить/дополнить картой.)*
- **`duplicate`** ⭐ — **сейчас `rowId=null`, id теряется.** Ключевая правка: перед
  `return duplicate` сделать тот же content-lookup, что в enrich (chat+sender+date
  [+file_unique_id]) → получить `existing.id` → записать `(id, botKey, telegramMessageId)`.
  Именно здесь копятся «чужие» боты, которых сейчас нет.

`botKey`: секретарь → `'secretary'`, личный бот → `asPersonalBot.integrationId` (или
`ctx`-бот текущего webhook'а — уточнить, чей это webhook в каждой ветке).

⚠️ **Какой бот сейчас обрабатывает webhook** — надо аккуратно взять из контекста
(`IntegrationContext` в telegram-webhook-v2), а не только `asPersonalBot`
(секретарский webhook — это `asPersonalBot=null`, botKey='secretary'; личный —
`integrationId`). В enrich/duplicate ветках `asPersonalBot` уже отражает это.

### 3. Путь реакции: telegram-set-reaction

Сейчас: резолвит строку по `(chat_id, telegram_message_id)`, берёт
`telegram_bot_integration_id`, строит кандидатов (личный бот реагирующего →
оригинала → секретарь), шлёт `setMessageReaction` с `body.message_id`.

Меняем на **точный message_id для бота реагирующего**:
1. Читать `telegram_bot_msg_ids` из строки сообщения (доп. поле в select).
2. Определить бота реагирующего (уже есть: `telegram_employee_bot` c
   `owner_user_id=user.id`; если нет — секретарь). `botKey`.
3. `msgIdForMyBot = telegram_bot_msg_ids[botKey]`.
4. Если есть → `setMessageReaction` **токеном моего бота** с `msgIdForMyBot` →
   правильная подпись. Готово.
5. Если НЕТ (мой бот не видел это сообщение — например, вступил в группу позже) →
   политика: **не ставить в TG** (реакция остаётся в сервисе), НЕ подписывать чужим
   ботом. (Опционально: тост «реакция не отправлена в Telegram — ваш бот не видел это
   сообщение».) Это сохраняет принцип «правильно или никак», но теперь «правильно»
   срабатывает почти всегда (карта покрывает всех ботов в группе на момент сообщения).

### 4. Снятие реакции (toggle off)

Снимать тем же ботом + его `message_id` (`telegram_bot_msg_ids[botKey]`), которым
ставили. Т.к. бот реагирующего детерминирован (его собственный) — консистентно,
доп. хранение «кто поставил» не нужно.

## Затрагиваемые файлы

- **Миграция:** колонка `project_messages.telegram_bot_msg_ids jsonb` + RPC
  `record_telegram_bot_msg_id` (+ грант service_role, REVOKE anon).
- `supabase/functions/_shared/syncTelegramIncomingMessage.ts` — захват во всех
  исходах (главное — ветка `duplicate`).
- `supabase/functions/telegram-set-reaction/index.ts` — резолв message_id для бота
  реагирующего из карты.
- `types/database.ts` — новая колонка + RPC (вручную).

## Деплой

Карантин. Redeploy: `telegram-webhook-v2` (`--no-verify-jwt`) — приём/захват;
`telegram-set-reaction` — реакции. Business/Wazzup/MTProto не трогаем (1:1, не
multi-bot). v1 webhook трафик не получает (все боты на v2).

## Смок

- В группе с 2+ ботами: клиент/коллега пишет (первым видит бот A) → в карте
  появляются id всех ботов группы (A + B + секретарь).
- Реагирую своим ботом (B) на это сообщение → в Telegram реакция **от моего бота B**,
  не от A.
- Снимаю реакцию → снимается.
- Сообщение, которое мой бот объективно не видел (вступил позже) → реакция в TG не
  ставится, в сервисе остаётся; ложной подписи нет.
- Регресс: реакции в 1:1 (Business/MTProto) и в группе с одним ботом — как раньше.

## Заметки / edge

- **Backfill не нужен:** карта копится с момента выката. На старых сообщениях
  `telegram_bot_msg_ids` пуст → реакция падает в ветку 5 (не ставим в TG). Приемлемо.
- `telegram_message_ids[]` можно позже вывести из карты (values) и удалить, но сейчас
  его читают edit/delete cross-bot — НЕ трогать в этой задаче.
- Гонка исключена атомарным `jsonb_set` под row-lock; условие `NOT (map ? key)` не
  даёт перезаписать (первый id бота — стабильный).
- Приём реакций клиента (`syncTelegramReactions.ts`) — отдельная тема, здесь не нужен.

## Ссылки

- ledger 2026-07-06 «Реакция из сервиса не проходит в группу без секретаря» (корень +
  откат misattribution).
- gotchas «multi-bot dedup», §G1.
- `_shared/syncTelegramIncomingMessage.ts` (дедуп-исходы), `telegram-set-reaction`.
