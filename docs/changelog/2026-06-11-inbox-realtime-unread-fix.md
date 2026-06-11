# Входящие: realtime-обновление вкладки «Непрочитанные» и галочек

**Дата:** 2026-06-11
**Тип:** fix
**Статус:** completed

---

## Симптом

На доске список «Входящие» (особенно вкладка «Непрочитанные») не обновлялся в
реальном времени при новом сообщении — застывал до ручного действия/перезагрузки.
При этом всплывающие тосты появлялись.

## Причина

Регрессия от недавней оптимизации инбокса: вкладка «Непрочитанные» переведена на
отдельный ключ `inboxKeys.unread`, а галочки доставки — на `inboxKeys.messageStatuses`.
Realtime-подписка `useWorkspaceMessagesRealtime` инвалидировала только старые ключи
(`threads`, `aggregates`, `sidebar`) и про новые не знала → данные на новых ключах
не рефетчились. Тосты работали, т.к. это отдельный хук.

## Фикс

- [`useWorkspaceMessagesRealtime.ts`](../../src/hooks/messenger/useWorkspaceMessagesRealtime.ts):
  в `doInvalidate` добавлены `inboxKeys.unread` и `inboxKeys.messageStatuses`.
- [`useNewMessageToast.ts`](../../src/hooks/messenger/useNewMessageToast.ts):
  при «прочитано» с тоста — те же ключи, чтобы тред уходил из «Непрочитанных» сразу.

Решение событийное (realtime), не поллинг: обновление только при реальном
изменении, throttle 400мс уже схлопывает всплески — нагрузка минимальна.

## Проверки

- `npx tsc --noEmit && npm run lint && npm test` — зелёные.
