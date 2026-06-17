# Пересылка MTProto-вложений (file_id = NULL)

**Дата:** 2026-06-17
**Тип:** bugfix
**Статус:** completed (фронт-only)

---

## Что было

При пересылке через «буфер пересылки» вложения из личных MTProto-диалогов
**молча выпадали** — не доходили получателю.

### Корень

`toForwardedAttachments` фильтровал вложения строго по `file_id`
(`.filter((a) => a.file_id)`). У MTProto-вложений `file_id` всегда `NULL`
(они хранятся только по `storage_path`), поэтому фильтр их выбрасывал.

## Что стало

- Фильтр расширен: берём вложения, у которых есть `file_id` **либо**
  `storage_path` (`.filter((a) => a.file_id || a.storage_path)`).
- Тип `ForwardedAttachment.file_id` ослаблен до `string | null`.

Send-функции каналов резолвят файл по `file_id` (через таблицу `files`), а
при его отсутствии — напрямую по `storage_path`, без перезаливки в Storage.

## Файлы

- `src/utils/messenger/forwardContent.ts`
- `src/services/api/messenger/messengerService.types.ts`

## Заметка

Карантинная зона (мессенджер). Живой смок-тест пересылки MTProto-файла
получателю — не проводился.
