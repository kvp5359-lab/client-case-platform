# Точечные TODO из кодовой базы

Записаны для архива — чтобы пометки не лежали в коде «без контекста».

## TODO(low) — скачивание архива документов набора

**Файл:** `src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetupConfigs.ts:54`

В UI есть кнопка «Скачать архив», в handler стоит пустой стаб с TODO.

Что нужно:
1. Endpoint (Edge Function или server-side action), который собирает все
   документы набора в zip и отдаёт как Blob.
2. На фронте — обработчик `onDownloadArchive` вызывает endpoint, получает
   Blob, скачивает через `downloadBlob`.
3. Имя файла: `<kit_name>.zip`.

Связано с уже существующим `services/documents/downloadDocumentsAsZip.ts` —
возможно, переиспользовать.

## TODO(low) — RPC для upsert task_panel_tabs

**Файл:** `src/services/taskPanelTabsService.ts` (`upsertTaskPanelTabs`)

Сейчас вставка/обновление строки `task_panel_tabs` — это ручной SELECT id
по scope → UPDATE по id либо INSERT. Костыль вокруг partial unique
индексов — PostgREST `.upsert({ onConflict })` с partial unique отдаёт
42P10 (см. `.claude/rules/gotchas.md` — раздел про task_panel_tabs upsert).

Что нужно:
1. RPC `upsert_task_panel_tabs(p_user_id, p_scope_kind, p_scope_id, p_tabs jsonb, p_active_tab_id text)`
   с `INSERT ... ON CONFLICT (cols) WHERE ... DO UPDATE` под каждый partial unique.
2. Заменить `upsertTaskPanelTabs` на один `supabase.rpc(...)`.
3. Альтернатива — переделать индексы на обычные (без `WHERE`) с CHECK
   на остальные scope-колонки = NULL.

Не критично — текущая реализация работает, просто 2 запроса вместо 1.

## TODO — серверный RPC для подсчёта комментариев

**Файл:** `src/services/api/commentService.ts:146`

Сейчас подсчёт comments_count для списка тредов идёт через клиентский
JOIN. При большом количестве комментариев это даёт лишний трафик.

Что нужно:
1. RPC `get_comment_counts(entity_type text, entity_ids uuid[])` →
   возвращает `(entity_id, count)`.
2. Заменить клиентский подсчёт на RPC.

Не критично — текущая реализация работает на нынешних объёмах.
