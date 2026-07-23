# Перф доски/мессенджера (замеры на проде) + фикс потери серверных черновиков

**Дата:** 2026-07-23
**Тип:** bugfix + perf + docs
**Статус:** completed (задеплоено; смок карантинных частей — за владельцем)

---

## Контекст

Жалоба владельца: «на доске переключение между чатами очень сильно подвисает,
хотя компьютер мощный и интернет хороший» (прод, /boards/1). Вместо гаданий —
живой замер в реальном браузере: `cc_perf_trace`, PerformanceObserver(longtask),
перехват форм запросов, resource timings. Полные замеры и 12 находок код-аудита —
[`docs/audit/2026-07-23-board-performance-audit.md`](../audit/2026-07-23-board-performance-audit.md),
журнал — messenger-ledger записи (5)–(7).

Главные виновники: **шторм ~100 параллельных запросов** на каждый маунт доски
(исполнители + времена для ~2000 тредов списка «Календарь», чанками по 40),
**полная перерисовка доски каждые ~1.5с** при входящих (сломанные memo), и
холодное открытие чата 0.5–2.4с (последовательный второй запрос цитат + рендер).
Побочно замер вскрыл **потерю данных**: открытие треда на устройстве без
локального черновика удаляло серверный черновик через 2с без единого нажатия.

## Что сделано (5 блоков, коммиты 9d2ecb58…333183eb)

1. **Каскад ре-рендеров доски убран** — `React.memo` на
   [`BoardColumn`](../../src/components/boards/BoardColumn.tsx)/[`BoardListCard`](../../src/components/boards/BoardListCard.tsx),
   стабильные хендлеры/дефолты в
   [`BoardTabContent`](../../src/page-components/BoardsPage/BoardTabContent.tsx)/[`BoardView`](../../src/components/boards/BoardView.tsx),
   `inboxThreads` только inbox-спискам, мемо-строка в
   [`BoardInboxList`](../../src/components/boards/BoardInboxList.tsx), inbox-подписка
   изолирована в null-компонент, `useThreadCounterpartNameMap` отдаёт стабильную
   ссылку карты (модульный стор со снапшот-кэшем).
2. **Шторм запросов → 2 запроса** — новые RPC `get_task_assignees_for_threads` /
   `get_thread_times_for_threads` (SECURITY INVOKER, миграция
   [`20260723120000_board_thread_meta_rpcs.sql`](../../supabase/migrations/20260723120000_board_thread_meta_rpcs.sql));
   [`useTaskAssigneesMap`](../../src/components/tasks/useTaskAssignees.ts) и
   [`useBoardListTimes`](../../src/components/boards/calendar/useBoardListTimes.ts)
   переведены с ~50+50 GET-чанков на один POST каждая.
3. **Черновики: фикс потери** — armed-гейт в
   [`useDraftMessage`](../../src/components/messenger/hooks/useDraftMessage.ts):
   пустое серверное сохранение (= DELETE строки) разрешено только после реального
   непустого ввода в треде. Механизм подтверждён живым воспроизведением (tiptap v3
   эмитит update на programmatic clearContent). Багдок:
   [`2026-07-23-thread-draft-server-wipe-on-second-device.md`](../bugs/open/2026-07-23-thread-draft-server-wipe-on-second-device.md).
4. **Открытие чата (карантин, точечно)** — цитаты приезжают тем же запросом
   (self-join embed `reply_to_message:reply_to_message_id(...)` в `MESSAGE_SELECT`,
   `hydrateReplyMessages` удалена); markRead больше не рефетчит полный
   `get_inbox_unread_threads` — тред уходит из вкладок «Непрочитанные»/«Заглушённые»
   локальным патчем (`patchCachesForMarkRead` + новый `invalidateAfterThreadRead`).
5. **Запас на рост** — события календаря режутся по видимому окну вида до передачи
   в react-big-calendar; ключи кэша больших списков id хешируются
   ([`src/lib/hashIdList.ts`](../../src/lib/hashIdList.ts)) вместо строк ~74 КБ.

## Миграции / Edge Functions

- Миграция `20260723120000_board_thread_meta_rpcs.sql` — применена в прод через MCP
  (гранты authenticated+service_role, anon отозван; функции проверены живым вызовом).
- Edge Functions не трогались. Фронт — обычный blue/green деплой.
- ⚠️ `schema-manifest.json` не обновлён (нет service-ключа локально) —
  `db-drift-check --update` при случае.

## Известные ограничения

- Смок карантинных частей (цитаты/markRead/черновики) — за владельцем, чеклист в
  ledger записях (6)–(7).
- Отложено осознанно: виртуализация коротких списков доски, серверный cap
  календарного списка (меняет состав данных — нужно продуктовое решение),
  flaky-restore черновика (после фикса безопасен, но изредка не подставляется).
- Во время замера ДО фикса мои открытия тредов удалили серверные черновики
  владельца (текст жив локально на его устройстве; файл-черновик надо прикрепить
  заново).
