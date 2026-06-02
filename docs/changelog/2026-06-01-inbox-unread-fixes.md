# Входящие: подвисание «Загружаем ещё» и ложные красные «непрочитанные» баблы

**Дата:** 2026-06-01
**Тип:** fix
**Статус:** completed

Две регрессии, обе — следствие майского перехода инбокса на keyset-пагинацию
(`get_inbox_threads_page`, `useInboxThreadsV2` стал отдавать только загруженные
страницы вместо полного списка). Раньше код полагался на то, что inbox v2
содержит ВСЕ треды.

---

## 1. Подвисание «Загружаем ещё…» на вкладке «Непрочитанные» (3-4 сек)

**Было:** при открытии доски/страницы «Входящие» строка «Загружаем ещё…» висела
3-4 секунды, хотя сами диалоги появлялись мгновенно.

**Причина:** фильтр «Непрочитанные» применялся на клиенте поверх серверной
keyset-пагинации. Непрочитанные (единицы) разбросаны по всему списку (у тестового
воркспейса — 899 тредов, из них ~8 непрочитанных, самый старый на позиции ~32+).
Короткий после фильтра список держал «маячок» догрузки в зоне видимости →
бесконечный скролл прокачивал инбокс страницами по 50, последовательно (~18
запросов × ~150 мс), пока не кончится `hasNextPage`. Всё это время висел индикатор.

**Стало:** вкладка «Непрочитанные» работает на отдельном полном списке
непрочитанных — один запрос без пагинации, без каскада догрузки.

- Миграция
  [`20260601_inbox_unread_threads.sql`](../../supabase/migrations/20260601_inbox_unread_threads.sql)
  (новая, **применена в проде**): RPC `get_inbox_unread_threads(ws, user)` —
  обёртка над `get_inbox_threads_v2` с фильтром непрочитанного (потолок 100).
  Переиспользует всю логику v2 (доступ, личные диалоги по `owner_user_id`,
  превью) — расхождений с инбоксом нет. Фильтр непрочитанного совпадает с
  клиентским `isUnread()` и счётчиком из `get_inbox_thread_aggregates`.
- [`inboxService.ts`](../../src/services/api/inboxService.ts): `getInboxUnreadThreads`.
- [`queryKeys/messenger.ts`](../../src/hooks/queryKeys/messenger.ts): ключ
  `inboxKeys.unread` + добавлен в `invalidateMessengerCaches`.
- [`useFilteredInbox.ts`](../../src/hooks/messenger/useFilteredInbox.ts): хук
  `useFilteredInboxUnread` (тот же access-фильтр, что и основной список).
- [`useInboxFilters.ts`](../../src/page-components/InboxPage/useInboxFilters.ts):
  источник вкладки «Непрочитанные» = полный список непрочитанных; счётчик из
  него; снимок-залипание прочитанных сохранено (хранит сами записи, т.к.
  прочитанный тред выпадает из источника).
- [`InboxPage/index.tsx`](../../src/page-components/InboxPage/index.tsx) и
  [`BoardInboxList.tsx`](../../src/components/boards/BoardInboxList.tsx): догрузка
  страниц — только на вкладке «Все». На «Непрочитанных» пагинация отключена.

## 2. Ложные красные «непрочитанные» баблы в открытом треде

**Было:** в треде, открытом из проекта/доски, сообщения собеседника помечались
красной полосой как непрочитанные, хотя были прочитаны (на сервере `unread_count
= 0`, `last_read_at` позже всех сообщений). Где-то покраснели все чужие баблы,
где-то — часть (зависело от того, что застряло в кэше).

**Причина:** `useLastReadAt` брал границу `last_read_at` из `useInboxThreadsV2`
(пагинированный список — только загруженные страницы). Для треда за их пределами
(в тесте — позиция 162) `find` возвращал `undefined` → `last_read_at = null`.
`MessageList` трактует `null` как «тред никогда не открывали» → красит все чужие
сообщения.

**Стало:** для открытого треда `last_read_at` берётся точечно по `thread_id`, не
завися от того, попал ли тред в пагинированный список.

- Миграция
  [`20260601_inbox_thread_one.sql`](../../supabase/migrations/20260601_inbox_thread_one.sql)
  (новая, **применена в проде**): RPC `get_inbox_thread_one(ws, user, thread_id)`
  — обёртка над `get_inbox_threads_v2` по одному треду (та же логика
  `last_read_at`/`unread`).
- [`inboxService.ts`](../../src/services/api/inboxService.ts): `getInboxThreadOne`.
- [`useUnreadCount.ts`](../../src/hooks/messenger/useUnreadCount.ts): `useLastReadAt`
  переведён на точечный запрос на ключе `messengerKeys.lastReadAtByThreadId` —
  его уже патчат все mark-read мутации (`patchCachesForMarkRead`,
  `useNewMessageToast`, `useDelayedSend`, `useDraftMessages`,
  `useMarkThreadReadIfFinal`), поэтому контур исчезает мгновенно при
  прочтении/отправке. `useUnreadCount` оставлен на inbox-кэше (fallback `0`
  безопасен — видимого бага не даёт).

## Затронутые файлы

- `supabase/migrations/20260601_inbox_unread_threads.sql` (новый)
- `supabase/migrations/20260601_inbox_thread_one.sql` (новый)
- `src/services/api/inboxService.ts`
- `src/services/api/inboxService.test.ts`
- `src/hooks/queryKeys/messenger.ts`
- `src/hooks/messenger/useFilteredInbox.ts`
- `src/hooks/messenger/useUnreadCount.ts`
- `src/page-components/InboxPage/index.tsx`
- `src/page-components/InboxPage/useInboxFilters.ts`
- `src/page-components/InboxPage/useInboxFilters.test.ts` (новый)
- `src/components/boards/BoardInboxList.tsx`

## Не тронуто

Keyset-RPC `get_inbox_threads_page`, триггеры, `get_inbox_threads_v2`,
access-логика, `MessageList`, вкладка «Все».

## Проверки

- `npx tsc --noEmit && npm run lint && npm test` — зелёные (tsc 0, lint 0,
  671 тест, из них 9 новых).
- Обе миграции применены в проде; RPC проверены на реальных тредах.

## На будущее (не срочно)

`get_inbox_unread_threads` и `get_inbox_thread_one` — обёртки над
`get_inbox_threads_v2`, который сканит весь инбокс (~150 мс независимо от числа
непрочитанных / для одного треда). На больших объёмах стоит переписать на прямой
доступ. Связано с уже зафиксированным: материализованная колонка
`project_threads.inbox_sort_at` + триггеры сейчас не читаются `get_inbox_threads_page`.
