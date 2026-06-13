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

## Отложенная инверсия слоёв (компонентная — ТИПЫ/DTO уже вынесены)

⚠️ **Обновление 2026-06-13 (архитектурный аудит, тема T1):** type/DTO-инверсии
СНЯТЫ этой сессией — доменные типы и DTO вынесены вниз (`@/types/documents`,
`@/types/forms`, `@/types/board`, `@/types/taskPanelTabs`, `ExportDocument`→store),
`FilterPrimitives`→`components/filters/`. Осталась **компонентная** инверсия
(перенос живого UI, нужна сессия со смоком вкладки «Документы»):
- движок документов в ДВУХ слоях: `page-components/ProjectPage/components/Documents/*`
  ↔ `components/documents/` (пересекающиеся `SlotItem`/`SlotRow`, `DocumentsContext`).
- `components → page-components/ProjectPage` импорты (7 файлов): `moduleRegistry`,
  `useProjectModules`/`useProjectTemplate`/`useProjectData`/`useProjectMutations`,
  `Documents/*` движок. Переносить при касании или отдельной сессией.
- `DocumentKitContext` (cross-feature `documents ↔ projects/DocumentKitsTab`) → shared.
- `ProjectsPage/.../useProjectTemplatesQuery` → `hooks/`; `ItemListsPage/columns` → `components/itemLists/`.

## Карантин-мессенджер (отложено из аудита защищённых зон 2026-06-13)

- **F1 финальная зачистка** (после смока «Клиенты»): `supabase functions delete telegram-webhook` (v1) + дроп колонки `project_telegram_chats.bot_version` + добить мёртвый v1-чат «Команда» (60eac940, rs1_support_bot, неактивен с марта). Все 5 ботов уже на v2 (getWebhookInfo). Откат и условия — `docs/audit/2026-06-13-quarantine-audit.md` §F1.
- **Распил `email-internal-send`** — высокий риск, рабочая карантинная функция без бага под распилом. Только по явной просьбе.
- **Карантин accent-карты** (`ReactionBadges`/`MessageInputToolbar`/`threadConstants` `COLOR_TEXT`) → `Record<ThreadAccentColor>` НЕ сделал: локальный `MessengerAccent` имеет legacy-алиасы (`green`/`dark`), которых нет в картах → нужны доп. касты + карантин. 3 не-карантинных карты уже под защитой типов (T4).
- **B9 полный дедуп** mtproto `/users/fetch-avatar` с `fetchAndStoreAvatar` — НЕ делал: разные контракты `force`/TTL + void-return, а у эндпоинта нет живых вызывающих (стамп `avatar_fetched_at` добавлен).

## Косметика T5 (архитектурный аудит — churn > выгода)

- 3 routed-страницы шаблонов (`ProjectTemplateEditorPage`, `DocumentKitTemplateEditorPage`, `FormTemplateEditorPage/`) в `components/` → `page-components/` (поломает много относительных импортов ради организации).
- Единый `ROUTES`/`buildRoute` реестр для 69 hardcoded route-строк `/workspaces/${id}/...`.
- Унификация суффиксов management-view (`*Directory` vs `*Content`).
- Покрытие edge-контрактов (`edgeContracts.ts` 6 из 65 `invoke`) — полу-by-design, заводить при касании.
- Стягивание 68 inline-`supabase.from` из хуков/компонентов в сервисы — органически (правило в `infrastructure.md`).

## Мелкий БД-долг (архитектурный аудит)

- Дроп мёртвой RPC `get_my_urgent_tasks_count` — фронт-кластер `taskKeys` удалён (T4), RPC без живого вызывающего. Дропать после сверки, что её не зовёт edge/cron.

## Перф (отложено)

- `useTaskAssigneesMap` (28 параллельных запросов + 40-КБ queryKey на /tasks и /lists) → один RPC `get_assignees_for_workspace(workspace_id)`.
- виртуализация таблиц списков (`TableShell`) через `@tanstack/react-virtual` — `memo(ThreadRow)` уже убрал острую боль (ре-рендер при выделении); виртуализация семантической `<table>` со sticky-заголовком и inline-edit — заметный риск, делать отдельно при росте объёмов.
- `block-gap-inserter.tsx` cleanup глобального listener через ref-counting (сейчас эвристика через setTimeout+querySelector, задокументирована).

## БД (отложено)

- `inbox`-RPC семья = ~95% нагрузки БД (известно, план в backlog) — `get_inbox_thread_one` (283мс за 1 тред) и `get_inbox_unread_threads` (685мс) первыми переписать на прямой доступ вместо обёрток над `get_inbox_threads_v2`.
- проверить пару дедуп-индексов `uq_project_messages_telegram_dedup` vs `uq_project_messages_telegram_content_dedup` (возможно первый — мёртвый предшественник) — отдельной задачей со смок-тестом.
- `net._http_response` heap раздут (~9МБ при 44 строках) — `VACUUM FULL` при окне обслуживания.
