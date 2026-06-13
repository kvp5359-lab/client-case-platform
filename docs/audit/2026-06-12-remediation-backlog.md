# Бэклог устранения находок аудитов 2026-06-12

Два аудита (зоны 1-10 + углублённый A-E). Этот файл — рабочий чеклист марафона фиксов.
Статусы: `[ ]` не начато · `[x]` сделано · `[~]` частично / решение принято.

**Жёсткие правила марафона:**
- `git push` — ТОЛЬКО после явного «да» пользователя (спросить один раз в конце).
- НИКОГДА не делать тестовых INSERT в `project_messages` — триггер шлёт реальные сообщения клиентам.
- Карантин (мессенджер/email/mtproto) трогать РАЗРЕШЕНО пользователем (2026-06-12), но каждую правку — фиксировать в `messenger-ledger.md`, финальный живой смок-тест TG — попросить пользователя.
- Миграции применять через MCP `apply_migration` (не db push — есть дрейф старых миграций), файлы класть в `supabase/migrations/`.
- Перед REVOKE каждой функции — проверить call-sites фронта (grep) и trigger-цепочки (SECURITY INVOKER триггер, зовущий функцию, требует EXECUTE у вызывающей роли!).

**Принятые решения по 4 открытым вопросам (полномочия от пользователя 2026-06-12):**
1. Карантин — трогаем (мёртвые файлы, email-internal-send, handleInbound механический split, dispatch_scheduled_messages is_deleted).
2. docbuilder — закрыть SELECT на docbuilder_app_settings до docbuilder_is_admin() ПОСЛЕ read-only проверки, что старое приложение работает от админов (docbuilder_allowed_users — 2 строки). Если есть риск сломать — ограничиться выносом ключей из jsonb невозможно (не наш код) → тогда закрыть до is_admin и зафиксировать откат-план.
3. Аватары клиентов (participant-avatars public) — ПРИНЯТЬ РИСК: перебор требует workspace_id + uuid (двойной uuid, неперечислимо), полный signed-URL рефакторинг задевает карантинный пайплайн аватаров непропорционально угрозе. Зафиксировать решение в data-model.md + feature-backlog.
4. bp-* сироты — исходники тянуть в этот репо неправильно (проект bp-create). Через mcp get_edge_function посмотреть bp-fetch-image / bp-generate-block; если те же дыры (SSRF, env-ключ) — пропатчить и редеплоить их код напрямую; задокументировать. Вынос в отдельный Supabase-проект — НЕ делаем (большая инфра-работа, отдельная задача).

---

## Этап 1 — Критическая безопасность БД и Storage 🔴

### 1.1 REVOKE-пакет (миграция `20260612_revoke_anon_security_definer.sql`)
- [x] Перед применением: grep фронта по каждой функции блока 1 (что НЕ зовётся клиентом напрямую); проверить prosecdef триггер-функций, зовущих dispatch_send_http (если INVOKER — authenticated нужен EXECUTE, тогда вместо REVOKE FROM authenticated — сделать вызывающий триггер DEFINER или оставить authenticated).
- [x] **Блок 1 — REVOKE FROM anon, authenticated (service_role only):**
  - get/set/delete_workspace_api_key, get/set/delete_workspace_google_api_key, get/set/delete_workspace_voyageai_api_key (9 шт, Vault)
  - dispatch_send_http(text, jsonb, uuid, text) — ⚠️ проверить trigger-цепочку до revoke от authenticated
  - revoke_all_user_sessions(uuid)
  - add_document_version_service, fill_slot_atomic_service
  - route_incoming_to_project, match_inbound_email, resolve_inbound_email_address, find_or_create_contact_participant, append_telegram_message_id
- [x] **Блок 2 — REVOKE FROM anon (authenticated остаётся):**
  - get_chat_state, get_current_document_file, get_document_file_history, add_document_version, restore_document_version, reorder_documents, add_message_pair, toggle_message_reaction, update_task_assignees, create_task_with_assignees, delete_status, convert_external_event_to_task, match_knowledge_chunks (+_by_articles, +_by_sources), upsert_knowledge_embeddings, get_accessible_projects, get_user_projects, get_workspace_threads, get_inbox_threads_v2, get_total_unread_count, get_sidebar_data, get_project_history, get_short_id_by_uuid, resolve_short_id
- [x] **Блок 3 — гигиена, REVOKE FROM anon:** get_personal_dialogs, merge_participants, merge_telegram_contact, fill_folder_slot, fill_slot_atomic, move_thread_to_project, set_my_preferred_language, end_impersonation_session
- [x] DROP FUNCTION debug_auth_context (отладочный мусор)
- [x] НЕ трогать: resolve_workspace_by_host, get_workspace_slug_by_id (middleware pre-auth, категория A), bool-хелперы RLS, триггерные функции
- [ ] Долгосрочно (этап 6): добавить auth.uid()-гейты внутрь функций категории C (revoke не закрывает межпользовательский вектор по p_user_id)

### 1.2 Storage-политики (миграция)
- [x] `message-attachments`: SELECT-политику переписать на workspace-фильтр по первому сегменту пути (эталон — бакет `files`: `((storage.foldername(name))[1])::uuid IN (SELECT workspace_id FROM participants WHERE user_id=auth.uid() ...)`)
- [x] `document-files`: то же (политика "Service role can read document-files" фактически открыта всем authenticated)
- [x] `document-templates`: то же (политика вообще без auth-проверки)
- [ ] Смок: после фикса проверить, что вложение из своего воркспейса скачивается (signed URL фронта работает — фронт качает через createSignedUrl? проверить путь фронта)

### 1.3 docbuilder_app_settings
- [x] Read-only проверка: кто в docbuilder_allowed_users, как docbuilder_is_admin() устроен
- [x] Закрыть SELECT `USING (true)` → `docbuilder_is_admin()`. Откат-план записать (CREATE POLICY обратно).

### 1.4 Ротация INTERNAL_FUNCTION_SECRET (⚠️ самое деликатное, делать последним в этапе)
- [x] Сгенерировать новый секрет (openssl rand -hex 32)
- [ ] `supabase secrets set INTERNAL_FUNCTION_SECRET=...` (+ повторный set при необходимости — gotcha про старое значение)
- [x] Обновить тело `dispatch_send_http` в БД (живое тело взять из БД! не из репо) — новый секрет в http_post header
- [x] VPS: обновить `INTERNAL_SECRET` в `/opt/clientcase/mtproto-service/.env` (НЕ перезатирая остальные переменные!) + `docker compose restart mtproto` (или up -d)
- [x] Проверить какие Edge Functions читают секрет (requireInternalSecret) — env подхватится сам, но по gotcha может понадобиться redeploy
- [x] Верификация БЕЗ реальных сообщений: вызвать telegram-send-message напрямую с новым секретом и несуществующим message_id → ожидаем не-401 (например 404/400 от нашего кода). Старый секрет → 401.
- [ ] Проверить net._http_response после первого реального исходящего (попросить пользователя в конце)

### 1.5 Контроль этапа
- [ ] Повторный get_advisors security — ERROR=0, anon-WARN существенно меньше
- [ ] Смок фронта: вход, список проектов, инбокс открывается, документы открываются, реакция ставится

---

## Этап 2 — Безопасность Edge Functions 🟠

- [ ] Удалить из прода + репо: `fix-cyrillic-storage-paths` (хардкод "fix-cyrillic-2026" в репо), `sandbox-test`
- [ ] `fetch-image/index.ts:10-19` — SSRF: allowlist (https only, блок приватных IP/redirect или хост-whitelist). Найти, откуда зовётся фронтом, чтобы понять легитимные хосты.
- [ ] `generate-block/index.ts:347-369` — добавить getUser + checkWorkspaceMembership, ключ per-workspace (как setupAiChat), убрать фолбэк на платформенный ANTHROPIC_API_KEY
- [ ] `google-calendar-sync/index.ts:228-233` — IDOR: при !isInternal всегда `.eq('owner_user_id', userId)` даже с calendar_id
- [ ] `google-oauth-exchange/index.ts:33` — не логировать tokenJson, только статус
- [ ] `email-internal-send/index.ts:64` (карантин): requireInternalSecret(req, true) — Bearer проверяется только по префиксу. Фикс: для фронт-пути реальный getUser + проверка участия в msg.workspace_id. Тот же паттерн в fetch-telegram-avatar:31 (менее критично — решить по месту).
- [ ] `email-track` — by design (пиксель), оставить, задокументировать
- [ ] `fetch-sheets` — низкий риск, оценить по месту (фикс-хост уже есть)
- [ ] `src/app/(app)/layout.tsx:23` — getSession() → getUser(). proxy.ts:424 — оценить (+1 запрос на навигацию; минимум — задокументировать решение)
- [ ] Удалить `src/components/auth/TechnicalAdminRoute.tsx` (+NEXT_PUBLIC_TECHNICAL_ADMIN_EMAILS из .env.example/доков, если больше нигде)
- [ ] bp-*: get_edge_function для bp-fetch-image, bp-generate-block → если те же дыры, пропатчить и задеплоить; задокументировать список сирот (setup-bot-menu, update-participant-email, bp-*)
- [ ] Деплой затронутых функций (verify_jwt флаги сохранить как было! google-calendar-sync деплоить с --no-verify-jwt, email-internal-send --no-verify-jwt)

---

## Этап 3 — Типы и кэш 🟠

- [ ] `src/services/api/inboxService.ts:121-255` — снять 6× `as never` (get_inbox_search_threads, get_inbox_message_status, get_inbox_thread_one, get_inbox_unread_threads, get_inbox_thread_aggregates, get_inbox_threads_page) — типы уже в database.ts. Смежно с мессенджером: tsc + тесты + смок инбокса.
- [ ] `useWorkspaceSidebarSettings.ts:34,72,108`, `usePinnedBoards.ts:66`, `usePinnedItemLists.ts:65` — убрать «фейковый клиент», типизированный from('workspace_sidebar_settings')
- [ ] `src/hooks/plan/planDb.ts:16`, `src/components/templates/useTemplateList.ts:34` — убрать нетипизированные обёртки (проверить таблицы в database.ts)
- [ ] `TaskPanel.tsx:261` — `as never` → `as ThreadAccentColor`
- [ ] `ItemListsPage/ThreadRow.tsx:29,32,70,92`, `ThreadTableView.tsx:56`, `ProjectTableView.tsx:53-59` — типизировать аргументы мутаций (убрать as never)
- [ ] Прочие as never без комментария: TemplateAccessPopover.tsx:124,184; useListMutations.ts:91,216; useSlotsEditorMutations.ts:67,101; ProjectAiChat.tsx:214; useCaseProfile.ts:53,55 — по месту: типизировать или через supabaseJson-хелпер
- [ ] Кэш-ключ `['project-templates', ws]` ×3 владельца: TemplateAccessPopover.tsx:68 → отдельный ключ (namesByWorkspace), CreateProjectDialog.tsx:45 + ProjectTemplatesContent.tsx:90 → единый shared-хук с одним queryFn/order
- [ ] Литеральные ключи → queryKeys/: ['case-profile'] (useCaseProfile.ts:18 + VisaSelectionTabContent.tsx:70), ['project-field-values'] (ProjectFieldsSection.tsx:38 ↔ forms.ts:39), wazzup-ключи (useWazzup.ts:37 + WazzupNumbersSection.tsx:40, +my-channels в инвалидацию мутаций каналов), ['participant','self'] + ['profile','tg-status'] (PersonalTelegramSection.tsx:30,48), ['project-contact-name'] (GoogleDriveSection.tsx:105), useTemplateList key-фабрики вместо строк, useParticipantsMutations локальный participantKeys
- [ ] `documentKitUI/store.ts:26-114` — resetState через initial-state экспорты слайсов (защита от рассинхрона)
- [ ] `contactCardStore` — close() при смене workspaceId
- [ ] Контроль: tsc --noEmit, lint, tests

---

## Этап 4 — Производительность 🟠

- [ ] tiptap из eager-графа:
  - TaskPanelTabContents.tsx: статический import TaskPanel → React.lazy (паттерн уже в TaskListView.tsx:44). Смок: открыть тред, отправить сообщение.
  - icon-only импорты getChatIconComponent из ChatSettingsDialog → EditChatDialog: TemplateItemsList.tsx:5, TimelineFeed.tsx:13, CreateThreadButtonGroup.tsx:21, ThreadTemplatesContent.tsx:22, SortableTemplateRow.tsx:15
  - Проверка: build + анализ манифестов (tiptap-чанк уходит из layout-цепочки)
- [ ] Виртуализация ThreadTableView (TableShell.tsx:112) через @tanstack/react-virtual (паттерн FolderSectionContent.tsx:46) + memo ThreadRow
- [ ] /tasks TaskListView — оценить виртуализацию по месту (строки уже memo, дорог mount)
- [ ] cron-джоб очистки: `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'` ежедневно (cron.schedule)
- [ ] WorkspaceContext.tsx:70 — useMemo на value
- [ ] useFormSummary.ts:172 — clearTimeout в cleanup
- [ ] `_board_compile_condition` (20260611_board_server_side_filter.sql:136) — uuid not_equals с массивом → NOT IN / 'true' (живое тело из БД!)
- [ ] 🟡 опц: useTaskAssigneesMap → RPC get_assignees_for_workspace (отложить, зафиксировать в feature-backlog)
- [ ] 🟡 block-gap-inserter.tsx:199 — хрупкий cleanup; зафиксировать как осознанный риск (комментарий), ref-counting при следующей правке tiptap-зоны

---

## Этап 5 — Мёртвый код и дубли

### Удаления (каждое — перепроверить grep'ом по имени символа перед удалением)
- [ ] Кластер PersonalDialogs: page-components/PersonalDialogsPage/{index,parts}.tsx, hooks/messenger/usePersonalDialogs.ts (карантин), hooks/messenger/useMoveThreadToProject.ts (карантин), services/api/personalDialogsService.ts
- [ ] shadcn-сироты: ui/sidebar.tsx (742), ui/sheet.tsx, ui/page-header.tsx, hooks/use-mobile.ts
- [ ] BoardPage: page-components/BoardPage/index.tsx; useBoardDetail из useBoardQuery.ts (useBoardLists оставить!)
- [ ] Карантинные мёртвые (одобрено): messenger/ChatAccessDialog.tsx, QuotePopup.tsx, ChatSettingsDeadlinePicker.tsx, ChatTabItem.tsx, CreateThreadPopover.tsx, hooks/messenger/useCurrentParticipant.ts, useMessengerPanelData.ts; useInbox.ts: useInboxThreadsInfinite, useUnreadReactionCount, useUnreadReactionEmoji, useProjectUnreadCounts; EditChatDialog: мёртвый компонент EditChatDialog (хелперы оставить! ⚠️ этап 4 переводит импорты НА этот файл); ReactionPicker (REACTIONS оставить)
- [ ] Прочие: TechnicalAdminRoute (этап 2), boards/BoardCard.tsx, boards/CardFieldStylePopover.tsx, providers/RouteProviders.tsx, tasks/TaskDialog.tsx (⚠️ поправить ссылку в audit-false-positives.md), tasks/useTaskPanelSetup.ts, hooks/plan/useUpdateSlotDeadline.ts, KnowledgeBasePage/components/TagFilterBar.tsx, Documents/CreateDriveFoldersDialogParts.tsx, styles/design-tokens.ts
- [ ] Мёртвые хуки в живых файлах: useWorkspaceProjects (тип BoardProject оставить), RolesDirectory-обёртка, useItemList, getErrorMessage (lib/utils.ts:8), 10 типов в edgeContracts.ts — НО сначала этап 3 мог их подключить; сверить
- [ ] Barrel-файлы: components/{directories,messenger,permissions,projects,tasks,templates,WorkspaceSidebar}/index.ts, contexts/index.ts, hooks/{dialogs,forms}/index.ts, page-components/ProjectPage/constants/index.ts, services/api/{,documents/,forms/,knowledge/,messenger/}index.ts, utils/{files,format}/index.ts
- [ ] Осиротевшие типы: TimelineFilterState (history.ts:46), PlanBlockInsert (plan.ts:31), StaffRole + 4 keyof-хелпера (permissions.ts), CustomDirectoryEntryInsert/ValueInsert (customDirectories.ts)
- [ ] @types/dompurify — npm uninstall
- [ ] Цикл TemplateAccessPopover ↔ TemplateAccessButton: 4 потребителя на прямой импорт, реэкспорт удалить
- [ ] После всех удалений: build + tests + lint

### Унификации (низкий риск)
- [ ] usePinnedBoards ↔ usePinnedItemLists → фабрика usePinnedSlots (заодно уходит as unknown из этапа 3 — координировать)
- [ ] ThreadTemplatesContent ↔ ProjectTemplateThreadList → useThreadTemplateMutations({invalidate, insertExtras})
- [ ] Утилиты: diffDaysFromToday (deadlineUtils.ts:177,202 + dateFormat.ts:59,83), formatBadgeCount (inboxUnread.ts:134 + sidebarSettings.ts:477), plural → src/utils/ (+AssigneesPopover.tsx:389), escapeHtml ×3 (resend-webhook/parsing.ts:27, printArticle.ts:187, ProjectFlatPlanList.tsx:46)
- [ ] DocumentsContext.tsx — props = ContextValue & {children} (5-кратное перечисление полей)
- [ ] 🟡 отложенные (feature-backlog, НЕ в марафоне): финсправочники ×3 → DirectoryCrudTable, дерево групп QuickReply↔Knowledge, ManageGroupsDialog↔ManageTagsDialog, RowHoverActions, useProjectPlan↔useTemplatePlan, BoardTab↔ItemListTab, DraggableBoardRow, TemplateAccessBadge/Button хук, SelectOptionRow, ContextTextDialog↔AddTextDialog

---

## Этап 6 — Структура

- [ ] CreateProjectDialog (500): handleSubmit-движок → src/services/projects/createProjectFromTemplate.ts + vitest-тест; перевод модалки на shadcn Dialog (проверить вложенные поповеры)
- [ ] ProjectTemplateThreadList (517): мутации → useProjectTemplateThreadListMutations.ts, SortableContentRow → отдельный файл
- [ ] ProjectTemplateStatusesSection (416): 5 мутаций → useTemplateStatusesMutations
- [ ] CreateDriveFoldersDialog (504): useDriveFoldersWizard + 3 view-компонента
- [ ] FormsTabContent (418): useBriefSheetActions (смок: создать/подключить/отвязать бриф — Google Sheets)
- [ ] handleInbound (inbound.ts:20, 446 строк, карантин одобрен): механический split на функции без изменения логики, tsc+tests
- [ ] Инверсия слоёв (14 импортов): Documents-модуль → components/documents/ (3 потребителя), moduleRegistry+useProjectModules → lib/ или components/projects/, useParticipantsMutations → hooks/permissions/ (дока уже ссылается туда!), useProjectTemplatesQuery → hooks/, ItemListsPage/columns → components/itemLists/, useProjectMutations → hooks/projects/
- [ ] 26 RPC без исходников → партии миграций-фиксаций (живые тела из БД через pg_get_functiondef; список: resolve_short_id, log_audit_action, get_workspaces_with_counts, get_inbox_message_status, merge_telegram_contact, reorder_documents, reorder_board_list_items, swap_board_list_sort_order, copy_thread_template, copy_form_template, delete_status, create_status_with_button_label, update_status_with_button_label, generate_chat_link_code, create_article_*, update_article_*, *_version*, update_qa_*, set/delete_workspace_voyageai_api_key и др. — полный список собрать заново из database.ts vs migrations)
- [ ] dispatch_scheduled_messages (20260520:194) — добавить проверку is_deleted треда (карантин одобрен; живое тело из БД)
- [ ] Пограничные распилы (только по пути): TaskListView → useTaskListData, SidebarGlobalSearch → useSearchRows, SlotsEditor → useSlotsEditorData

---

## Этап 7 — Документация и финал

- [ ] docs/bugs/README.md — дописать 2 строки (2026-05-27-telegram-lost-attachments, 2026-05-28-telegram-send-stuck-pending)
- [ ] data-model.md: momentLocalizer → dateFnsLocalizer; путь ItemListPage → ItemListsPage; useParticipantsMutations путь (закроется переездом этапа 6); зафиксировать решение по participant-avatars (принят риск)
- [ ] gotchas.md + infrastructure.md: react-hook-form/zod удалены из deps
- [ ] channels.md + data-model.md: PersonalDialogs-страница теперь redirect; Bearer-нюанс в матрице авторизации (*-send: Bearer не аутентифицирует при verify_jwt=false)
- [ ] audit-false-positives.md: убрать ссылку на удалённый TaskDialog.tsx (если удалён)
- [ ] messenger-ledger.md: записи о ротации секрета, REVOKE, всех карантинных правках (мёртвые файлы, email-internal-send, handleInbound, dispatch_scheduled_messages)
- [ ] 18 FK-индексов — гигиеническая миграция (закрыть advisors-warn)
- [ ] 9 функций function_search_path_mutable (set_initial_send_status, today_madrid_midnight, _board_*, tg_update_inbox_sort_at_*) — SET search_path
- [ ] feature-backlog: отложенные унификации (этап 5), useTaskAssigneesMap RPC, workspaces SELECT сузить до участников, gotcha про uq_telegram_dedup-пару индексов (проверить отдельной задачей), bp-* вынос в отдельный проект
- [ ] Финальный контроль: lint + tests + build, tsc, повторный advisors (security+performance)
- [ ] Итоговый отчёт пользователю + запрос «да» на push + просьба прислать 1 живое сообщение в TG для смок-теста

---

## Лог выполнения

### 2026-06-12 — Этап 1 ✅ ЗАВЕРШЁН
- **1.1 REVOKE** — миграции `20260612_security_revoke_anon_and_api_key_gates` + `20260612_security_revoke_anon_public_grant_fix` применены в прод. Грабли: REVOKE FROM anon не работает при PUBLIC-гранте — нужно снимать PUBLIC и возвращать явные GRANT. Блок 1 (12 функций) → service_role only; блоки 2/3 (~45) → authenticated only. Гейт owner/manage_workspace_settings добавлен внутрь 6 функций set/delete_*_api_key (фронт зовёт их напрямую — E1-агент ошибался про «только Edge»). resend-webhook работает на service-клиенте — проверено. Вся триггер-цепочка отправки SECURITY DEFINER — REVOKE dispatch_send_http безопасен. debug_auth_context дропнут. Верифицировано: anon=false везде кроме resolve_workspace_by_host / get_workspace_slug_by_id (by design).
- **1.2 Storage** — миграция `20260612_storage_workspace_scoped_policies` применена. Все 3 бакета на workspace-фильтре. Проверено по данным: 100% объектов с папками имеют ws-uuid первым сегментом (1 тестовый файл в корне message-attachments остался виден только service_role).
- **1.3 docbuilder** — `20260612_docbuilder_app_settings_restrict_select`: SELECT сужен до участников docbuilder_allowed_users (2 юзера, вкл. не-админа — поэтому не is_admin). Откат-план в миграции.
- **1.4 Ротация секрета** — старый `ad0fe058…` был закоммичен в `20260525_convert_external_event_assignee.sql` (репо на GitHub) → скомпрометирован. Новый: `supabase secrets set` → env подхватился автоматически без redeploy; обновлены 3 БД-функции с хардкодом (dispatch_send_http, notify_google_calendar_mirror, convert_external_event_to_task) через execute_sql (новый секрет в репо НЕ коммитим); VPS mtproto-service/.env обновлён sed'ом (бэкап .env.bak-20260612), контейнер пересоздан, сессия восстановилась. Верификация: новый секрет → 400 "Missing field: content" (наш код), старый → 401. ⚠️ Эти 3 функции теперь драфтят от репо ещё сильнее — учесть в этапе 6 (фиксация RPC).
- **1.5** — финальный advisors-прогон и живой смок TG отложены на этап 7 (по плану).

### 2026-06-13 — Этап 2 ✅ + Этап 3 ✅
- **Этап 2 (Edge):** fix-cyrillic + sandbox-test удалены (прод+репо). fetch-image — SSRF-защита. generate-block/translate-block — убран env-фолбэк AI-ключа (вкл. bp-* копии в общей Supabase). google-calendar-sync — IDOR-фильтр владельца. google-oauth-exchange — не логируем токен. email-internal-send + fetch-telegram-avatar — настоящий getUser вместо Bearer-префикса (карантин). (app)/layout.tsx — getUser. TechnicalAdminRoute удалён. setup-bot-menu удалена из прода (исходник в репо). update-participant-email — исходник сироты забран в репо. Деплои с корректными verify_jwt.
- **Этап 3 (типы/кэш):** все as never/фейк-клиенты сняты или задокументированы (динамические union'ы); ['project-templates', ws] разведён на namesByWorkspace vs listByWorkspace; литералы ключей → queryKeys/ (caseProfile, fieldDefinition.projectValuesAll, wazzup, profileSection); wazzup +myChannels инвалидация; usePinnedSlots (дубль); documentKitUI resetState через initial-стейты; contactCardStore.close при смене ws. tsc+lint+700 тестов зелёные.

### 2026-06-13 — Этапы 4-7 ✅ МАРАФОН ЗАВЕРШЁН
- **Этап 4 (перф):** tiptap из eager-графа (lazy TaskPanel + chatVisuals вынос, EditChatDialog удалён); memo ThreadRow + стабильные колбэки (+ найден реальный баг taskId→threadId под as never); cron-ретенция job_run_details; useMemo WorkspaceContext; clearTimeout useFormSummary; фикс uuid not_equals в _board_compile_condition.
- **Этап 5 (мёртвый код):** ~2.5к строк удалено (PersonalDialogs-кластер, shadcn-сироты, 18 barrel'ов, мёртвые компоненты/хуки/типы), разорван цикл TemplateAccess, @types/dompurify.
- **Этап 6 (структура):** CreateProjectDialog распилен (движок → сервис + 4 теста), useParticipantsMutations → hooks/permissions, 26 дрейфанувших RPC зафиксированы файлом, dispatch_scheduled_messages +is_deleted, REVOKE anon get_workspaces_with_counts.
- **Этап 7 (доки/гигиена):** 18 FK-индексов + search_path на 9 функций (applied); типы регенерированы; доки обновлены (bugs README, dateFnsLocalizer, react-hook-form/zod, PersonalDialogs redirect, Bearer-нюанс); feature-backlog отложенных пунктов; ledger.
- **Контроль:** lint 0, 704 теста зелёные, build OK, tsc 0. **Повторный advisors: 0 ERROR**, search_path-warn 9→0, anon-SECURITY DEFINER 159→100 (остаток — RLS-хелперы + триггеры by design). Опасные функции (Vault-ключи, сессии, данные-по-параметру, dispatch) закрыты.
- **Осталось вручную:** живой смок-тест TG (1 сообщение) — попросить пользователя; `supabase db push` НЕ нужен (всё применено через MCP); git push — по «да» пользователя.

### 2026-06-13 — ПОВТОРНЫЙ АУДИТ (4 агента с нуля) + фиксы
Запущен по просьбе пользователя после марафона. Фиксы держатся (Edge 8/8 ✅, REVOKE ✅, Storage ✅, секрет ✅, search_path ✅, фронт-безопасность ✅). Но реаудит нашёл то, что марафон пропустил:
- 🔴 **РЕГРЕССИЯ (критично):** 34 anon-доступных SECURITY DEFINER функции с остаточным PUBLIC-грантом (этап 1 закрыл только enumeration E1-агента; функции из board-фильтра 20260611 и др. остались открыты anon) → IDOR к тредам/проектам/доскам любого воркспейса + инъекция аудит-логов. **Закрыто:** REVOKE PUBLIC+anon у всех (осталось 2 pre-auth). +auth.uid()-гейт в get_board_filtered_threads/projects/get_workspace_boards (межпользовательский IDOR). Контроль: dangerous_anon_secdef = 2 (только pre-auth).
- 🟠 **кэш namesByWorkspace недоведён:** этап 3 развёл ключ, но 2 консьюмера (useProjectTemplatesQuery, ProjectPage) остались на listByWorkspace с partial-select + CRUD не инвалидировал namesByWorkspace. **Закрыто:** оба на namesByWorkspace, useTemplateList → broad-префикс инвалидации.
- 🟡 update-participant-email CORS-wildcard → corsHeadersFor; 3 файла-сироты от распилов удалены.
- **Новый код марафона** (createProjectFromTemplate, chatVisuals, usePinnedSlots, resetState, ThreadRow, inboxService) — ревизован построчно, эквивалентен оригиналам, регрессий нет (кроме найденного класса выше). Подтверждён реальный баг, который МЫ ПОЧИНИЛИ в марафоне: taskId→threadId под as never (статус/дедлайн из таблицы списков не сохранялись).
- **Урок:** REVOKE-волну надо было строить из ЖИВОГО списка `has_function_privilege('anon', oid, 'execute')`, а не из enumeration агента — иначе функции из свежих миграций (за день до аудита) выпадают. Грабля «PUBLIC-грант переживает REVOKE FROM anon» сработала повторно.
