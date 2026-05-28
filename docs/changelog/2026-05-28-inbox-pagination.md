# Inbox — курсорная пагинация + материализованный sort_at

**Дата:** 2026-05-28
**Тип:** performance + refactoring
**Статус:** completed

---

## Контекст

`get_inbox_threads_v2` загружал ВСЕ активные треды воркспейса одним RPC + считал агрегаты unread/last_message_at на лету. На 800 тредов = 790 мс, на 10 000 (прогноз через 2-3 месяца) = 7-10 сек. UI открытия страницы инбокса блокировался.

Дополнительно: `last_message_at` высчитывался каждый раз из max(`project_messages.created_at`) по треду — O(messages × threads). Sort работал, пока тредов < 1k.

---

## Что сделано

### 1. Материализованная колонка `project_threads.inbox_sort_at`

Миграция `20260527_inbox_materialized_sort_at.sql`. Колонка timestamptz, индекс `(workspace_id, inbox_sort_at DESC, thread_id DESC)`. Триггер `tg_update_inbox_sort_at_from_message` AFTER INSERT/UPDATE на `project_messages` поднимает `inbox_sort_at` треда. Backfill — `MAX(created_at)` из `project_messages` по треду.

⚠️ **Урок:** в этой же сессии случился инцидент — тестовый `INSERT INTO project_messages` для проверки триггера отправил реальное сообщение клиенту в TG (триггер `notify_telegram_on_new_message`). Записано в memory `feedback_no_test_insert_into_project_messages.md`. Триггер на `project_messages` запрещено триггерить тестовыми вставками — только реальный поток.

### 2. Трёхступенчатая модель загрузки

Заменяет один монолитный RPC на лёгкую структуру:

- **`get_inbox_thread_aggregates(workspace_id)`** (миграция `20260527_inbox_thread_aggregates.sql`) — лёгкий хвост: `unread`, `last_message_at` для всех тредов. Считается отдельно от страницы.
- **`get_inbox_threads_page(workspace_id, cursor_sort_at, cursor_thread_id, page_size)`** (миграция `20260527_inbox_threads_page.sql`) — keyset cursor пагинация по `(inbox_sort_at, thread_id)`. Возвращает 50 тредов за вызов.
- **`get_inbox_page_orphan_unread(workspace_id, thread_ids)`** (миграция `20260527_inbox_page_orphan_unread.sql`) — догоняем редкие сироты: треды с непрочитанным, но без message_at (создан, но в нём ещё не было сообщений; такое бывает на свежесозданных).

### 3. Frontend — useInfiniteQuery

[`useInbox.ts`](../../src/hooks/messenger/useInbox.ts) — теперь `useInfiniteQuery` с подкачкой страниц по 50 при достижении скролла. `useFilteredInbox`, `useUnreadCount`, `useLastReadAt`, `UnreadBadge` читают `InboxInfiniteData` (массив страниц).

[`useInboxMarkMutations.ts`](../../src/hooks/messenger/useInboxMarkMutations.ts) — новый общий хук read/unread мутаций (раньше дублировался в `InboxPage` и `BoardInboxList` по ~130 строк). Optimistic update через `patchInboxThreadInCache` + `patchInboxAggregateInCache` для обоих кэшей сразу.

### 4. Затронутые файлы

Миграции: 4 шт. (`20260527_inbox_*`).

Сервис: `src/services/api/inboxService.ts`, `messenger/messengerService.types.ts`.

Хуки: `useInbox.ts`, `useFilteredInbox.ts`, `useUnreadCount.ts`, `useFaviconBadge.ts`, `useNewMessageToast.ts`, `useThreadCounterpartName.ts`, `useWorkspaceMessagesRealtime.ts`, новый `useInboxMarkMutations.ts`.

UI: `InboxPage/index.tsx`, `InboxPage/InboxSidebar.tsx`, `components/boards/BoardInboxList.tsx`, `components/tasks/UnreadBadge.tsx`.

Query keys: `src/hooks/queryKeys/messenger.ts` — добавлены `inboxKeys.aggregates`, новые helpers `patchInboxThreadInCache`, `patchInboxAggregateInCache`.

---

## Что осталось

- Бэклог [`2026-05-27-inbox-materialized-sort-at.md`](../feature-backlog/2026-05-27-inbox-materialized-sort-at.md) — переименовать в done или перенести в этот changelog. Сейчас оба файла, оставляю как есть на исторический случай.
- Через несколько недель — наблюдать `inbox_sort_at` на расхождение с реальными max(created_at) (если триггер где-то проглотит UPDATE).

---

## Затронутые коммиты

- `a4cc00f` — feat(inbox): курсорная пагинация входящих + материализованный sort_at

---

## Связано

- Backlog: [docs/feature-backlog/2026-05-27-inbox-materialized-sort-at.md](../feature-backlog/2026-05-27-inbox-materialized-sort-at.md)
- Memory: `feedback_no_test_insert_into_project_messages.md` (урок инцидента 2026-05-27 — тестовый INSERT в project_messages отправил реальное сообщение клиенту)
