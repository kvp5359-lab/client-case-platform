# Серверный журнал ошибок отправки сообщений + sticky-toast и страница для менеджера

**Дата:** 2026-05-14
**Тип:** feature (medium)
**Статус:** completed

---

## Контекст

Нажимаешь «Отправить» в чате, переключаешься в другой проект — а сообщение не ушло. Раньше об этом узнавали только через пару минут, когда возвращались. На клиенте работал `toast.error('Не удалось отправить — текст возвращён в поле ввода')` из `onError` мутации `useSendMessage` ([useSendMessage.ts:188](../../src/hooks/messenger/useSendMessage.ts)) — но toast от sonner живёт ~4 секунды и привязан к открытой вкладке. Если автор успел уйти из чата или закрыл ноут — он больше никогда не увидит, что отправка провалилась. Текст лежит в `localStorage` молча. Менеджер тоже ничего не видит, потому что лог нигде не пишется.

Сделали серверный журнал `message_send_failures`, привязанные к нему realtime-уведомления и страницу для менеджера. Теперь:
- автор видит sticky-toast «Не удалось отправить» с кнопкой «Открыть чат» с любого устройства, в любой момент после факта;
- менеджер воркспейса видит весь журнал по всем сотрудникам — и для дебага, и на случай «сотрудник в отпуске, нужно подхватить недоставленное».

## Архитектура

### Таблица `message_send_failures`

[20260514_message_send_failures.sql](../../supabase/migrations/20260514_message_send_failures.sql) — поля:

```
id, workspace_id, project_id, thread_id, user_id, participant_id,
content, attachment_names, error_text, error_code, source,
integration_id, metadata, created_at, resolved_at, resolved_by
```

Три partial-индекса под основные сценарии:
- `idx_msf_user_unresolved` (user_id, created_at) WHERE resolved_at IS NULL — бейдж и тосты текущему юзеру.
- `idx_msf_workspace_unresolved` — страница менеджера с фильтром «активные».
- `idx_msf_thread` — потенциально для контекста в самом чате (пока не используется).

**RLS:** SELECT/UPDATE — автор + менеджеры воркспейса (`is_workspace_owner` или `manage_workspace_settings`). INSERT/DELETE — закрыто, только service role через edge-функцию (защита от proxy-абьюза «логирую как будто отправку, к которой нет доступа»).

**Realtime publication** включена — фронт подписывается на INSERT/UPDATE с фильтром `user_id=eq.<auth.uid()>`, мгновенно видит свои новые failures и резолвы (даже из другой вкладки/устройства).

### Edge function `log-send-failure`

[supabase/functions/log-send-failure/index.ts](../../supabase/functions/log-send-failure/index.ts) — `verify_jwt=true`, проверяет членство в воркспейсе через `checkWorkspaceMembership`, подрезает content до 50 000 символов и error_text до 2 000, инсёртит запись через service-client. Возвращает `{ ok: true, id, created_at }`.

### Подключение к `useSendMessage`

В [useSendMessage.ts:206-236](../../src/hooks/messenger/useSendMessage.ts) рядом со старым `toast.error` — fire-and-forget вызов [logSendFailure](../../src/services/api/messenger/logSendFailure.ts) с контекстом (workspace_id, project_id, thread_id, participant_id, content, имена вложений, error.message, source, метаданные про reply/attachments). Если сам вызов лога упадёт — `console.warn`, без второго toast'а юзеру.

## Фронт

### Хуки [useSendFailures.ts](../../src/hooks/messenger/useSendFailures.ts)

- `useMyUnresolvedSendFailures(workspaceId)` — initial fetch + realtime-подписка. Кэш-ключ `sendFailureKeys.myUnresolved(wsId)`.
- `useWorkspaceSendFailures(workspaceId, includeResolved)` — для страницы менеджера, без realtime (refresh кнопка).
- `useResolveSendFailure(workspaceId)` — одна запись.
- `useResolveAllMySendFailures(workspaceId)` — все мои в одном WS.

### Sticky-toast'ы [SendFailureToasts.tsx](../../src/components/messenger/SendFailureToasts.tsx)

Подключён в [WorkspaceLayout](../../src/components/WorkspaceLayout.tsx) сразу после `GlobalContactCardDialog`. На каждый новый failure показывает persistent toast (`duration: Infinity`):

- title — «Не удалось отправить сообщение»
- description — превью текста (или `error_text`)
- action — «Открыть чат» (только если есть thread_id): открывает тред через `globalOpenThread` + резолвит failure + dismiss toast.

`shownRef` (Set) дедупит при ре-рендере. `toastIdRef` (Map: failureId → toastId) даёт автоматически снимать toast'ы, когда failure пропадает из unresolved-списка (юзер закрыл его на странице журнала или из другого устройства).

### Бейдж в сайдбаре [SendFailuresIndicator.tsx](../../src/components/messenger/SendFailuresIndicator.tsx)

Красная пилюля «⚠ N не отправлено» сразу под селектором воркспейса. Скрыта когда failures.length === 0. Клик открывает popover (Radix Popover, side="right"), внутри — список с превью, временем, текстом ошибки и двумя кнопками per-row:
- «Открыть чат» (стрелка) → `globalOpenThread` + resolve + close popover.
- «Скрыть» (X) → только resolve.

Внизу — «Скрыть все» (`useResolveAllMySendFailures`).

### Страница для менеджера

[SendFailuresTab.tsx](../../src/page-components/workspace-settings/SendFailuresTab.tsx) — новая вкладка «Не отправленные» в `/workspaces/[id]/settings`. Доступ — владелец или роль с `manage_workspace_settings`. Список по всему воркспейсу (через тот же RLS-фильтр на сервере), фильтр «Только активные / Все», имя автора резолвится через `useWorkspaceParticipants`. Действия per-row: «Открыть чат», «Закрыть».

Route: [src/app/(app)/workspaces/[workspaceId]/settings/send-failures/page.tsx](../../src/app/(app)/workspaces/[workspaceId]/settings/send-failures/page.tsx). Вкладка зарегистрирована в [WorkspaceSettingsPage](../../src/page-components/WorkspaceSettingsPage.tsx) рядом с «Корзиной».

## Что НЕ делается (сознательно)

- **Повторная отправка из журнала.** Текст уже возвращён в черновик автора в его сессии и в его браузере; resend «за автора» из менеджерской страницы дал бы false-sense-of-fix. Менеджер видит факт, автор отправляет заново.
- **Внешние нотификации (Telegram, email менеджеру).** Можно добавить расширением edge-функции — оставлено на потом.
- **Ретраи на стороне фронта.** Сейчас одна попытка → fail → лог. Авто-ретрай (например, 3 попытки с экспоненциальным бэкоффом) — отдельной задачей; нужна аккуратность с дублями оптимистических сообщений.

## Проверки

- `npm run lint` — чисто.
- `npm test` — 637/637 passed.
- TS-типы регенерированы (`src/types/database.ts`).

## Файлы

**Новые:**
- [`supabase/migrations/20260514_message_send_failures.sql`](../../supabase/migrations/20260514_message_send_failures.sql)
- [`supabase/functions/log-send-failure/index.ts`](../../supabase/functions/log-send-failure/index.ts)
- [`src/services/api/messenger/logSendFailure.ts`](../../src/services/api/messenger/logSendFailure.ts)
- [`src/hooks/messenger/useSendFailures.ts`](../../src/hooks/messenger/useSendFailures.ts)
- [`src/components/messenger/SendFailureToasts.tsx`](../../src/components/messenger/SendFailureToasts.tsx)
- [`src/components/messenger/SendFailuresIndicator.tsx`](../../src/components/messenger/SendFailuresIndicator.tsx)
- [`src/page-components/workspace-settings/SendFailuresTab.tsx`](../../src/page-components/workspace-settings/SendFailuresTab.tsx)
- [`src/app/(app)/workspaces/[workspaceId]/settings/send-failures/page.tsx`](../../src/app/(app)/workspaces/[workspaceId]/settings/send-failures/page.tsx)

**Изменённые:**
- [`src/hooks/messenger/useSendMessage.ts`](../../src/hooks/messenger/useSendMessage.ts) — fire-and-forget logSendFailure в onError.
- [`src/hooks/queryKeys/messenger.ts`](../../src/hooks/queryKeys/messenger.ts) — `sendFailureKeys`.
- [`src/components/WorkspaceLayout.tsx`](../../src/components/WorkspaceLayout.tsx) — рендер `SendFailureToasts`.
- [`src/components/WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx) — рендер `SendFailuresIndicator`.
- [`src/page-components/WorkspaceSettingsPage.tsx`](../../src/page-components/WorkspaceSettingsPage.tsx) — новая вкладка.
- [`src/types/database.ts`](../../src/types/database.ts) — регенерация (новая таблица).
