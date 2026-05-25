# Карта регрессий 2026-05-24

**Назначение:** если при тестировании что-то сломалось — ищешь симптом в
таблице, видишь подозреваемый коммит и команду отката. Парная к
[`2026-05-24-post-refactor-testing.md`](./2026-05-24-post-refactor-testing.md)
(чек-лист) и [`docs/changelog/`](../changelog/) (хронология).

Откат: `git revert <sha>` — создаёт обратный коммит, не переписывает историю.

---

## 🔴 Критичные зоны

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Не создаётся задача/тред: 42501 / `permission denied` / `new row violates RLS` на `project_threads` | `3e086c7` fix(rls) | `supabase/migrations/20260524_can_user_access_thread_row_overload.sql` | Применить миграцию-откат: восстановить старую `project_threads_select` с short-circuit `created_by = auth.uid()`. См. `gotchas.md` раздел про RLS. |
| CORS-ошибка в браузере на любой edge-функции («blocked by CORS policy») | `f507df8` refactor(edge) | 60 функций в `supabase/functions/` (`getCorsHeaders` → `corsHeadersFor`) | `git revert f507df8` + redeploy 60 функций. **Сначала** проверить `ALLOWED_ORIGINS` в Supabase secrets — может проще добавить домен туда. |
| Telegram/Wazzup/Email/MTProto — не отправляется или не приходит | `f507df8` (CORS затронул карантин) | Те же edge-функции | Канальная логика **не тронута**, скорее всего проблема в CORS preflight на отправке из браузера. Проверь Network → 200 на OPTIONS. |
| Падение на `INSERT ... RETURNING` в любой таблице со ссылкой на тред | `3e086c7` (косвенно) | RLS | См. первую строку. |

## 🟠 TaskPanel

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Панель не открывается / пустая / не подтягивает тред | `956bcef` refactor(tasks) | `src/components/tasks/TaskPanel.tsx`, `useTaskPanelInternal.ts` (новый) | `git revert 956bcef` |
| Forward-цепочка (стрелки переключения тредов) не работает | `956bcef` | То же | `git revert 956bcef` |
| Esc не закрывает / анимация въезда сломана | `956bcef` | То же | `git revert 956bcef` |
| Вкладки TaskPanel (Задачи/Документы/Ассистент): нельзя перетащить, нет +-меню, бейджи не обновляются | `288314b` refactor(tasks) | `TaskPanelTabBar.tsx`, `tab-bar/DraggableTab.tsx`, `tab-bar/SortableSeparator.tsx`, `tab-bar/systemTabs.ts` | `git revert 288314b` |
| Не сохраняется закреплённая вкладка треда (закрепил — после reload пропала) | См. `gotchas.md` про `task_panel_tabs` — НЕ регрессия, давний костыль | — | — |

## 🟠 Доски

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| DnD карточек между колонками / внутри колонки не работает или сбоит | `8a3c66c` (collisionDetection) или `7c93abc` (dragOverAnalysis) | `BoardView.tsx`, `board-view/collisionDetection.ts`, `board-view/dragOverAnalysis.ts` | По одному: `git revert 7c93abc`, потом `git revert 8a3c66c` |
| DnD колонок (drag headers) | `ddf4d83` (распил BoardView) или `313cf53` (DragOverlay) | `BoardView.tsx` + новые модули | `git revert 313cf53` или `git revert ddf4d83` |
| Карточки не группируются / неверный порядок / битые DropZones | `82f3099` (BoardListCard setup) или `1a769e8` (DropZones) | `BoardListCard.tsx`, `boards/hooks/useBoardListCardSetup.ts`, `board-list/BoardListDropZones.tsx`, `boards/types.ts` | `git revert 82f3099` или `git revert 1a769e8` |
| Календарная колонка в доске: события не отображаются / не двигаются / ресайз сломан | `e19f96b`, `7da704c`, `7c93abc` (3 этапа распила) | `BoardListCalendarView.tsx`, `calendar/CalendarEventContent.tsx`, `calendar/calEventTypes.ts`, `calendar/makeCalendarToolbar.tsx` | По одному с конца: `7c93abc` → `7da704c` → `e19f96b` |
| Lazy-загрузка календаря в колонке не срабатывает (вечный спиннер) | `ee6fa58` perf(boards) | `BoardListCard.tsx` (lazy import) | `git revert ee6fa58` |
| Настройка «Внешний вид» колонки: банк полей пустой, нельзя перетащить, FieldStyleEditor не открывается, мультиселект Google-календарей не работает | `80cd2c0` refactor(boards) | `ListSettingsAppearanceTab.tsx`, `list-settings/FieldBank.tsx`, `LayoutRow.tsx`, `FieldStyleEditor.tsx`, `CalendarSourcesPicker.tsx` | `git revert 80cd2c0` |
| ConvertExternalEventDialog не инвалидирует список после конверсии | `e3432b2` fix(react-query) | `ConvertExternalEventDialog.tsx` | `git revert e3432b2` (восстановит литерал, но вернёт дубль `projectContextKeys`) |

## 🟠 Фильтры

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Редактор фильтров не открывается / DnD условий не работает / нельзя добавить группу | `a4db95d` refactor(filters) | `FilterGroupEditor.tsx`, `InnerFilterGroupEditor.tsx`, `useFilterDnD.ts` | `git revert a4db95d` |

## 🟠 Проект

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Редиректит из проекта на список проектов даже если есть доступ | `bdc5be9` feat(auth) | `src/app/(app)/workspaces/[workspaceId]/projects/[projectId]/layout.tsx` | `git revert bdc5be9` |
| Layout проекта рендерится для юзера БЕЗ доступа (информационный leak) | Регрессия `bdc5be9` (но это **поведение, которое чинит** коммит) | То же | Не откатывать — это фикс |
| Вкладка «Контекст»: не добавляется текст / файл / скриншот, Tiptap не подгружается | `7db0130` refactor(project) | `ProjectContextTabContent.tsx`, `context-dialogs/AddTextDialog.tsx`, `AddFileDialog.tsx`, `AddScreenshotDialog.tsx` | `git revert 7db0130` |
| Поля проекта в «Свойствах» не редактируются | `546a55e` refactor(project) | `ProjectFieldsSection.tsx` + `RowField` | `git revert 546a55e` |

## 🟠 Сайдбар

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Глобальный поиск: пустые секции, нет заголовков, иконки сущностей пропали | `6aaf2d7` refactor(sidebar) | `SidebarGlobalSearch.tsx`, `search-parts/index.tsx` | `git revert 6aaf2d7` |
| Настройки сайдбара (`/settings/sidebar`): зоны пустые, DnD не работает, папки/попап «⋯» битые, цвет бейджа не меняется | `2a73998` refactor(sidebar) | `ZoneCard.tsx`, `zone-card/BadgeColorPicker.tsx`, `SlotRow.tsx`, `FolderRow.tsx`, `slotMeta.ts` | `git revert 2a73998` |
| Compact-режим сайдбара (свёрнутый) выглядит криво | `2cfc673` refactor(sidebar) | `WorkspaceSidebarFull.tsx` + новый модуль | `git revert 2cfc673` |
| Иконки статусов/проектов битые в сайдбаре, статус-дропдаунах, на досках | `3863b7e` refactor(modules) | 28 файлов с обновлёнными импортами `@/components/ui/{status-dropdown,status-icons,project-icons}` → `@/components/common/...` | `git revert 3863b7e` |

## 🟠 База знаний

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Попап «Доступ к шаблону»: счётчики не грузятся, бейдж пустой, кнопка-триггер не работает | `da27c04` refactor(knowledge) | `TemplateAccessPopover.tsx`, `template-access/helpers.ts`, `TemplateAccessBadge.tsx`, `TemplateAccessButton.tsx`, `useTemplateAccessCounts.ts` | `git revert da27c04` |
| KB-редактор не открывается / Tiptap бесконечный спиннер | `3a85660` perf(bundle) | Lazy Tiptap в KB-editor, AI-панелях, QuickReply | `git revert 3a85660` |

## 🟠 Мессенджер

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Сообщения сотрудников НЕ подсвечены (нет кольца аватара / полосы на бабле) в клиентском чате | `78635ac` refactor(messenger) | `MessageBubble.tsx`, `chatSettingsTypes.ts`, `utils/messageStyles.ts`, `IntegrationsTab/types.ts` | `git revert 78635ac` |
| Сообщения сотрудников подсвечены **слишком много** (включая клиентские) | `78635ac` | То же | См. выше |

## 🟠 Аутентификация / контекст

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| После выхода и входа другим юзером в общем браузере — у нового юзера висит карточка контакта старого | Должен быть починен — `e3432b2` | `src/contexts/AuthContext.tsx` (добавлен `useContactCardStore.close()` в signOut) | Если всё равно висит — баг новый, заводить open-bug |

## 🟡 Косметика / типы

| Симптом | Коммит | Файлы | Откат |
|---------|--------|-------|-------|
| Спиннеры на разных страницах выглядят по-разному / прыгают | `583fb7c`, `0032cbb`, `6ad5bb5`, `7ca1a50`, `b08cfaa`, `aaff3d7` (5 партий) | ~37 файлов: `Loader2` → `PageLoader` | По партиям: `git revert <sha>` нужной |
| Цвет акцента треда не выбирается / красный TS-cast | `500fd81` fix(types) | `src/components/tasks/TaskDialog.tsx` (убран `as never`, добавлен `as ThreadAccentColor`) | `git revert 500fd81` (вернёт `as never`) |
| Любая RPC `supabase.rpc(...)` не типизирована / TS падает на name | `f7d91d3` types | Файл с убранными `as never` для rpc | `git revert f7d91d3` |
| `npm run lint` ругается на `consistent-type-definitions` | `f13d6fa` style(types) | Замены `interface` → `type` | `git revert f13d6fa` |
| `SectionSettingsDialog` теряет состояние при смене секции | Чинит `68ab659` fix(lint) — key-based remount | `SectionSettingsDialog.tsx` | Если регрессия — `git revert 68ab659` |

## 🟡 Импорты / реорганизация

| Симптом | Коммит | Откат |
|---------|--------|-------|
| `Cannot find module '@/components/ui/status-dropdown'` (или `status-icons`, `project-icons`) | `3863b7e` (28 файлов перевели на `common/`, кто-то добавил импорт после с `ui/`) | Поправить новый импорт на `@/components/common/...` |
| `Cannot find module '@/hooks/...'` (плоский корень `src/hooks`) | `694256b` refactor(hooks) | Поправить импорт по новой структуре подпапок |
| `Cannot find module '@/lib/middleware/...'` | `ce3f856` refactor(middleware) | RPC-резолверы переехали — новый путь |

## 🟡 Производительность / lazy

| Симптом | Коммит | Откат |
|---------|--------|-------|
| `staleTime` слишком короткий → лишние запросы | `61e17ea` perf(queries) (6 хуков) | `git revert 61e17ea` |
| `staleTime` слишком длинный → данные не обновляются | `61e17ea` | `git revert 61e17ea` |
| Календарь страница загружается заметно медленнее | `777bec8` perf(calendar) (moment-timezone → date-fns) | `git revert 777bec8` |
| TaskPanel импорт-цикл (TS-ошибка `cannot access before initialization`) | `8a8aa1f` refactor(tasks) (break import cycles) | `git revert 8a8aa1f` (вернёт цикл, но даст другой симптом) |

---

## Универсальный план «у меня сломалось X»

1. Открыть [`docs/changelog/2026-05-24-*.md`](../changelog/) — там тоже подсветка по фичам.
2. Найти симптом в этой карте → взять `sha`.
3. `git show <sha>` — почитать diff, понять что меняли.
4. Если правка локальная — починить точечно (`git show <sha> -- <file>`).
5. Если непонятно что сломалось — `git revert <sha>`, протестировать, **не пушить**, прислать мне детали.
