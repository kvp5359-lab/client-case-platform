# Распил файлов-монстров (>400 строк)

**Статус:** не сделано, требует ручной визуальной проверки UI после каждого.
**Дата:** 2026-05-24.

## Файлы (вне карантина)

Из топа по строкам (исключая `database.ts` — авто-ген и `ui/sidebar.tsx` — shadcn-блок):

| Файл | Строк | Ответственности | Как разбивать |
|------|-------|------------------|---------------|
| `BoardListCalendarView.tsx` | 948 | RBC-адаптер + DnD + дозагрузка + custom toolbar/event-renderers | event-компоненты → `BoardListCalendarEvent.tsx`, toolbar → `BoardListCalendarToolbar.tsx`, кастомный view → `nextNDaysView.ts`, хук `useBoardListCalendarData` |
| `BoardView.tsx` | 775 | Состояние + dnd + multi-list + inline-меню колонок | inline-меню колонок → `BoardColumnMenu.tsx`, хук настроек → `useBoardSettings` |
| `ListSettingsAppearanceTab.tsx` | 663 | Цвет/иконки/badge-mode/display-mode/columns в одной вкладке | каждый блок → подсекция `ListSettings{Color,Icon,Badge,Display,Columns}Section.tsx` |
| `BoardListCardCard.tsx` | 623 | Карточка списка + drag + меню + rename + bulk actions | inline-меню → `BoardListContextMenu.tsx`, rename → `useInlineRename` |
| `ZoneCard.tsx` (sidebar settings) | 603 | Drag-зона + слоты + папки + popover-меню | папки → `ZoneFolderRow.tsx`, popover-меню → `SlotMoveMenu.tsx` |
| `WorkspaceSidebarFull.tsx` | 601 | Layout + поиск + слоты + закрепы | в основном уже разбит, корневой файл — оркестратор; вынести `SidebarSearchToolbar` |
| `TemplateAccessPopover.tsx` | 534 | Popover + матрица прав + поиск + bulk + per-role | разделить на `RoleMatrix.tsx` + `TemplateAccessSearch.tsx` + хук |
| `TaskPanelTabBar.tsx` | 513 | Tab bar + drag + контекстное меню + add-popover | add-popover → `TabAddPopover.tsx`, контекстное меню → `TabContextMenu.tsx` |

`useTaskPanelTabs.ts` уже распилен (521 → 427 + service).
`proxy.ts` 563 — нет смысла дробить ради дробления (Next middleware, линейный).
`useDocumentKitSetup.ts` 501 — линейный setup-флоу, разбивать на части не упростит.

## Стратегия

Каждый файл — **отдельный коммит** с обязательной браузерной проверкой:

1. Перед: запустить dev, открыть страницу, заскриншотить.
2. Сделать распил (вынести компоненты в соседние файлы, импортировать обратно).
3. После: refresh, сравнить визуально, протестировать все интеракции
   (drag/rename/menu/etc.).
4. `npm run lint && npm test`.
5. Commit + следующий.

**Никаких автоматизаций.** Эти файлы — UI + state + interactions. Любая ошибка
рендерится в продакшен. Без визуальной проверки = риск регрессии.

## Приоритет

1. `BoardListCalendarView` — самый большой, самые чёткие границы ответственностей.
2. `ListSettingsAppearanceTab` — секции независимы.
3. `ZoneCard` — три ответственности легко выделить.
4. `BoardListCard`, `BoardView`, `TaskPanelTabBar` — после №1-3, по сложности drag/menu.
5. `WorkspaceSidebarFull`, `TemplateAccessPopover` — последние, как часть «уборки».

## ROI

- Поддерживаемость: каждый файл становится читаемым за один присест.
- Тестируемость: маленькие компоненты можно покрыть unit-тестами.
- Регрессии при правках: меньше шансов задеть соседнюю зону по неосторожности.
