# Реальная блокировка участника + утечка личных диалогов через инбокс

**Дата:** 2026-05-13
**Тип:** fix (security)
**Статус:** completed

---

## Контекст

Два независимых, но связанных по теме безопасности инцидента, всплывшие в одной сессии.

1. **Блокировка участника не работала.** Владелец воркспейса выставлял у сотрудника статус «Заблокирован», а тот продолжал спокойно логиниться и работать. Проверил по БД: у `participants.can_login` стояло `false`, а в `auth.users.banned_until = null`, `last_sign_in_at` — сегодня.
2. **Личные диалоги владельца светились во «Входящих» у всех сотрудников.** В превью инбокса висели имя собеседника, последнее сообщение и бейдж непрочитанных. При клике — `Тред недоступен или удалён` (RLS на `project_threads`/`project_messages` блокировал содержимое).

## Сюжет 1: блокировка `can_login` была чисто косметической

### Что было сломано

`participants.can_login = false` использовался только как внутренний UI-флаг:
- в фильтрах ассайни задач (`AssigneesPopover`),
- в RPC `start_impersonation_session` (как условие «target — активный»),
- в выпадашке участников.

`auth.users.banned_until` не трогался → Supabase Auth разрешал логин обычным паролем. Активные сессии не сбрасывались — текущий access-token (1ч TTL) и refresh-token продолжали работать. RLS-политики проверяли `is_deleted=false`, но не `can_login=true`.

Итог: «Заблокирован» в UI означал только «не показываем тебя в списке исполнителей».

### Решение — единый пайплайн через edge function

Перевёл изменение `can_login` в edge function `set-participant-access`, которая делает три вещи синхронно с переключением флага:

1. **Бан в `auth.users`.** Если у юзера НЕТ других активных participants (`can_login=true AND is_deleted=false` в других воркспейсах) — `auth.admin.updateUserById({ ban_duration: '876000h' })` (~100 лет). Если есть — не баним, чтобы не выбить из других WS.
2. **Сброс refresh-токенов.** В любом случае дёргается RPC `revoke_all_user_sessions(user_id)` (`SECURITY DEFINER`, только `service_role`), которая делает `DELETE FROM auth.sessions/auth.refresh_tokens`. `auth.admin.signOut(jwt)` не подходит — он требует access-token самого юзера.
3. **Разблокировка.** При `can_login=true` снимаем бан: `auth.admin.updateUserById({ ban_duration: 'none' })`.

Дополнительные защиты:
- Запрет блокировать владельца воркспейса.
- Запрет блокировать самого себя.
- Проверка прав вызывающего через `is_workspace_owner` или `has_workspace_permission(..., 'manage_workspace_settings')`.

### Server-side guard от уже активных сессий

Бан и сброс сессий не закрывают существующий access-token — он живёт до своего естественного истечения (≤1ч). Поэтому добавил server-side проверку в [`src/app/(app)/workspaces/[workspaceId]/layout.tsx`](../../src/app/(app)/workspaces/[workspaceId]/layout.tsx) — конвертирован в server component. На каждом server-render запросе:

- проверяет, что у `auth.uid()` есть `participant` в этом workspace с `is_deleted=false` и `can_login=true`;
- иначе — `redirect('/workspaces?blocked=<id>')`.

Клиентская обёртка (`WorkspaceProvider` + `WorkspaceLayoutShell`) вынесена в [`WorkspaceLayoutClient.tsx`](../../src/app/(app)/workspaces/[workspaceId]/WorkspaceLayoutClient.tsx) — server component не может содержать `"use client"` хуки.

На `/workspaces` при наличии `?blocked` показывается красный `Alert` с понятным сообщением.

### Фронт

`toggleAccessMutation` и `editMutation` в [`useParticipantsMutations.ts`](../../src/page-components/workspace-settings/useParticipantsMutations.ts) теперь ходят через `supabase.functions.invoke('set-participant-access', ...)` вместо прямого `UPDATE participants`. В `editMutation` поле `can_login` обрабатывается отдельно — если изменилось, дёргается edge function, остальные поля идут обычным UPDATE.

### Файлы

- [`supabase/functions/set-participant-access/index.ts`](../../supabase/functions/set-participant-access/index.ts) — новая.
- [`supabase/migrations/20260513_revoke_user_sessions.sql`](../../supabase/migrations/20260513_revoke_user_sessions.sql) — RPC.
- [`src/app/(app)/workspaces/[workspaceId]/layout.tsx`](../../src/app/(app)/workspaces/[workspaceId]/layout.tsx) — server-side guard.
- [`src/app/(app)/workspaces/[workspaceId]/WorkspaceLayoutClient.tsx`](../../src/app/(app)/workspaces/[workspaceId]/WorkspaceLayoutClient.tsx) — клиентская обёртка.
- [`src/page-components/WorkspacesPage.tsx`](../../src/page-components/WorkspacesPage.tsx) — баннер по `?blocked`.
- [`src/page-components/workspace-settings/useParticipantsMutations.ts`](../../src/page-components/workspace-settings/useParticipantsMutations.ts) — мутации через edge function.

## Сюжет 2: личные диалоги светились во «Входящих» у всех

### Что было сломано

В RPC `get_inbox_threads_v2` (SECURITY DEFINER — RLS внутри не работает) второй UNION-блок добавлял в `accessible_threads` **все** треды с `project_id IS NULL` без проверки `owner_user_id`:

```sql
UNION ALL
SELECT pt.id, ...
FROM project_threads pt
WHERE pt.workspace_id = p_workspace_id
  AND pt.project_id IS NULL
  AND pt.is_deleted = false
```

Эти треды — личные диалоги (TG Business, TG MTProto, Wazzup, личная почта сотрудника), они должны видеться только своему `owner_user_id`. RPC отдавала превью-строку (имя, последнее сообщение, бейдж непрочитанных) всем сотрудникам воркспейса. Само содержимое треда RLS блокировал — отсюда «Тред недоступен или удалён» при клике.

### Решение

В [`20260513_inbox_v2_filter_personal_dialogs_by_owner.sql`](../../supabase/migrations/20260513_inbox_v2_filter_personal_dialogs_by_owner.sql) добавил во второй UNION-блок:

```sql
AND pt.owner_user_id = p_user_id
```

Менеджерам чужие личные диалоги в инбоксе не нужны — у них есть отдельный UI `/personal-dialogs` с явной фильтрацией.

### Что проверил параллельно

- `get_workspace_threads` — корректно: `(pt.project_id IS NULL AND pt.owner_user_id = p_user_id)` уже было.
- `can_user_access_thread` — корректно: личный диалог открывается только owner / created_by / менеджеру с `view_all_projects`.
- `can_view_thread` — формально кривая (для `project_id IS NULL` пропускает любого участника воркспейса), **но** в RLS-полицях не используется. Не источник утечки. Оставил на отдельный заход.

## Итог

После деплоя:

- Заблокированный сотрудник физически не может залогиниться (бан в `auth.users`), активные сессии сброшены, server-side layout не пускает в воркспейс даже под живым access-token'ом.
- Личные диалоги/почта владельца перестали светиться у других сотрудников — ни превью в «Входящих», ни уведомления.

Документация: добавил раздел «Блокировка участника» в [`infrastructure.md`](../../.claude/rules/infrastructure.md).
