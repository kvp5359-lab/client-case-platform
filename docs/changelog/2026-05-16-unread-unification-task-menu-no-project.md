# Унификация unread/read, единое меню задачи, «Без проекта» как виртуальный проект

**Дата:** 2026-05-16
**Тип:** refactor (large) + feature (medium × 2) + fix (small × 7)
**Статус:** completed

---

## Контекст

Накопилось три темы, которые тянули друг друга и потому пошли одним выпуском:

1. **Read/unread** в мессенджере жил в трёх параллельных RPC/кэшах. Бейдж списка «Входящие» считал по одной формуле, кнопка «Прочитано/Непрочитано» в чате — по другой, красные контуры у бабблов — по третьей. После reload они расходились: контур «всё прочитано», а кнопка показывает «Прочитано» (т. е. ещё непрочитано). Плюс клик `✓✓` из колонки доски не персистился и личные диалоги (project_id=NULL) молча игнорировались.
2. **Трёхточечное меню задачи** жило inline в одном месте (`TaskRow`). При попытке добавить меню в другие точки (доски, шапка боковой панели) тянулось дублирование, и было невозможно расширить набор пунктов разом везде.
3. **«Личные диалоги»** в сайдбаре висели закреплённым nav-пунктом в шапке списка и вели на чисто-мессенджерную страницу. Пользователь предложил перенести запись в **список проектов** под названием «Без проекта», сортировать вместе с проектами по непрочитанности и активности, кликом открывать страницу «Задачи» с включённым фильтром (смешанный вид: чаты + задачи без проекта).

Заодно подобраны мелкие фиксы (TG-служебные сообщения в «Истории», пустые параграфы в переводе email, баг с инвалидацией task-колонок на досках, drop вкладки на разделитель в боковой панели и пр.) — описаны в конце.

## Главное 1: единый источник правды для unread/read (inbox v2)

### Что было

Три параллельных запроса, каждый со своей формулой:

- **Бейдж в списке «Входящие»** — поля `unread_count`, `manually_unread`, `unread_event_count`, `has_unread_reaction` из RPC `get_inbox_threads_v2` (получаются одним батчем по всем тредам).
- **Кнопка «Прочитано/Непрочитано»** в шапке чата — `useUnreadCount` через отдельный RPC `get_unread_messages_count`. `showUnread = unreadCount > 0 || isManuallyUnread || hasUnreadReaction || unreadEventCount > 0`.
- **Красный контур у баббла** — `useLastReadAt` через select из `message_read_status` (отдельный запрос per-thread), сравнение с `created_at` каждого сообщения.

Два пути «отметить прочитанным» — кнопка в чате через `useMarkAsRead` (правильно патчит все три кэша) и клик `✓✓` в списке через локальные мутации `BoardInboxList`/`InboxPage` (патчили только `inboxKeys.threads` и `unreadCountByThreadId`, **не трогали `lastReadAtByThreadId`**) — отсюда баг «контур у бабблов остался после клика ✓✓». Плюс мутации списка делали `if (!chat.project_id) return` — личные диалоги вообще не отмечались на стороне БД (только оптимистично гасли в кэше, на reload возвращались).

После reload RPC `get_unread_messages_count` и `unread_event_count` из inbox v2 могли разойтись (например, audit-события считаются unread в inbox v2, но не подсвечивают баблы) — и кнопка показывала «Прочитано», а контуры пропали.

### Что сделано

**SQL** — миграция [`20260516_inbox_v2_add_last_read_at.sql`](../../supabase/migrations/20260516_inbox_v2_add_last_read_at.sql). RPC `get_inbox_threads_v2` теперь возвращает дополнительную колонку `last_read_at timestamptz` (значение и так было в CTE `manual_unread`, просто не было в `SELECT`). **Применена на проде** через MCP в момент рефакторинга.

**Хуки чтения** ([`useUnreadCount.ts`](../../src/hooks/messenger/useUnreadCount.ts)) переписаны как тонкие селекторы поверх `useInboxThreadsV2`:

```ts
export function useUnreadCount(workspaceId: string, threadId: string | undefined) {
  const query = useInboxThreadsV2(workspaceId)
  const value = threadId
    ? query.data?.find((t) => t.thread_id === threadId)?.unread_count ?? 0
    : 0
  return { ...query, data: value }
}
```

Сигнатура упрощена: `projectId`, `channel`, `participantId` параметры удалены за ненадобностью — всё уже посчитано в RPC. Колл-сайты ([`useMessengerState`](../../src/components/messenger/hooks/useMessengerState.ts), [`useMessengerPanelData`](../../src/hooks/messenger/useMessengerPanelData.ts)) обновлены на `(workspaceId, threadId)`.

**Мутации патча** ([`useUnreadCount.ts`](../../src/hooks/messenger/useUnreadCount.ts)) вынесены в общие helper'ы:

- `patchCachesForMarkRead(qc, { threadId, projectId?, workspaceId? })` — pure-патчер: ставит `unreadCount=0`, `lastReadAt=now`, патчит строку в `inboxKeys.threads(workspaceId)`. Без инвалидаций.
- `patchCachesForMarkUnread` — зеркало.
- `applyOptimisticMarkRead`/`applyOptimisticMarkUnread` — те же patch + инвалидации (для `useMarkAsRead`/`useMarkAsUnread` хуков, вызываются в `onSuccess` после upsert).

**Список** ([`BoardInboxList.tsx`](../../src/components/boards/BoardInboxList.tsx), [`InboxPage/index.tsx`](../../src/page-components/InboxPage/index.tsx)):

- Убран early-return `if (!chat.project_id) return` — добавлен fallback на workspace-уровневого участника через `getCurrentWorkspaceParticipant`. Личные диалоги теперь корректно отмечаются прочитанными.
- В `onMutate` зовётся `patchCachesForMarkRead/Unread` (мгновенный визуальный отклик во всех трёх кэшах), в `onSuccess` — `invalidateMessengerCaches` (синхронизация с БД; если upsert почему-то не записал — бейдж сразу вернётся, а не на reload).
- В `onError` — rollback prev-снимка кэша + toast с реальной ошибкой (раньше silent fail маскировался до полного reload).

**useChatState** больше не сидирует `unreadCountByThreadId`/`lastReadAtByThreadId` — эти кэши никем не читаются. RPC `get_chat_state` пока продолжает возвращать поля для обратной совместимости; упростим следующим рефакторингом.

### Результат

Бейдж списка, кнопка в чате, красный контур баббла — читают **одну строку** из `inboxKeys.threads(workspaceId)`. Расхождение физически невозможно.

## Главное 2: единое меню действий + поле «Меню» в карточке списка

### Что было

Трёхточечное `⋮` меню задачи (Открыть/Удалить) жило inline в `TaskRow`. Любая попытка добавить меню в другие точки тянула дублирование. Расширить набор разом везде было невозможно.

### Что сделано

**Новый компонент** [`TaskActionsMenu.tsx`](../../src/components/tasks/TaskActionsMenu.tsx) — единый источник правды. Принимает `task` + handlers, сам рендерит триггер + dropdown. Каждый пункт показывается только если передан соответствующий handler.

Состав меню (4 действия, было 2):

- **Открыть** → `onOpen`.
- **Сменить статус** → подменю с radio-list по statuses + «Сбросить статус».
- **Изменить дедлайн** → подменю с встроенным `<Calendar>` + «Очистить срок».
- **Удалить** (destructive) → `onRequestDelete`.

Использование в трёх точках UI:

1. **`TaskRow`** ([`TaskRow.tsx`](../../src/components/tasks/TaskRow.tsx)) — inline-меню заменено на `TaskActionsMenu` с `triggerClassName="opacity-0 group-hover/row:opacity-100"`. Меню стало 4-пунктовым на странице «Задачи».
2. **Поле `menu` в карточке** ([`BoardTaskRow.tsx`](../../src/components/boards/BoardTaskRow.tsx)) — новый `CardFieldId` `'menu'` в [`types.ts`](../../src/components/boards/types.ts) и [`CARD_FIELD_DEFS`](../../src/components/boards/listSettingsConfigs.ts) (только для `entity_type='thread'`). В настройках карточки списка/доски появилась карточка «Меню» — драгом ставится в любую строку. Превью карточки ([`CardLayoutPreview.tsx`](../../src/components/boards/CardLayoutPreview.tsx)) показывает иконку `⋮`. `onDeleteTask`/`onDeadlineChange` прокинуты по цепочке `BoardTabContent → BoardView → BoardColumn → BoardListCard → DraggableBoardTaskRow → BoardTaskRow`.
3. **Шапка треда** ([`TaskPanelTaskHeader.tsx`](../../src/components/tasks/TaskPanelTaskHeader.tsx)) — после дедлайна. На корне `group/panel-header`, в кнопке `opacity-0 group-hover/panel-header:opacity-100`. Пункт «Открыть» убран (тред уже открыт в панели). Прокинуто через `TaskPanel` от `TaskPanelTabContents.ThreadTabContent`, который подключает `useDeleteThread` + `confirm`-диалог + `onClose()` после успеха.

**Гейтинг «Удалить»** — пункт виден только владельцу воркспейса. До этого `onRequestDelete` передавался всем подряд: RLS пускала мягкое удаление (UPDATE `is_deleted=true`) любому с доступом к треду, и клиенты могли реально удалить чужие задачи. Гейтим через `useWorkspacePermissions({ workspaceId }).isOwner` в трёх точках (`TaskListView`, `BoardTabContent`, `TaskPanelTabContents`).

### Результат

При добавлении нового пункта в `TaskActionsMenu` он появится **во всех точках UI автоматически**. Меню больше не дублируется.

## Главное 3: «Без проекта» как виртуальный проект в сайдбаре

### Что было

В сайдбаре была закреплённая запись «Личные диалоги» (`nav:personal_dialogs`) над списком проектов, вела на `/personal-dialogs` — отдельную страницу с мессенджером, показывающую только чаты без `project_id`. Сортировка/группировка фиксированная (всегда вторая сверху), бейдж — счётчик непрочитанных личных диалогов.

Пользователь предложил перенести запись в **список проектов**, переименовать в «Без проекта» (отсутствие имени проекта — это уже «без проекта»), и сделать клик на неё ведущим на страницу `/tasks` с включённым фильтром «без проекта». Чтобы был смешанный вид: и чаты, и задачи без проекта вперемешку.

### Что сделано

**Сайдбар** ([`sidebarSettings.ts`](../../src/lib/sidebarSettings.ts)):

- Из реестра `SIDEBAR_NAV_ITEMS` и типа `SidebarNavKey` убран ключ `personal_dialogs`. `SIDEBAR_NAV_KEYS` и `DEFAULT_SIDEBAR_SLOTS` тоже без него.
- У существующих пользователей старая запись в `workspace_sidebar_settings.slots` автоматически отсеется нормализатором при чтении — `VALID_NAV_KEYS` теперь не содержит ключа, и `normalizeSidebarSlots` молча пропускает невалидный слот.

**Виртуальный проект** ([`WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx)):

- В массив `projects` подмешивается виртуальная запись с `id='__no_project__'` (= `NO_PROJECT_ID`, экспортируется из [`useTaskFilters.ts`](../../src/components/tasks/useTaskFilters.ts)), `name='Без проекта'`, `iconId='folder-minus'`. Новая иконка `FolderMinus` добавлена в реестр [`project-icons.tsx`](../../src/components/ui/project-icons.tsx).
- `useSidebarInboxCounts` ([`useFilteredInbox.ts`](../../src/hooks/messenger/useFilteredInbox.ts)) дополнительно возвращает `noProjectBadgeDisplay` (через тот же `getAggregateBadgeDisplay` что и обычные проекты) и `noProjectLastActivityAt`. Сайдбар регистрирует badge для виртуального id — `ProjectsList` корректно сортирует виртуала вместе с проектами (есть непрочитанные → всплывает наверх).
- `onProjectClick` для virtual id → `handleNavigate('tasks?filter=no_project')`. `activeProjectId` подсвечивает виртуала на странице `/tasks?filter=no_project`.

**Страница «Задачи»** ([`TasksPage/index.tsx`](../../src/page-components/TasksPage/index.tsx)):

- Читает `?filter=no_project` из URL → меняет h1 и pageTitle на «Без проекта».
- Передаёт `initialProjectFilterIds={new Set([NO_PROJECT_ID])}` и `initialPreset='all'` в `TaskListView` (новые опциональные опции в [`TaskListView`](../../src/components/tasks/TaskListView.tsx) и [`useTaskFilters`](../../src/components/tasks/useTaskFilters.ts)). Пресет `'all'` важен — иначе дефолтный `my_active` отсёк бы задачи где я не исполнитель/постановщик, что нелогично для этого вида.
- `useWorkspaceThreads` уже возвращает все треды любого типа (task/chat/email) — поэтому фильтр по `project_id === null` даёт смешанный вид.

**Плейсхолдер «· Без проекта»** в [`TaskRow.tsx`](../../src/components/tasks/TaskRow.tsx) убран. На странице «Без проекта» он избыточен (там и так все без проекта), на других экранах отсутствие имени проекта — само по себе достаточный сигнал. Span теперь рендерится только когда `task.project_name` действительно есть.

**Backward-compat** — старая страница `/personal-dialogs` ([`page.tsx`](../../src/app/(app)/workspaces/[workspaceId]/personal-dialogs/page.tsx)) превращена в редирект на `/tasks?filter=no_project`. Закладки и глубокие ссылки не ломаются.

## Фиксы

### TG-служебные сообщения в «Истории» (`15b184c`)

Сообщения с `source='telegram_service'` (добавил/удалил/переименовал участника) в боковой панели «История» рендерились большими баблами `MessageBubble`. В чате (`MessageList`) для них есть отдельная ветка `ServiceMessage`, в `TimelineFeed` — не было.

Вынес `ServiceMessage` из `MessageList` в отдельный файл [`ServiceMessage.tsx`](../../src/components/messenger/ServiceMessage.tsx), добавил optional `onDelete`-колбэк. Кнопка `×` появляется по hover, доступна владельцу воркспейса (RLS на стороне БД уже гейтит — клиентский гейт это UX-удобство). В `MessageList` дублирование убрано.

### Пустые параграфы в переводе email (`e2fb64d`)

Email-HTML содержит декоративные пустые `<p>&nbsp;</p>`, table-cells и inline-`<img>`. После `htmlToPlain` в `translate-message` edge function оставались строки только из пробелов, LLM сохранял их как «параграфы», и в выводе `plainToSimpleHtml` рисовались пустые `<p></p>` — визуально это широкие «дыры» в баббле перевода.

Фикс: в `htmlToPlain` whitespace-only строки превращаются в пустые перед `\n{3,}/g, "\n\n"` collapse'ом; в `plainToSimpleHtml` после split тримим и фильтруем пустые. Edge function задеплоена.

### Boards: задача появлялась только после reload (`540d992`)

`useCreateThread`/`useDeleteThread` инвалидировали `workspaceTaskKeys.byWorkspace` (префикс `'workspace-tasks'`) — мёртвый ключ, никто из read-хуков его не использует. Реальный кэш `useWorkspaceThreads` (источник «Мои задачи» и task-колонок) живёт под `workspaceThreadKeys.forUser` (префикс `'workspace-threads'`). Разные префиксы → invalidate в молоко.

Добавил `workspaceThreadKeys.workspace(workspaceId)` во всех точках мутаций тредов: `useCreateThread`, `useDeleteThread`, `useChatSettingsMutations.updateProjectMutation`, `useTrash.useRestoreThread`.

### Right-padding вкладок боковой панели (`085f61e`)

В [`TaskPanelTabBar`](../../src/components/tasks/TaskPanelTabBar.tsx) текст не-pinned вкладок упирался в правый край (`pr-0.5` экономило место под абсолютно-позиционированный крестик/бейдж). Сменили на `pr-2` — симметрично с `pl-2`, текст «дышит». Truncate отрабатывает как раньше.

### Drop вкладки на разделитель (`1fc470a`)

В [`TaskPanelTabBar.handleDragEnd`](../../src/components/tasks/TaskPanelTabBar.tsx) специальная ветка для `oid === SEPARATOR_ID` сохраняла исходный `pinned` (вкладка «отпружинивала» обратно в свою зону). Пользователь намеренно тащил через границу, ожидая поменять зону.

Теперь drop на разделитель **инвертирует** `pinned`: unpinned → закрепляется (в конец pinned), pinned → раскрепляется (в начало unpinned). Через collision detection `pointerWithin` drop на pinned-вкладку слева от разделителя по-прежнему работает обычным путём (`arrayMove` без перехода через `SEPARATOR_ID`).

### Tiptap-редактор для project-context заметок (`b0cd92f`)

Текстовые записи в «Контексте проекта» теперь редактируются полноценным `TiptapEditor` (тот же, что у статей знаний) — заголовки, списки, картинки, форматирование. До этого был plain-textarea, форматирование терялось.

## Деплой

- **Миграция БД** `20260516_inbox_v2_add_last_read_at.sql` — применена на прод через MCP в момент рефакторинга, до пуша.
- **Edge function `translate-message`** — задеплоена напрямую через `supabase functions deploy`.
- **Фронт** — этим коммитом, через стандартный CI/CD pipeline (GitHub Actions → GHCR → blue/green на VPS).

## Что осталось на будущее

- **`get_chat_state` RPC** — сейчас всё ещё возвращает `unreadCount`/`lastReadAt`, которые не используются на фронте. Чистить — отдельным рефакторингом.
- **`workspaceTaskKeys.byWorkspace`** — мёртвый ключ, никто не читает. Удалить вместе с инвалидациями в следующем проходе.
- **«Без проекта» в карточном виде** — поле `menu` пока только для `entity_type='thread'`. Для проектов кнопка осталась inline и не унифицирована — но проектов в досочной структуре меньше, приоритет ниже.
- **`onActiveTab` в шаблоне проекта** для сеялки дефолтных вкладок — не реализовано (см. предыдущий changelog).
