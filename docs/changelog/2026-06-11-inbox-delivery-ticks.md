# Входящие: галочки доставки последнего исходящего в превью списка

**Дата:** 2026-06-11
**Тип:** feature
**Статус:** completed

---

## Что стало

В списке «Входящие» (доска-инбокс и страница `/inbox`) у треда, где последнее
сообщение — наше исходящее, на месте бейджа рисуется галочка статуса доставки,
как в самих сообщениях:

- «отправляется» — серые часики (`pending`),
- «отправлено» — одна серая галочка (`sent`),
- «прочитано» — две синие (`read`).

`failed` в превью не показываем (ошибка видна в треде и в тосте). Галочка
появляется только когда превью показывает само сообщение — не черновик, не
реакцию, не событие. На ховере строки галочка уступает кнопке «отметить
непрочитанным».

## Реализация

Отдельный лёгкий запрос — **не трогает** `get_inbox_threads_v2` и его обёртки,
не зависит от keyset-пагинации инбокса.

- RPC `get_inbox_message_status(p_workspace_id, p_user_id)` — `delivery_status`
  непустой только когда последнее сообщение треда исходящее.
- [`inboxService.ts`](../../src/services/api/inboxService.ts): `getInboxMessageStatuses`
  + тип `InboxMessageStatus`.
- [`useFilteredInbox.ts`](../../src/hooks/messenger/useFilteredInbox.ts):
  `useInboxMessageStatuses` → `Map<thread_id, DeliveryStatus>` (O(1)-доступ).
- [`queryKeys/messenger.ts`](../../src/hooks/queryKeys/messenger.ts):
  `inboxKeys.messageStatuses`.
- [`InboxChatItem.tsx`](../../src/components/messenger/InboxChatItem.tsx): компонент
  `DeliveryTick` + проп `deliveryStatus`.
- Прокидка: [`BoardInboxList.tsx`](../../src/components/boards/BoardInboxList.tsx),
  [`InboxPage/index.tsx`](../../src/page-components/InboxPage/index.tsx),
  [`InboxSidebar.tsx`](../../src/page-components/InboxPage/InboxSidebar.tsx).

## Затронутые файлы

- `src/services/api/inboxService.ts`
- `src/hooks/messenger/useFilteredInbox.ts`
- `src/hooks/queryKeys/messenger.ts`
- `src/components/messenger/InboxChatItem.tsx`
- `src/components/boards/BoardInboxList.tsx`
- `src/page-components/InboxPage/index.tsx`
- `src/page-components/InboxPage/InboxSidebar.tsx`

## Проверки

- `npx tsc --noEmit && npm run lint` — зелёные.
- Зависит от RPC `get_inbox_message_status` в проде (фронт зовёт по имени).
