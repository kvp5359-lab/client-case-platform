# Постоянный фикс `can_user_access_thread` — устранение costyl'я `created_by`

**Статус:** план готов, миграция БД не применена (ждёт твоего «да»).
**Дата:** 2026-05-24.
**Контекст багу:** `docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md`.

## Краткая суть

Сейчас полиция `project_threads_select` обязана содержать short-circuit
`created_by = (SELECT auth.uid())` до вызова функции
`can_user_access_thread`. Без него ломается **любое** создание треда
через REST API. Баг ловили **5 раз** при последовательных рефакторингах RLS.

Идея фикса — переделать функцию так, чтобы она работала с уже
существующей строкой (`NEW`), не перечитывая БД.

## Как сделать

### Шаг 1. Новая сигнатура функции

Добавить overload (или переписать):

```sql
CREATE OR REPLACE FUNCTION public.can_user_access_thread(
  t project_threads,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Все проверки против полей t.*, БЕЗ повторного чтения project_threads.
  -- Логика та же, что в старой версии — переносим, но t. вместо SELECT.

  -- 1) Сам создатель видит всегда (бывший short-circuit).
  IF t.created_by = p_user_id THEN
    RETURN true;
  END IF;

  -- 2) Владелец проекта.
  IF EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = t.project_id
      AND p.created_by = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- 3) Доступ через access_type / roles / custom — как в старой версии,
  -- но подставляя t.* вместо SELECT'а.
  -- ... (скопировать тело старой can_user_access_thread, заменив
  --      перечитывание на использование полей t.*)
END;
$$;
```

### Шаг 2. Обновить политику

```sql
DROP POLICY IF EXISTS project_threads_select ON public.project_threads;

CREATE POLICY project_threads_select ON public.project_threads FOR SELECT TO public
USING (
  -- Передаём project_threads-строку (Postgres подставит NEW.* для RETURNING).
  -- Short-circuit `created_by = auth.uid()` больше не нужен — функция
  -- получает t.* напрямую и работает с свежей строкой без перечитывания.
  can_user_access_thread(project_threads, (SELECT auth.uid()))
);
```

### Шаг 3. Удалить старую сигнатуру (или оставить deprecated)

Если в коде/триггерах есть вызовы `can_user_access_thread(thread_id, user_id)`,
старую сигнатуру оставить с пометкой `@deprecated` и редиректом на
новую через `SELECT can_user_access_thread(t, p_user_id) FROM project_threads t WHERE t.id = thread_id`.

Если нигде — удалить.

### Шаг 4. Тест

```sql
-- Под role authenticated, под обычным пользователем:
INSERT INTO project_threads (...)
RETURNING *;
-- Должен пройти. До фикса падал с 42501.
```

И ручной тест через приложение — создать тред (задачу/чат) в браузере.

## Что это даёт

- Костыль `created_by = auth.uid()` в полиции больше не нужен.
- При следующем рефакторинге RLS никто не сможет случайно сломать
  создание тредов — функция сама терпима.
- Меньше путаницы для нового разработчика (полиция — одна строка).

## Что нужно от владельца проекта

1. **Подтвердить, что миграцию можно применить.** Это правка БД на
   проде (либо через `supabase db push` миграцию, либо apply через MCP).
2. **Запасной план**: если что-то пойдёт не так — миграция откатывается
   простым `DROP POLICY` + `CREATE POLICY` со старой версией. Все шаги
   обратимы.
3. **После применения** — прогон: создать новую задачу через UI.
   Если падает — откат.

## Связанные миграции (история)

- `20260404191200_fix_thread_select_policy_inline.sql` — первый фикс
- `20260426_thread_access_rls.sql` — переписала без short-circuit → сломалось
- `20260427_fix_thread_select_returning.sql` — восстановила
- `20260510_personal_dialogs_rls.sql` — снова переписала → сломалось
- `20260513083503_fix_thread_select_returning_after_personal_dialogs.sql` — восстановила

Этот фикс должен закрыть цикл.
