# Входящие: три непересекающихся сегмента «Непрочитанные / Нужно ответить / Ждём клиента»

**Дата:** 2026-06-13
**Тип:** feat + refactor
**Статус:** completed

CRM-доработка инбокса. Раньше во «Входящих» была одна вкладка «Ждут ответа»
(диалоги, где последними писали мы). Заменена на две равнозначные вкладки, плюс
набор staff-ролей вынесен в общий SQL-хелпер. Все сегменты — только по **внешним
диалогам** (Telegram / WhatsApp / группа ТГ / Email) и **взаимоисключающие**.

---

## 1. Модель трёх сегментов

Каждый внешний диалог попадает ровно в один сегмент, **приоритет у «Непрочитанных»**:

| Вкладка | Условие |
|---------|---------|
| **Непрочитанные** (как было) | есть непрочитанное входящее. Если есть — диалог только здесь. |
| **Нужно ответить** (новая) | последним написал **клиент**, и всё **прочитано** (видел, но не ответил). |
| **Ждём клиента** (бывшая «Ждут ответа») | последними написали **мы**, всё прочитано. |

**Непересечение** обеспечивается двумя гейтами:
- гейт «прочитано» (`NOT unread`) на обеих новых выборках → не пересекаются с «Непрочитанными»;
- направление последнего сообщения разводит «Нужно ответить» и «Ждём клиента» между собой.

Проверено на проде (read-only): пересечения между всеми тремя — `0/0/0`.

---

## 2. БД

Миграция `20260613_inbox_needs_reply_and_staff_role.sql` (применена в прод):

- **`public.is_staff_role(text)`** — хелпер: роль отправителя из команды
  (`Администратор / Владелец / Сотрудник / Исполнитель`). Один источник набора
  staff-ролей на стороне БД, зеркало фронтового `permissions.ts → STAFF_ROLES`.
- **`get_inbox_awaiting_reply_threads`** пересоздана → «Ждём клиента»:
  последнее НЕ-сервисное сообщение от нас (`is_staff_role(lastrole)`) + есть
  внешний source + гейт «прочитано».
- **`get_inbox_needs_reply_threads`** (новая) → «Нужно ответить»: инверсия
  предиката (`is_staff_role(lastrole) IS NOT TRUE`, NULL-роль = собеседник) +
  внешний source + гейт «прочитано».

Обе — обёртки над `get_inbox_threads_v2` (как `get_inbox_unread_threads`).
Гранты: `REVOKE PUBLIC` + `GRANT authenticated, service_role`.
`get_inbox_threads_v2` **не трогали** (карантинная зона) — `is_staff_role`
используется только в обёртках.

---

## 3. Фронт

**Данные:**
- `services/api/inboxService.ts` — `getInboxNeedsReplyThreads`.
- `hooks/queryKeys/messenger.ts` — ключ `inboxKeys.needsReply` + в `invalidateMessengerCaches`.
- `hooks/messenger/useFilteredInbox.ts` — хук `useFilteredInboxNeedsReply`.
- `hooks/messenger/useWorkspaceMessagesRealtime.ts` — `needsReply` в realtime-инвалидацию.
- `types/database.ts` — тип нового RPC.

**UI:**
- `page-components/InboxPage/useInboxFilters.ts` (+`.test.ts`) — фильтр `needs_reply` + счётчик.
- `page-components/InboxPage/InboxSidebar.tsx` и `components/boards/BoardInboxList.tsx` —
  переименование «Ждут ответа» → «Ждём клиента», вкладка «Нужно ответить»,
  порядок **Непрочитанные · Все · Нужно ответить · Ждём клиента**, одна строка
  с горизонтальным скроллом без видимой полосы (`scrollbar-hide`).
- `page-components/InboxPage/index.tsx` — подключение хука.

---

## Грабли

- Любой новый inbox-ключ (`needsReply`) обязан попасть в realtime
  `useWorkspaceMessagesRealtime.doInvalidate` **и** `invalidateMessengerCaches` —
  иначе «заморозка» данных на вкладке. Сделано.
- Гейт «прочитано» считается по тем же полям, что `get_inbox_unread_threads`
  (`unread_count` / `unread_event_count` / `unread_reaction_count` /
  `has_unread_reaction` / `manually_unread`) — менять синхронно.
- `is_staff_role` — намеренное SQL-зеркало `permissions.ts STAFF_ROLES`, не «дубль»;
  при изменении набора ролей править оба места (зафиксировано в `audit-false-positives.md`).

---

## Проверки

`tsc` 0 ошибок, `lint` 0, **707 тестов** зелёные (+1 кейс `needs_reply`).
БД-функции в проде. Фронт — этой выкаткой.
