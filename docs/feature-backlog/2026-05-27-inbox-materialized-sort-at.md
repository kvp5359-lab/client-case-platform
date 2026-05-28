# Materialized `inbox_sort_at` для O(1) пагинации инбокса

**Статус:** отложено, делать когда воркспейс приблизится к 3-5 тыс. тредов.

## Контекст

В рамках перевода инбокса на keyset-пагинацию (2026-05-27, фазы 1-3) сделано:

- Лёгкий RPC `get_inbox_thread_aggregates` для счётчиков сайдбара и favicon (50 мс, 78 КБ — не зависит от размера инбокса).
- Пагинированный `get_inbox_threads_page` с keyset `(sort_at, thread_id) DESC`, LIMIT 50, payload 42 КБ.
- `manually_unread` треды докладываются поверх лимита (UNION).

Это дало главное ускорение: 790 мс → 180 мс на 800 тредах, **payload перестал расти** с количеством тредов.

Но Postgres-часть **всё ещё растёт линейно** — `get_inbox_threads_page` обёрнут поверх `get_inbox_threads_v2`, который проходит ВСЕ треды через CTE-конвейер. LIMIT применяется только в конце.

| Кол-во тредов | Postgres-time (прогноз) | Сетевая часть |
|---------------|-------------------------|---------------|
| 800 | 127 мс | ~50 мс |
| 5 000 | ~750 мс | ~50 мс |
| 10 000 | ~1500 мс | ~50 мс |

## Решение

Денормализованная колонка `inbox_sort_at` в `project_threads` (тип `timestamptz`, NOT NULL) = `COALESCE(GREATEST(last_message_at, last_event_at), created_at)`.

Поддерживается триггерами:
- `project_messages` AFTER INSERT/UPDATE/DELETE → обновлять `inbox_sort_at` для треда (= MAX created_at сообщений + last_event_at).
- `audit_logs` AFTER INSERT WHERE resource_type IN ('task','thread') → обновлять `inbox_sort_at`.

Индекс: `(workspace_id, inbox_sort_at DESC, id DESC) WHERE is_deleted = false` — partial, под точный порядок keyset.

После этого `get_inbox_threads_page` и `get_inbox_thread_aggregates` смогут использовать **Index Scan** на 50 строк вместо полного CTE-конвейера. Прогноз: ~30-50 мс Postgres независимо от размера воркспейса.

## План реализации

1. Миграция: `ALTER TABLE project_threads ADD COLUMN inbox_sort_at timestamptz`.
2. Backfill: один-разовый UPDATE по существующим тредам.
3. Триггеры на `project_messages` (INSERT/UPDATE/DELETE) и `audit_logs` (INSERT).
4. Partial index.
5. Переписать `get_inbox_threads_page` и `get_inbox_thread_aggregates` — использовать `inbox_sort_at` напрямую без подзапроса.
6. Удалить старую обёртку через `get_inbox_threads_v2` в `get_inbox_threads_page`.
7. Смок-тест мессенджера (карантинная зона — триггеры на `project_messages` критичны).

## Когда

Когда у какого-нибудь воркспейса будет 3 000+ тредов и Postgres-time начнёт ощутимо тормозить. До того — premature optimization.

## Связано

- Миграции: `20260527_inbox_thread_aggregates.sql`, `20260527_inbox_threads_page.sql`, `20260527_inbox_page_orphan_unread.sql`.
- Память: `project_inbox_pagination_plan.md`.
