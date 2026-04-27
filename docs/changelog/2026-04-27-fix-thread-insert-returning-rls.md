# Хотфикс: создание тредов сломалось RLS-политикой после миграции 26-04

**Дата:** 2026-04-27
**Тип:** hotfix (production-blocker)
**Статус:** completed (миграция применена в прод)

---

## Контекст

Миграция `20260426210037_thread_access_rls.sql` (вчерашняя, по треду «безопасность RLS на основе access_type»), вводила `can_user_access_thread(thread_id, user_id)` и подключала её в `project_threads_select` как USING-условие для project-level тредов:

```sql
USING (
  ((project_id IS NULL) AND ...)
  OR
  ((project_id IS NOT NULL) AND public.can_user_access_thread(id, (SELECT auth.uid())))
)
```

Функция `can_user_access_thread` начинает с `SELECT id, project_id, ... FROM project_threads WHERE id = p_thread_id; IF NOT FOUND THEN RETURN false`.

**Баг:** PostgREST формирует все клиентские `.insert(...).select()` (а это весь UI создания задач/чатов/email-тредов) как `INSERT INTO project_threads ... RETURNING *`. Postgres требует, чтобы для возвращаемой строки прошла **и** WITH CHECK INSERT-политики, **и** USING SELECT-политики. В одном INSERT-statement только что вставленная строка ещё не видна для SELECT в той же команде → `can_user_access_thread` ловит `NOT FOUND` → возвращает false → SELECT USING не пропускает строку → весь INSERT валится с ошибкой:

```
new row violates row-level security policy for table "project_threads"
```

Симптом для пользователя: 403 Forbidden на `POST /rest/v1/project_threads?select=*`. Все диалоги создания задач/чатов/email — мертвы для всех пользователей с момента применения миграции.

Подтверждено воспроизведением:
- `INSERT … RETURNING *` под ролью `authenticated` с правильным JWT → 42501 RLS violation.
- `INSERT … (без RETURNING)` под той же ролью с тем же JWT → проходит.
- WITH CHECK INSERT-политики сама по себе срабатывает корректно (заменили на `WITH CHECK (true)` — INSERT…RETURNING всё равно падал → виноват SELECT USING).

## Фикс

Миграция `20260427_fix_thread_select_returning.sql`. Добавляем в `project_threads_select` short-circuit `created_by = auth.uid()` **до** вызова `can_user_access_thread`:

```sql
USING (
  ((project_id IS NULL) AND ...)
  OR
  (created_by = (SELECT auth.uid()))   -- ← новый short-circuit
  OR
  ((project_id IS NOT NULL) AND public.can_user_access_thread(id, ...))
)
```

BEFORE INSERT триггер `set_thread_created_by` всегда выставляет `created_by = auth.uid()` для свежевставленной строки. Поэтому при INSERT…RETURNING проверка `created_by = auth.uid()` срабатывает на NEW-строку **без** обращения к `project_threads` через функцию — обходим проблему с видимостью.

Для обычных SELECT existing-строк, у которых `created_by` не равен текущему юзеру, политика по-прежнему дотягивается до `can_user_access_thread` — поведение прав доступа не меняется.

## Файлы

- `supabase/migrations/20260427_fix_thread_select_returning.sql` — новая миграция.

Применена на прод напрямую через Supabase MCP (`apply_migration`). Деплоя фронтенда не требуется — изменение чисто DB-уровня.

## Уроки

`SELECT USING` политики, которые читают **ту же таблицу**, в которую идёт INSERT, ломают `INSERT…RETURNING`. Если будущие политики потребуют сложной проверки доступа через функцию, читающую `project_threads`, — нужно либо:
- держать short-circuit `created_by = auth.uid()` (как сейчас);
- передавать в функцию все нужные поля строки, а не выбирать их по `id`;
- избегать вызова таких функций в SELECT USING для таблиц, которые активно INSERT'ятся клиентами.

Тестировать миграции с RLS — обязательно прогонять полный сценарий `.insert(...).select()` от имени обычного пользователя, не только чистый INSERT.
