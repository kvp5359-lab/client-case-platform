# Кнопка ассистента в действиях с документами + фиксы плавающей панели

**Дата:** 2026-05-14
**Тип:** feature (medium) + fix (small)
**Статус:** completed

---

## Контекст

Когда работаешь с документами проекта (особенно крупными или несколькими сразу), часто нужно «перекинуть их в ассистента» — задать вопрос по содержимому, уточнить детали, попросить выжимку. Раньше это работало через старую боковую панель (`useSidePanelStore.panelTab`), но после миграции на новую табовую систему (`useTaskPanelTabs`) вызов `openAssistantWithDocuments` стал no-op: документы клались в `pendingAiDocuments`, но вкладка «Ассистент» в правой панели не открывалась — старый стор больше никто не слушал. Сделали мост: новый `openSystemTab` в API правой панели + везде, где раньше дёргали старый стор, теперь дополнительно открываем вкладку через новую систему.

Заодно починили плавающую панель пакетных действий с документами (она уезжала под правую панель и была на её слое) и добавили в неё кнопку «Открыть в ассистенте». Плюс мелкий баг с источниками ассистента — раньше нельзя было снять галочку «Все чаты проекта», теперь работает как toggle.

## Главное: открытие вкладки «Ассистент» из действий с документами

### Что появилось у юзера

1. **Иконка `Bot` в плавающей панели пакетных действий** ([FloatingBatchActions](../../src/components/documents/FloatingBatchActions.tsx)) — фиолетовая, слева от X. Клик при выбранных документах → правая панель открывается на вкладке «Ассистент», все выбранные документы автоматически прикреплены к новому диалогу. Раньше `SendToChatButton` показывал «Ассистент», только если ассистент уже был активной вкладкой — теперь кнопка всегда доступна.
2. **Иконка `Bot` в диалоге «Параметры документа»** ([EditDocumentDialog](../../src/components/projects/DocumentKitsTab/dialogs/EditDocumentDialog.tsx)) — жёлтая, сгруппирована с «Проверить документ» (выглядит как button group, белый разделитель). Клик → ассистент открывается с этим одним документом. Кнопка доступна только когда у документа есть `text_content` (распознанный текст).
3. **Не-модальный режим диалога при работе с ассистентом**. По клику Bot в диалоге включается локальный флаг `assistantMode`: затемнение пропадает, focus-trap снимается, body перестаёт блокироваться, диалог сдвигается влево (в центр свободной области между сайдбаром и правой панелью). Можно одновременно общаться с ассистентом и править поля документа. При закрытии диалога флаг сбрасывается — при следующем открытии снова обычный модальный режим с затемнением.

### Архитектура

**Главная инфраструктурная правка** — добавили `openSystemTab` в API правой панели:

- [`TaskPanelTabbedShellApi.openSystemTab(type, title)`](../../src/components/tasks/TaskPanelTabbedShell.tsx) — обёртка над `tabsOpenTab(buildSystemTab(...))` + `setHidden(false)` + `userInteractedRef.current = true` (чтобы scope-resolver из URL не дёргался). `type` сужен до `Exclude<TaskPanelTabType, 'thread' | 'tasks'>` — эти два требуют refId.
- Проброшен через [`TaskPanelContext`](../../src/components/tasks/TaskPanelContext.tsx) и [`WorkspaceLayout`](../../src/components/WorkspaceLayout.tsx).

**Точки вызова** — везде, где раньше дёргали только `useSidePanelStore.openAssistantWithDocuments`, теперь дополнительно зовём `layoutTaskPanel?.openSystemTab?.('assistant', 'Ассистент')`:

- [`useGlobalBatchActions.handleSendToChat('assistant')`](../../src/hooks/documents/useGlobalBatchActions.ts) — мультиселект документов (плавающая панель).
- [`useDocumentKitSetupConfigs.buildBatchActionsConfig.onOpenAIChat`](../../src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetupConfigs.ts) — старый поток DocumentKits (наборы документов в проекте), пакетные.
- [`useDocumentKitSetupConfigs.buildDialogsConfig.onOpenAIChat`](../../src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetupConfigs.ts) — DocumentKits, одиночный документ из диалога параметров.
- [`useDocumentsDialogsProps.handleOpenAIChat`](../../src/page-components/ProjectPage/components/Documents/hooks/useDocumentsDialogsProps.ts) — новая вкладка «Документы» проекта, одиночный документ. Раньше `onOpenAIChat` сюда вообще не пробрасывался, из-за этого жёлтая кнопка в диалоге не показывалась.

`buildDialogsConfig` и `buildBatchActionsConfig` теперь принимают опциональный `openAssistantTab` параметром (плоская функция — хуки внутри звать нельзя). [`useDocumentKitSetup`](../../src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetup.ts) — главный хук-оркестратор — зовёт `useLayoutTaskPanel()` и собирает callback из `openSystemTab`, пробрасывает в обе фабрики.

**`pendingAiDocuments` остался без изменений** — старый стор всё ещё используется как канал передачи документов от точки клика до AI-панели. AI-панель (`useProjectAiDocuments`) при маунте подхватывает `pendingAiDocuments` и прикрепляет их к диалогу. Эта часть не сломана, её не трогали.

### Не-модальный режим EditDocumentDialog

Решали трилемму: «диалог свойств модальный → перекрывает ассистента → пользователь не может с ним работать». Варианты:

- **Закрывать диалог по клику Bot** — пробовали в первом подходе, неудобно: пользователь идёт в ассистента ради уточнений *чтобы потом исправить параметры документа*, диалог нужен открытым.
- **Делать диалог всегда не-модальным, когда правая панель открыта** — слишком агрессивно: если ассистент был открыт по другому поводу (например, для другого проекта), параметры документа неожиданно теряют затемнение, что сбивает фокус.
- **Не-модальный режим по явному действию пользователя** ← остановились на этом.

Реализация: внутренний `useState<boolean>` `assistantMode`, выставляется в `true` в `onClick` Bot, сбрасывается при `open=false`. Когда `assistantMode === true`, рендерится через Radix-примитивы напрямую (`DialogPrimitive.Root modal={false}` + `DialogPrimitive.Content` без `DialogOverlay`) — shadcn-обёртка `DialogContent` всегда тащит за собой `<DialogOverlay />`, поэтому пришлось обойти. `onInteractOutside={preventDefault}` — чтобы клик в ассистента не закрыл диалог. Тело диалога вынесено в локальную функцию `renderBody()`, оба пути рендерят одно и то же.

Позиционирование сдвинутого диалога — `useLayoutEffect` + `ResizeObserver` на `.side-panel` (новая правая панель) и `[data-workspace-sidebar]` (левый сайдбар). Центр считается как `sidebarWidth + (innerWidth - sidebarWidth - sidePanelWidth) / 2`, применяется через inline `left: Npx; transform: translateX(-50%)`. Если рект ещё не измерен (`leftPx === null`) — `visibility: hidden`, чтобы не было вспышки в неправильной позиции.

## Сопутствующие фиксы

### 1. Плавающая панель пакетных действий: слой и центрирование

**Симптом**: при выделении нескольких документов плавающая панель «Выбрано документов: N» уезжала под правую панель (когда та была открыта) и центрировалась криво — даже если визуально не перекрывалась, сидела не в центре свободной области.

**Корни**:

- Z-index панели был `z-50` — ровно такой же, как у `.side-panel`. При одинаковом z-index выигрывает то, что отрендерилось позже в DOM, а правая панель монтируется через portal в `#workspace-panel-root` позже плавающей панели.
- Ширина правой панели в расчёте центра была захардкожена как `window.innerWidth * 0.45`, а реально у `.side-panel` `w-[50%] min-w-[360px]` (см. [globals.css](../../src/app/globals.css)). На широких экранах 45% ≠ 50%, на узких разрыв ещё больше из-за `min-width`.
- Ширина сайдбара бралась только из `localStorage.sidebarWidth` — если значения нет (свежий юзер) или сайдбар ресайзится без обновления стора, расчёт расходился с реальностью.

**Решение** ([FloatingBatchActions](../../src/components/documents/FloatingBatchActions.tsx)):

- Z-index `z-50` → `z-[60]` — гарантированно поверх `.side-panel`.
- Реальные размеры через `querySelector('.side-panel').getBoundingClientRect()` (когда панель закрыта — `display:none` через класс `hidden`, rect.width = 0, расчёт автоматически вырождается в полноэкранный центр без правой панели).
- Реальная ширина сайдбара через `querySelector('[data-workspace-sidebar]')` — новый data-атрибут на `<aside>` в [WorkspaceSidebarFull.tsx](../../src/components/WorkspaceSidebarFull.tsx). Fallback на localStorage, если элемент не найден.
- `useLayoutEffect` + `ResizeObserver` на `.side-panel`, `[data-workspace-sidebar]` и `document.body` — позиция пересчитывается на любое изменение размеров (ресайз окна, ресайз сайдбара мышкой, открытие/закрытие правой панели).
- `visibility:hidden` до первого замера (вместо начального `50%`) — нет одного кадра в неправильной позиции.

### 2. Источники ассистента: нельзя было отключить «Все чаты проекта»

**Симптом**: в дропдауне выбора источников AI-ассистента ([ChatScopePicker](../../src/components/ai-panel/components/ChatScopePicker.tsx)) сверху стоял пункт «Все чаты проекта» с галочкой. Клик по нему не снимал галочку — модель `{ mode: 'all', threadIds: [] }` устанавливалась повторно. Полностью убрать чаты из контекста запроса было нельзя без выбора одного-двух тредов вручную (а потом снимать с них галочки).

**Корень**: обработчик `onClick` всегда вызывал `setChatScope({ mode: 'all', threadIds: [] })`. «Отключено» в этой модели — это `{ mode: 'selected', threadIds: [] }` (см. [useAiSources.disableAllSources](../../src/hooks/messenger/useAiSources.ts)), но эта семантика в picker'е не использовалась.

**Решение**: toggle — если уже в `mode:'all'`, клик переводит в `{ mode:'selected', threadIds: [] }`, иначе наоборот. Чипс в инпуте автоматически становится серым с label «Выбрать чаты» (это уже было в коде, просто никогда не срабатывало).

## Что не сделано / на потом

- **Сохранять `assistantMode` между сессиями** — сейчас при закрытии диалога флаг сбрасывается; если пользователь закрыл и снова открыл диалог того же документа, ему опять придётся кликать Bot. Можно запоминать в localStorage по `documentToEdit.id`, но пока неясно, нужно ли — оставили простую логику.
- **Старый стор `useSidePanelStore`** — параллельно с новой табовой системой. Не выпиливаем, потому что `pendingAiDocuments` всё ещё через него ходит, и есть другие места, которые читают `panelTab`. Полная миграция — отдельная задача.
- **Кнопка ассистента для тредов/задач/сообщений** — сейчас только для документов. Можно добавить «Спроси ассистента про этот тред» аналогично, но это отдельная фича.

## Файлы

### Изменённые

- `src/components/ai-panel/components/ChatScopePicker.tsx` — toggle для «Все чаты проекта».
- `src/components/documents/FloatingBatchActions.tsx` — `z-[60]`, реальные размеры через querySelector + ResizeObserver, кнопка `Bot` слева от X.
- `src/components/WorkspaceSidebarFull.tsx` — `data-workspace-sidebar` на `<aside>` для querySelector.
- `src/components/tasks/TaskPanelTabbedShell.tsx` — `openSystemTab` в API.
- `src/components/tasks/TaskPanelContext.tsx` — проброс `openSystemTab` в контекст.
- `src/components/WorkspaceLayout.tsx` — проброс `openSystemTab` из shell в `taskPanelCtx`.
- `src/hooks/documents/useGlobalBatchActions.ts` — `useLayoutTaskPanel` + вызов `openSystemTab('assistant', 'Ассистент')` в `handleSendToChat`.
- `src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetup.ts` — собирает `openAssistantTab` callback из контекста, пробрасывает в фабрики конфигов.
- `src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetupConfigs.ts` — `openAssistantTab` параметр у `buildBatchActionsConfig` и `buildDialogsConfig`, вызов в обоих `onOpenAIChat`.
- `src/page-components/ProjectPage/components/Documents/hooks/useDocumentsDialogsProps.ts` — `handleOpenAIChat` через `useLayoutTaskPanel`, проброс в `editDocumentDialog.onOpenAIChat` (раньше не пробрасывался вообще).
- `src/components/projects/DocumentKitsTab/dialogs/EditDocumentDialog.tsx` — кнопка `Bot` (вместо `Sparkles`, белый разделитель, группа с «Проверить документ»), локальный `assistantMode`, Radix-примитивы напрямую без `DialogOverlay`, ResizeObserver для расчёта `left`.
