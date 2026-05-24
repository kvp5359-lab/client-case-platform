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

## TODO — серверный RPC для подсчёта комментариев

**Файл:** `src/services/api/commentService.ts:146`

Сейчас подсчёт comments_count для списка тредов идёт через клиентский
JOIN. При большом количестве комментариев это даёт лишний трафик.

Что нужно:
1. RPC `get_comment_counts(entity_type text, entity_ids uuid[])` →
   возвращает `(entity_id, count)`.
2. Заменить клиентский подсчёт на RPC.

Не критично — текущая реализация работает на нынешних объёмах.
