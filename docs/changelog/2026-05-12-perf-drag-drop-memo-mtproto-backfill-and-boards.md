# Перформанс drag-drop из источника, мемоизация чата, MTProto-бэкфилл, доски и оптимистик в read-tracking

**Дата:** 2026-05-12
**Тип:** perf + feat
**Статус:** completed

---

## Контекст

Накопилось два независимых блока:

1. **Перформанс** — у коллеги на Windows при перетаскивании файлов из
   панели «Источник» (Google Drive) в папки проекта появлялся диалог
   Chrome «Страница не отвечает». При разборе нашёл двойную инвалидацию
   queryClient после одной операции, последовательный batch и убитую
   мемоизацию `MessageBubble` (inline-арроу в пропе).
2. **Фичи прошлых сессий** (MTProto backfill, расширение досок, read-tracking)
   были готовы локально, но не закоммичены. Решено собрать в один деплой.

## Решение

### 1. Drag-drop из источника — убрать каскад инвалидаций и параллелить batch

Цепочка `useSourceDocumentDrop → uploadSourceDocument` после одного drop'а
вызывала `fetchDocumentKits` + `loadSourceDocuments` внутри `uploadSourceDocument`,
а затем ещё раз `invalidateDocumentKits()` в обёртке — двойная перезагрузка
тяжёлого списка наборов документов.

Batch перенос (`useBatchMoveOperations`) шёл строго последовательно
(`for...of await`) и в каждой итерации триггерил `fetchDocumentKits`
изнутри `uploadSourceDocument`. На 5 файлов — 6 полных перезагрузок UI
плюс полная сериализация скачивания.

- В [useSourceDocumentUpload.ts:230](../../src/components/projects/DocumentKitsTab/hooks/useSourceDocumentUpload.ts:230)
  добавлен флаг `skipRefresh` — пятый позиционный параметр,
  чтобы вызывающий код мог сам решать, нужна ли инвалидация.
- В [useBatchMoveOperations.ts:98](../../src/components/projects/DocumentKitsTab/hooks/useBatchMoveOperations.ts:98)
  цикл заменён на пачки по 3 файла через `Promise.all` с
  `skipRefresh=true`; финальный `fetchDocumentKits` уже был после цикла
  и стал единственным.
- В [useSourceDocumentDrop.ts:99](../../src/page-components/ProjectPage/components/Documents/hooks/useSourceDocumentDrop.ts:99)
  убрана избыточная `invalidateDocumentKits()` — её зовёт сам
  `uploadSourceDocument`. Внешний вызов оставлен только в ветке, где
  делался `reorderDocuments` (там действительно нужно перечитать порядок).
- Сигнатура в `documentKitHandlerTypes.ts` синхронизирована.

### 2. Мемоизация `MessageBubble` — починить пропс

`MessageBubble` уже был обёрнут в `memo`, но в `MessageList.tsx:492`
сидел inline-арроу:
`onCancelDelayed={onCancelDelayed ? () => onCancelDelayed(msg.id) : undefined}`.
На каждом рендере MessageList создавалась новая функция для каждого
из ~200 бабблов, и memo обнулялся.

Любопытно: в `MessengerContext.tsx:53` контракт был именно
`(messageId: string) => void` — то есть inline-арроу в MessageList был
просто лишний костыль, который ломал мемоизацию.

- В [MessageBubble.tsx:45](../../src/components/messenger/MessageBubble.tsx:45)
  сигнатура `onCancelDelayed` изменена на `(messageId: string) => void`.
- В [MessageBubble.tsx:466](../../src/components/messenger/MessageBubble.tsx:466)
  внутри баббла сам передаёт `message.id` в `SendCountdown`.
- В [MessageList.tsx:492](../../src/components/messenger/MessageList.tsx:492)
  пропс пробрасывается как есть. Функция стабильна через `MessengerContext`,
  и теперь memo действительно режет ре-рендеры при поступлении нового
  сообщения, клике по реакции и mark-as-read.

### 3. MTProto backfill истории — кнопка «Загрузить ещё 50 из Telegram»

Реализовано в прошлой сессии, оформлено сейчас. Когда сотрудник
долистал MTProto-тред до самого старого сообщения в БД, в `MessageList`
показывается кнопка. Цепочка: фронт → edge function
`telegram-mtproto-backfill` (проверка JWT + членство в воркспейсе) →
`mtproto-service POST /messages/backfill` → `gramjs messages.GetHistory`
с `offset_id = min(telegram_message_id треда)` и `limit=50` → каждое
сообщение через общий хелпер `ingestMtprotoMessage` (вынесен из
`handleNewMessage`).

- Новое: `supabase/functions/telegram-mtproto-backfill/index.ts`.
- Новое: `src/hooks/messenger/useBackfillTelegramHistory.ts` —
  `useIsMtprotoThread`, `useBackfillTelegramHistory`.
- В `mtproto-service/src/routes/commands.ts` добавлен
  `POST /messages/backfill` с per-session throttle 2 сек
  (`backfillLastCall`). FLOOD_WAIT → 429 с `Retry-After`.
- В `mtproto-service/src/handlers/incoming.ts` `handleNewMessage` распилен:
  логика инсёрта в БД и скачивания медиа вынесена в `ingestMtprotoMessage`,
  чтобы переиспользоваться и в realtime, и в бэкфилле. Идемпотентно через
  UNIQUE `(thread_id, telegram_message_id, source)`.
- В `MessageList.tsx` появилась кнопка с `Loader2` под sentinel'ом
  подгрузки старых, показывается только при `hasMoreOlder === false`.
- В `MessengerTabContent.tsx` подключён хук бэкфилла и проброс в
  `MessageList`.
- `.claude/rules/infrastructure.md` дополнен разделом про backfill.

### 4. Доски — расширение функциональности

Большой блок изменений в `src/components/boards/` (+480 строк нетто).
В `BoardView.tsx` (+259 строк) добавлены новые сценарии работы со
списками, в `BoardListCard.tsx` — расширение карточки, в драгабельных
строках (`DraggableBoardProjectRow.tsx`, `DraggableBoardTaskRow.tsx`)
— подгонка под новое поведение, в `useFilteredListData.ts` — расширение
выборки. Появился новый хук `useBoardListItemOrders.ts` —
персистентный порядок элементов внутри списков досок. Изменения в
`BoardPage/index.tsx` и `BoardsPage/BoardTabContent.tsx` — мелкие
интеграции.

### 5. Read-tracking — оптимистичные апдейты `lastReadAt` и inbox-бейджей

В `useUnreadCount.ts` (+63 строки) и `messengerService.read.ts` (+46 строк)
устранены две гонки:

- На холодном reload `queryFn` хука `useUnreadCount`/`useLastReadAt`
  возвращал 0/null до того, как `useChatState` сидировал реальное
  значение. Теперь `enabled` ждёт либо `participantId`, либо `projectId`
  для fallback'а.
- При `markAsRead`/`markAsUnread` `lastReadAt` обновлялся только после
  возврата инвалидации — между мутацией и ответом БД `MessageList`
  подсвечивал уже прочитанные сообщения красной полосой. Теперь
  оптимистично проставляется `nowIso` в `lastReadKey` и одновременно
  гасится `unread_count`/`manually_unread`/`has_unread_reaction` в кеше
  `inboxKeys.threads(workspaceId)`.
- В `useNewMessageToast.ts` мелкая правка по той же теме.
- Добавлен ключ в `queryKeys/misc.ts`.

### 6. Типы

`src/types/database.ts` (+69 строк) — авто-регенерация после миграций
для backfill/MTProto.

## Деплой

- `supabase functions deploy telegram-mtproto-backfill --no-verify-jwt
  --project-ref zjatohckcpiqmxkmfxbs` — функция вызывается фронтом
  с Bearer JWT, но в коде сами проверяем токен, поэтому `--no-verify-jwt`
  оставляет нам контроль (хотя в данном конкретном случае можно было
  оставить дефолт — функция не вызывается без JWT).
- `git push origin main` запускает blue/green деплой фронта через
  GitHub Actions.
- `mtproto-service` деплоится отдельно (не покрывается этим коммитом —
  изменения только в репо).

## Тесты

`npm test`: 637/637 passed. `npm run lint`: 0 ошибок.

## Что не сделано (осознанно)

- **Полная виртуализация чата** через `@tanstack/react-virtual` —
  обсуждалась, отложена в отдельную задачу. Сейчас починена только
  мемоизация, что закрывает основной кейс (новое сообщение / реакция /
  mark-as-read).
- **Streaming upload** для больших Google Drive файлов — Supabase JS
  не поддерживает, потребует прямой fetch к Storage API. Без
  доказательства, что виснет именно на больших файлах — не оправдано.
- **AbortController / проверка размера** при drag-drop из Drive —
  UX-фича, не починка.
