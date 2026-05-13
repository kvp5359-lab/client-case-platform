---
id: 2026-05-13-thread-insert-returning-rls
title: INSERT INTO project_threads ... RETURNING * падает с 42501 «new row violates RLS» (3-я регрессия)
status: resolved
severity: critical
area: rls, project_threads, can_user_access_thread
first-seen: 2026-05-10
last-investigated: 2026-05-13
resolved: 2026-05-13
resolution: восстановить short-circuit `created_by = auth.uid()` в полиции project_threads_select
reproduced: yes
---

## Решение (2026-05-13)

Миграция `20260513083503_fix_thread_select_returning_after_personal_dialogs.sql` — добавляет в `project_threads_select` short-circuit `created_by = (SELECT auth.uid())`. BEFORE INSERT триггер `set_thread_created_by` всегда выставляет created_by = auth.uid() для свежей строки, поэтому RETURNING-фаза проходит без вызова проблемной функции. Для existing-строк правила прав не меняются.

## Симптомы

Любая попытка создать тред с фронта (задача, чат, email-тред) валится с 403 от Supabase. В консоли:

```
POST https://...supabase.co/rest/v1/project_threads?select=* 403 (Forbidden)
```

В логах postgres:

```
ERROR: new row violates row-level security policy for table "project_threads"
```

При этом:
- Сам пользователь — Владелец воркспейса, все права есть.
- Создание задач из шаблона при «Создать проект» — задачи не появляются (та же ошибка).
- Webhook'и Telegram/Wazzup/Email **создают** треды нормально (они работают под service_role, RLS не применяется).

## Как воспроизвести

1. Залогиниться любым пользователем с правом создавать треды в воркспейсе.
2. Открыть проект → кнопка «+ Создать» → выбрать «Задача» или «Чат» → ввести имя → «Создать».
3. Запрос `POST /rest/v1/project_threads?select=*` валится с 403.

Или прямо SQL:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
INSERT INTO project_threads (project_id, workspace_id, type, name)
VALUES ('<project_id>', '<workspace_id>', 'task', '__test__')
RETURNING id;  -- 42501
ROLLBACK;
```

Без `RETURNING` — INSERT проходит. С `RETURNING` (или PostgREST'овский `?select=*`) — падает.

## Корень бага

Миграция `20260510_personal_dialogs_rls.sql` переписала полицию `project_threads_select`:

```sql
USING (can_user_access_thread(id, (SELECT auth.uid())))
```

Функция `can_user_access_thread(uuid, uuid)` определена как `SECURITY DEFINER STABLE` и **перечитывает** тред из таблицы:

```sql
SELECT id, project_id, ... INTO v_thread
FROM project_threads WHERE id = p_thread_id;
IF NOT FOUND THEN RETURN false;
```

В контексте `INSERT...RETURNING` Postgres применяет SELECT-полицию к NEW-строке. Внутри SECURITY DEFINER функции свежевставленная строка ещё не видна snapshot'у → `NOT FOUND` → RETURN false → RLS отбивает INSERT с тем же 42501.

PostgREST по умолчанию добавляет `Prefer: return=representation` к insert, что транслируется в `INSERT...RETURNING *`. Поэтому **любой** `.insert(...).select()` с фронта валится.

## Это уже третья регрессия одного и того же бага

| Миграция | Что сделала | Что сломала |
|---|---|---|
| `20260404191200_fix_thread_select_policy_inline.sql` | Первый фикс | — |
| `20260426_thread_access_rls.sql` | Переписала полицию, выкинула short-circuit | Сломала INSERT...RETURNING |
| `20260427_fix_thread_select_returning.sql` | Восстановила short-circuit `created_by = auth.uid()` | — |
| `20260510_personal_dialogs_rls.sql` | Снова переписала полицию (для личных диалогов), выкинула short-circuit | **Сломала снова** |
| `20260513083503_fix_thread_select_returning_after_personal_dialogs.sql` | Восстановила short-circuit | — |

В `.claude/rules/infrastructure.md` добавлено правило, чтобы будущие миграции не теряли short-circuit.

## Расследование

1. Логи postgres — `new row violates row-level security policy for table "project_threads"`. Это **RLS**, а не impersonation-триггер (который кидает SQLSTATE 42501 с другим текстом).
2. Симуляция под `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = ...`:
   - INSERT без RETURNING → проходит.
   - INSERT с RETURNING → 42501.
3. Подмена `can_user_access_thread` на тривиальную `SELECT true` → RETURNING проходит. Значит, виновата именно функция.
4. Inструментованная версия функции, пишущая аргументы и состояние в `_diag_inside` таблицу, показала: при вызове из SELECT-полиции на RETURNING-строке функция получает корректный `p_thread_id` и `p_user_id`, но `SELECT ... FROM project_threads WHERE id = p_thread_id` **не находит свежевставленную строку**.

## Зона поражения

- **Все воркспейсы, все клиенты**, начиная с 2026-05-10 17:05 UTC (когда миграция применилась).
- **Все** инсёрты тредов через REST API с `.select()` или `.single()` после insert: задачи, чаты, email-треды.
- Создание задач из шаблона при создании проекта (если фронт делает batch-insert с RETURNING).
- За 3 дня баг не замечался, потому что webhook'и Telegram/Wazzup/Email писали треды под service_role и обходили RLS — 46 тредов создались через ботов как обычно.

## Профилактика

В `.claude/rules/infrastructure.md` в разделе про RLS на `project_threads` добавлено:

> При изменении `project_threads_select` (или любой полиции через `can_user_access_thread(id, …)`) **обязательно** оставлять short-circuit `created_by = auth.uid()` в самой полиции — иначе INSERT...RETURNING упадёт с 42501 (PostgREST по дефолту шлёт `Prefer: return=representation`).
