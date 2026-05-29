# Мессенджер/задачи — смена статуса и срока не обновляла «Входящие»

**Дата:** 2026-05-29
**Тип:** bugfix (UX)
**Статус:** completed

---

## Контекст

Продолжение разбора пропусков инвалидации кэшей (см.
[`2026-05-29-messenger-auto-read-and-calendar-hover.md`](2026-05-29-messenger-auto-read-and-calendar-hover.md)).

**Симптом:** меняешь статус треда в боковой панели (например на «Выполнен»)
— в списке «Входящие» статус не обновляется, и завершённая задача не
пропадает из списка, хотя по фильтру должна была уйти. После F5 — всё
корректно.

---

## Корень

Смена статуса идёт через общую мутацию `useUpdateTaskStatus`
([`useTaskMutations.ts`](../../src/components/tasks/useTaskMutations.ts)).
В `onSuccess` она инвалидировала `invalidateKeys` (что передал
потребитель) + `projectThreadKeys.byId`, `auditEvents`,
`accessibleProjectKeys.all`, деталь проекта.

Из панели ([`TaskPanelTabContents.tsx`](../../src/components/tasks/TaskPanelTabContents.tsx))
передаётся только `[workspaceThreadKeys.workspace(workspaceId)]` — это ключ
списка `get_workspace_threads` (доска/«Мои задачи»). Список «Входящие»
живёт на **другом** ключе `inboxKeys.threads` (`['inbox','threads-v2',ws]`,
RPC `get_inbox_threads_v2`), который смена статуса не трогала вообще →
инбокс не перезапрашивался, фильтр не пересчитывался.

Аналогичный пробел был у `useUpdateTaskDeadline`: инбокс группирует задачи
по сроку (Сегодня/Завтра), а смена дедлайна инбокс не инвалидировала.

---

## Фикс

Инвалидация инбокса добавлена прямо в общие мутации (а не в `invalidateKeys`
конкретного потребителя) — чтобы работало из всех точек: панель, доска,
списки.

- `mutationFn` обеих мутаций теперь возвращает `{ workspaceId }`
  (`workspace_id` уже читается из `project_threads`; для дедлайна добавлен
  в `select`).
- В `onSuccess` — `if (result?.workspaceId) invalidateMessengerCaches(queryClient, result.workspaceId)`.

`invalidateMessengerCaches` инвалидирует `inboxKeys.threads` + `aggregates`
+ sidebar-проекты — список и бейджи обновляются синхронно.

## Затронутые файлы

- `src/components/tasks/useTaskMutations.ts`

## Проверки

- `npm run lint` — чисто.
- `npx tsc --noEmit` — без ошибок.
- `npm test` — зелёные.
