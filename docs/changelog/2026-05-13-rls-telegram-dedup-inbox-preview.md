# RLS-регрессия создания тредов, дедуп Telegram между ботами и превью инбокса

**Дата:** 2026-05-13
**Тип:** fix (critical + high + medium)
**Статус:** completed

---

## Контекст

Три проблемы, всплывшие в одной сессии расследования. Все три задевали клиентов в проде, две из них — критично:

1. **Создание задач из шаблона при «Создать проект» не работало.** Галочки задач и чатов выставлены, проект создаётся, а тредов нет. При попытке создать тред руками — 403 Forbidden от Supabase. Сломалось у всех клиентов с 2026-05-10.
2. **Сообщения клиента в Telegram-группе дублируются 2-3 раза в треде сервиса.** Клиент пишет одно сообщение, в сервисе появляются три одинаковых подряд.
3. **Во «Входящих» превью треда показывает моё исходящее, а не непрочитанное сообщение клиента.** Бейдж непрочитанных правильный, но в тексте превью видно мой ответ — непонятно, на что собственно отвечать.

## Сюжет 1: INSERT…RETURNING падает с 42501 (третья регрессия одного и того же бага)

### Симптомы

`POST /rest/v1/project_threads?select=*` → **403 Forbidden**. В логах postgres — `new row violates row-level security policy for table "project_threads"`. Затронуты **все** инсёрты тредов через REST API (PostgREST по умолчанию шлёт `Prefer: return=representation`, что транслируется в `INSERT…RETURNING *`).

### Корень

Миграция [`20260510_personal_dialogs_rls.sql`](../../supabase/migrations/20260510_personal_dialogs_rls.sql) переписала полицию `project_threads_select` как:

```sql
USING (can_user_access_thread(id, (SELECT auth.uid())))
```

Функция `can_user_access_thread(uuid, uuid)` — `SECURITY DEFINER STABLE` — внутри делает `SELECT … FROM project_threads WHERE id = p_thread_id`. В контексте `INSERT…RETURNING` SELECT-полиция применяется к NEW-строке, но внутри SECURITY DEFINER функции свежевставленная строка ещё **не видна** snapshot'у функции → `NOT FOUND` → `RETURN false` → RLS отбивает с тем же `42501`.

Подтверждено инструментованной версией функции, писавшей в `_diag_inside` таблицу: при вызове из SELECT-полиции на RETURNING-строке `thread_found = false`, `v_thread.workspace_id = null`.

### Это уже третий раз

| Миграция | Что сделала |
|---|---|
| `20260404191200_fix_thread_select_policy_inline.sql` | Первый фикс short-circuit'а. |
| `20260426_thread_access_rls.sql` | Переписала полицию, выкинула short-circuit → сломала. |
| `20260427_fix_thread_select_returning.sql` | Восстановила short-circuit. |
| `20260510_personal_dialogs_rls.sql` | Снова переписала полицию (для личных диалогов), снова выкинула short-circuit → **снова сломала**. |
| `20260513083503_fix_thread_select_returning_after_personal_dialogs.sql` | Восстановила short-circuit. |

### Решение

[`20260513083503_fix_thread_select_returning_after_personal_dialogs.sql`](../../supabase/migrations/20260513083503_fix_thread_select_returning_after_personal_dialogs.sql) — вернул short-circuit `created_by = auth.uid()` ДО вызова функции:

```sql
CREATE POLICY project_threads_select ON public.project_threads FOR SELECT
  USING (
    (created_by = (SELECT auth.uid()))
    OR
    can_user_access_thread(id, (SELECT auth.uid()))
  );
```

BEFORE INSERT триггер `set_thread_created_by` гарантированно ставит `created_by = auth.uid()` для свежей строки, поэтому short-circuit срабатывает без вызова проблемной функции. Для existing-строк семантика прав не меняется.

### Зона поражения

- **Все воркспейсы, все клиенты** с 2026-05-10 17:05 UTC.
- Создание задач/чатов/email-тредов, в т.ч. в массовом порядке из шаблона «Создать проект».
- Webhook'и Telegram/Wazzup/Email **не задевало** — они под service_role, RLS обходится. Поэтому за 3 дня баг не был замечен: ботовая активность шла нормально.

### Профилактика

В [`infrastructure.md`](../../.claude/rules/infrastructure.md) добавлен раздел «⚠️ RLS на `project_threads` — обязательный short-circuit `created_by`» с правильным шаблоном полиции и историей трёх регрессий. Полная защита от 4-й регрессии — переписать функцию на сигнатуру `can_user_access_thread(t project_threads, p_user_id uuid)`, чтобы полиция вызывала `can_user_access_thread(project_threads, …)` и Postgres подставлял NEW.* напрямую без перечитывания. Сейчас не сделано — функцию зовут также `project_messages_*` полиции и потенциальные RPC, миграция тяжёлая. Карточка бага: [`docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md`](../../docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md).

## Сюжет 2: дубли клиентских сообщений между несколькими ботами в одной Telegram-группе

### Симптомы

Клиент Anait написала в Telegram-группу одно сообщение. В треде «Клиенты» проекта «БП - Анаит Дарбинян» это сообщение появилось **тремя одинаковыми копиями подряд** (08:33:01.023, 08:33:01.052, 08:33:01.526). У дублей разные `telegram_message_id` (180 / 324 / 547), одинаковый `telegram_chat_id`, одинаковый `telegram_sender_user_id`, одинаковая `telegram_message_date`, одинаковый текст.

### Корень

Группировка по `telegram_bot_integration_id` показала **per-bot последовательности** id одного и того же чата:

- `relostart102_bot` (employee): 179, 180, 181
- `relostart123_bot` (employee): 320..326
- workspace_bot (null): 546, 547, 548

Диапазоны не пересекаются, монотонно растут внутри каждого бота — у **каждого бота свой локальный счётчик `message_id`** в одной группе. Это особенность Telegram Bot API при нескольких ботах в группе с включённым privacy mode — нестандартное, но воспроизводимое поведение, проверенное на данных.

Существующий `UNIQUE INDEX uq_telegram_message_per_chat (telegram_chat_id, telegram_message_id)` был рассчитан на дедуп **повторных доставок одного webhook'а** (retry от Telegram при HTTP 500). Между ботами он не дедупит — id у них разные.

Echo-гипотеза (триггер `notify_telegram_on_new_message` шлёт обратно) отвергнута: триггер уже содержит `'telegram'` в skip-листе, и timing между копиями (30 мс) короче, чем echo-цикл (~1 сек).

### Альтернативы, которые рассматривал

**A. Фильтр в v1 webhook: employee_bot не записывает сообщения в группах** (как в v2 — там employee_bot отбивается на 401 на стадии auth). Сделал, задеплоил, **откатил**: в БД нашёл 13 чатов со 118 сообщениями, где employee_bot — **единственный** источник входящих (workspace_bot туда не подключён). Фильтр сломал бы их.

**B. Content-based UNIQUE.** Выбрано.

**C. Изменить существующий UNIQUE, убрав message_id.** Отброшено как более рискованное — много кода может зависеть от текущего ключа дедупа.

### Решение

[`20260513090031_project_messages_dedupe_across_bots.sql`](../../supabase/migrations/20260513090031_project_messages_dedupe_across_bots.sql) — новый UNIQUE-индекс:

```sql
CREATE UNIQUE INDEX uq_project_messages_telegram_content_dedup
  ON public.project_messages (
    telegram_chat_id,
    telegram_sender_user_id,
    telegram_message_date,
    md5(COALESCE(content, ''))
  )
  WHERE source = 'telegram'
    AND telegram_chat_id IS NOT NULL
    AND telegram_sender_user_id IS NOT NULL
    AND telegram_message_date IS NOT NULL;
```

Первый бот успевает записать, остальные получают `23505` (unique violation) и помечаются как `outcome='duplicate'` существующим кодом в [`_shared/syncTelegramIncomingMessage.ts`](../../supabase/functions/_shared/syncTelegramIncomingMessage.ts) (там уже была ветка под 23505 для retry-дедупа).

### Cleanup

Подчистил 6 уже накопившихся дублей в треде «Клиенты» проекта «Анаит Дарбинян» — оставил каноничные копии от workspace_bot (`telegram_bot_integration_id IS NULL`), удалил копии от employee-ботов. Зависимостей (attachments / reactions) на удаляемых строках не было.

### Edge case

Если один клиент шлёт абсолютно идентичный текст в одну и ту же секунду через тот же чат — второе сообщение будет дедуплено (потеря). На практике не встречается. Если когда-нибудь понадобится — переключить ключ на `(... , bot_received_at)` с миллисекундной точностью.

### Профилактика

В [`infrastructure.md`](../../.claude/rules/infrastructure.md) добавлен раздел «⚠️ Дедуп между несколькими ботами в одной Telegram-группе» с предупреждением: при добавлении нового типа Telegram-интеграции (`telegram_*_bot`), которая слушает webhook'и групп, не предполагать, что `message_id` уникален на сообщение — это верно только в пределах одного бота. Карточка бага: [`docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md`](../../docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md).

## Сюжет 3: превью треда во «Входящих» показывало моё исходящее вместо непрочитанного клиента

### Симптомы

Тред «Денис (sp-propia)» (личный диалог через MTProto) во вкладке «Входящие» с бейджем непрочитанных `1`. В строке превью — текст «Кирилл: Вторая часть» (моё последнее исходящее, отправленное из Telegram). Непрочитанное от клиента — «Получил» в 17:45 — спрятано внутрь треда. Видно своё сообщение, а кажется, что это причина непрочитанности.

### Корень

В [`get_inbox_threads_v2`](../../supabase/migrations/20260513_inbox_v2_filter_personal_dialogs_by_owner.sql) CTE `last_messages` выбирал последнее сообщение треда **любого автора** (`DISTINCT ON (thread_id) ORDER BY created_at DESC`), и этот текст шёл в `last_message_text`. CTE `last_client_messages` существовал и использовался для `counterpart_name` и аватара — но не для самого превью.

### Решение

[`20260513180321_inbox_v2_preview_unread_from_other.sql`](../../supabase/migrations/20260513180321_inbox_v2_preview_unread_from_other.sql) — переписан `ORDER BY` в `last_messages`:

```sql
ORDER BY
  pm.thread_id,
  (CASE
     WHEN pm.sender_participant_id IS DISTINCT FROM up.participant_id
      AND (mrs.last_read_at IS NULL OR pm.created_at > mrs.last_read_at)
     THEN 0 ELSE 1
   END) ASC,
  pm.created_at DESC
```

Если в треде есть **непрочитанные сообщения от собеседника** — `DISTINCT ON` берёт последнее из них (приоритет 0). Иначе — последнее сообщение треда как раньше (приоритет 1). Остальные CTE/JOIN'ы и сортировка по `last_message_at` не тронуты.

### Проверка

```sql
SELECT thread_id, last_message_text, unread_count
FROM get_inbox_threads_v2('8a946780-…', '8f5fb8ae-…')
WHERE thread_id = '3b0a25cf-…';
-- было: last_message_text = 'Вторая часть' (моё)
-- стало: last_message_text = 'Получил'      (клиент, непрочитанное)
```

## Итог

После деплоя:

- Создание тредов через REST API работает на всех воркспейсах. Задачи из шаблона при «Создать проект» снова появляются вместе с проектом.
- Сообщения клиента в Telegram-группе с несколькими ботами больше не дублируются — первый webhook пишет, остальные мягко дедупятся на уровне БД.
- Превью треда в «Входящих» отражает **причину** непрочитанности — сообщение от собеседника, а не мой последний ответ.

Документация: три карточки бага в [`docs/bugs/resolved/`](../bugs/resolved/), два предупреждения в [`infrastructure.md`](../../.claude/rules/infrastructure.md), правила сохранены в auto-memory Claude.
