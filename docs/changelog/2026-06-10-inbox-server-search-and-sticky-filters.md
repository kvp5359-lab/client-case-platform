# Входящие: серверный поиск по всем тредам + липкая панель фильтров

**Дата:** 2026-06-10
**Тип:** fix + feature
**Статус:** completed

---

## 1. Серверный поиск по тредам входящих

**Было:** поиск в списке «Входящие» фильтровал только уже загруженные страницы
(keyset-пагинация, первая страница = 50). Тред дальше 50-й позиции не находился.
Раньше это маскировалось каскадной догрузкой всего инбокса; после её отключения
(фикс подвисания «Загружаем ещё») баг обнажился.

**Стало:** поиск идёт на сервере по ВСЕМ тредам инбокса (по названию треда и
имени проекта), а не по загруженным в браузер. Поиск по тексту сообщений
намеренно не включён — только по названию/проекту.

- Миграция
  [`20260610_inbox_search_threads.sql`](../../supabase/migrations/20260610_inbox_search_threads.sql)
  (новая, **применена в проде**): RPC `get_inbox_search_threads(ws, user, query, limit)`
  — обёртка над `get_inbox_threads_v2` с фильтром `thread_name/project_name ILIKE`.
  Спецсимволы LIKE (`% _ \`) экранируются. Возвращает те же поля `InboxThreadEntry`.
- [`inboxService.ts`](../../src/services/api/inboxService.ts): `getInboxSearchThreads`.
- [`queryKeys/messenger.ts`](../../src/hooks/queryKeys/messenger.ts): ключ `inboxKeys.search`.
- [`useFilteredInbox.ts`](../../src/hooks/messenger/useFilteredInbox.ts): хук
  `useFilteredInboxSearch` (тот же access-фильтр; запрос только при непустом query).
- [`BoardInboxList.tsx`](../../src/components/boards/BoardInboxList.tsx) и
  [`InboxPage/index.tsx`](../../src/page-components/InboxPage/index.tsx): при активном
  поиске список берётся из серверного хука (debounce 300 мс), пагинация отключена.

## 2. Липкая панель фильтров/поиска при прокрутке

**Было:** на доске панель «Непрочитанные / Все» + поиск уезжала вверх вместе со
списком при прокрутке.

**Стало:** панель прилипает к верху колонки (`sticky top-0`) — фильтры и поиск
всегда под рукой.

- [`BoardInboxList.tsx`](../../src/components/boards/BoardInboxList.tsx): filter bar —
  `sticky top-0 z-10 bg-white`. (На странице `/inbox` шапка уже зафиксирована
  `shrink-0` — не трогалось.)

## Затронутые файлы

- `supabase/migrations/20260610_inbox_search_threads.sql` (новый)
- `src/services/api/inboxService.ts`
- `src/hooks/queryKeys/messenger.ts`
- `src/hooks/messenger/useFilteredInbox.ts`
- `src/components/boards/BoardInboxList.tsx`
- `src/page-components/InboxPage/index.tsx`

## Проверки

- `npx tsc --noEmit && npm run lint && npm test` — зелёные (tsc 0, lint 0, 677 тестов).
- RPC применён в проде, проверен на реальных запросах.
