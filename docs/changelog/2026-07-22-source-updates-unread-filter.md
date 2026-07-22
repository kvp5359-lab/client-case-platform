# «Обновления источников»: по умолчанию только непрочитанные

## Что сделано
Лента «Обновления источников» теперь по умолчанию показывает только
непрочитанные файлы. Прочитанные включаются кнопкой «Показать прочитанные»
(глазик в шапке); если непрочитанного нет — заглушка «Все обновления
прочитаны» с той же кнопкой.

## Как считается «непрочитанное»
Прочитанность в этой фиче — по проекту (`source_update_reads.last_seen_at`
на пользователя), «новый файл» = `source_documents.created_at` позже отметки
(или epoch фичи, если проект ни разу не читали). Клиентский фильтр — точное
зеркало серверной формулы RPC `get_source_update_unread_projects`; менять
синхронно (комментарии в обоих местах).

Для этого:
- в ленту (`WorkspaceSourceUpdate`) добавлено поле `createdAtDb`
  (`created_at` строки БД — Drive-даты для прочитанности не годятся,
  сервер считает по created_at);
- новый сервис `getMySourceReadMarks` (свои строки `source_update_reads` +
  `epoch_at` из `source_updates_config`, обе таблицы уже читаемы по RLS) +
  хук `useSourceReadMarks`;
- ключ `googleDriveKeys.sourceUpdateReadMarks()` живёт ПОД префиксом
  `sourceUpdatesUnreadAll` — мутации «Прочитать»/«Прочитать всё» сбрасывают
  его без правок.

Нажатие «Прочитать» у проекта в дефолтном режиме убирает его файлы из ленты —
ожидаемо (они стали прочитанными).

БД не менялась.

## Файлы
- `src/page-components/SourceUpdatesPage/index.tsx`
- `src/services/documents/sourceDocumentService.ts`
- `src/hooks/documents/useSourceDocumentsQuery.ts`
- `src/hooks/queryKeys/misc.ts`
