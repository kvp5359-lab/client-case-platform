# Отложенные пункты аудита 2026-06-13

Марафон фиксов по двум аудитам закрыл критику и большинство находок (см.
`docs/audit/2026-06-12-remediation-backlog.md`). Здесь — то, что осознанно
отложено: либо большой риск/объём при малом выигрыше, либо требует отдельного
решения. Каждый пункт actionable.

## Принятые решения (не делать сейчас)

### participant-avatars — публичный бакет, риск принят
Аватары клиентов из TG/Wazzup лежат в public-бакете `participant-avatars`
(`<workspace_id>/<uuid>.jpg`). Доступны по прямому URL без авторизации.
**Решение: риск принят.** Перебор требует знания `workspace_id` И конкретного
`uuid` аватара (двойной uuid, не перечислимо), а перевод на приватный бакет +
signed URL задевает карантинный пайплайн аватаров (fetch-telegram-avatar,
mtproto-service, next.config image hosts) непропорционально угрозе. Если
потребуется ужесточение — отдельная задача: приватный бакет + signed URL во всех
точках рендера + продление подписи.

### docbuilder — общая БД со старым приложением
`docbuilder_*` таблицы — чужое приложение (bp-create / старый ClientCase) на той
же Supabase. В аудите закрыли только утечку API-ключей (`docbuilder_app_settings`
SELECT → участникам docbuilder). Дубли RLS-политик и прочая гигиена docbuilder —
**не наш код, не трогаем.** Полный вынос `docbuilder_*` в отдельный проект — если
старое приложение когда-нибудь выведут.

### bp-* Edge Functions — общая Supabase
Функции `bp-*` (+ их не-bp оригиналы `fetch-image`, `generate-block` и т.д.)
делят проект Supabase с ClientCase. В аудите пропатчили дыры (SSRF, env-ключ) и в
этом репо, и в bp-create, задеплоили. **Долгосрочно:** вынести bp-create в
отдельный Supabase-проект (изоляция service-role и БД) — крупная инфра-задача,
отдельно.

## Долгосрочная безопасность

### auth.uid()-гейты внутри SECURITY DEFINER RPC категории C
Этап 1 отозвал у anon ~45 функций. Это закрыло **анонимный** вектор, но НЕ
межпользовательский: залогиненный юзер всё ещё может подставить чужой `p_user_id`
в функции, которые слепо доверяют параметру (`get_accessible_projects`,
`get_user_projects`, `get_inbox_threads_v2`, `get_sidebar_data`,
`get_project_history`, `get_workspaces_with_counts`, `get_inbox_message_status`,
`add_message_pair`, `toggle_message_reaction` по `p_participant_id` и т.д.).
**Задача:** добавить внутрь `IF p_user_id <> auth.uid() THEN RAISE EXCEPTION`
(или резолвить user_id из auth.uid(), игнорируя параметр). Партиями, со смок-тестом
каждого — это горячие RPC инбокса/сайдбара.

### workspaces SELECT — сузить до участников
Политика `workspaces` SELECT = `auth.role()='authenticated' AND is_deleted=false`
отдаёт строки ВСЕХ воркспейсов любому залогиненному (id/name/описание/домены;
ключи — только `*_api_key_id` ссылки, не значения). Слабое раскрытие. Сузить до
`is_workspace_participant(auth.uid(), id)`. Проверить, что не сломает экраны
выбора/приглашения воркспейса.

## Отложенные распилы (по политике «на месте правки»)

Флагман CreateProjectDialog распилен (этап 6). Остальные — по конкретным планам
из аудита, делать при следующем касании файла (НЕ марафоном):

- `ProjectTemplateThreadList.tsx` (517) — 4 inline-мутации → `useProjectTemplateThreadListMutations`, `SortableContentRow` → отдельный файл.
- `ProjectTemplateStatusesSection.tsx` (416) — 5 inline-мутаций → `useTemplateStatusesMutations`.
- `CreateDriveFoldersDialog.tsx` (504) — `useDriveFoldersWizard` + 3 view-компонента.
- `FormsTabContent.tsx` (418) — brief/connect-логика → `useBriefSheetActions`.
- `handleInbound` (`app/api/resend-webhook/inbound.ts:20`, ~446 строк, карантин) — механический split на функции без изменения логики.
- `CreateProjectDialog` — перевод самодельной `createPortal`-модалки на shadcn `Dialog` (доступность: focus trap, Escape, scroll-lock). Проверить вложенные поповеры формы.

## Отложенные дедупы (низкий приоритет)

- финсправочники ×3 (`FinanceServices/TaxRates/TxCategories`) → generic `DirectoryCrudTable<T>` (делать только если планируются ещё справочники).
- дерево групп QuickReply ↔ Knowledge (компонент + фабрика хука) — структурный каркас, не доменные действия.
- `ThreadTemplatesContent` ↔ `ProjectTemplateThreadList` мутации → `useThreadTemplateMutations({invalidate, insertExtras})`.
- мелкие: `ManageGroupsDialog`↔`ManageTagsDialog`, `RowHoverActions`, `useProjectPlan`↔`useTemplatePlan` CRUD, `BoardTab`↔`ItemListTab`, `DraggableBoardRow`, `SelectOptionRow`, `ContextTextDialog`↔`AddTextDialog`.
- утилиты-близнецы (разные слои, связывать осторожно): `diffDaysFromToday` ×4, `escapeHtml` ×3 (server route vs client util), `formatBadgeCount` ×2, `plural` → `src/utils/`.

## Отложенная инверсия слоёв (5 точек, кроме сделанной useParticipantsMutations)

`components → page-components` импорты — переносить при касании:
- модуль `ProjectPage/components/Documents/*` → `components/documents/` (3 потребителя).
- `ProjectPage/moduleRegistry` + `useProjectModules`/`useProjectTemplate` → `lib/` или `components/projects/`.
- `ProjectsPage/.../useProjectTemplatesQuery` → `hooks/`.
- `ItemListsPage/columns` → `components/itemLists/`.
- `ProjectPage/hooks/useProjectMutations` → `hooks/projects/`.

## Перф (отложено)

- `useTaskAssigneesMap` (28 параллельных запросов + 40-КБ queryKey на /tasks и /lists) → один RPC `get_assignees_for_workspace(workspace_id)`.
- виртуализация таблиц списков (`TableShell`) через `@tanstack/react-virtual` — `memo(ThreadRow)` уже убрал острую боль (ре-рендер при выделении); виртуализация семантической `<table>` со sticky-заголовком и inline-edit — заметный риск, делать отдельно при росте объёмов.
- `block-gap-inserter.tsx` cleanup глобального listener через ref-counting (сейчас эвристика через setTimeout+querySelector, задокументирована).

## БД (отложено)

- `inbox`-RPC семья = ~95% нагрузки БД (известно, план в backlog) — `get_inbox_thread_one` (283мс за 1 тред) и `get_inbox_unread_threads` (685мс) первыми переписать на прямой доступ вместо обёрток над `get_inbox_threads_v2`.
- проверить пару дедуп-индексов `uq_project_messages_telegram_dedup` vs `uq_project_messages_telegram_content_dedup` (возможно первый — мёртвый предшественник) — отдельной задачей со смок-тестом.
- `net._http_response` heap раздут (~9МБ при 44 строках) — `VACUUM FULL` при окне обслуживания.
