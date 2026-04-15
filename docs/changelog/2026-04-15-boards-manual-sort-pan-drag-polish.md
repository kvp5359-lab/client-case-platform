# Доски: ручная сортировка, панорамирование, доработки UX

**Дата:** 2026-04-15
**Тип:** feat + fix
**Статус:** completed

---

## Проблемы

1. **Перемещение списков «Выше/Ниже»** — кнопки в меню списка не работали. У всех списков `sort_order = 0`, RPC `swap_board_list_sort_order` менял `0 ↔ 0` — порядок не менялся. При сохранении настроек список «всплывал» наверх случайным образом — Postgres при равных ключах сортировки возвращает строки в недетерминированном порядке.

2. **Не было ручной сортировки задач** — пользователь хотел перетаскивать задачи в нужном порядке внутри списка доски.

3. **Нельзя было листать доску мышью** — только через скроллбар или колесо.

4. **Просроченные задачи слабо выделялись** — красным был только дедлайн справа, имя — обычным цветом.

5. **Карточка не помещалась по ширине списка** — длинные имена выходили за границы, появлялся горизонтальный скролл.

6. **Не было способа выровнять вторую строку карточки** относительно первой (по линии после иконки статуса).

7. **Выравнивание `align: 'left'` у не-первого поля не прижимало его к предыдущему** — `flex-1` у имени создавал дыру.

## Решение

### 1. Ручная сортировка задач (drag & drop)

В `SortField` добавлено значение `'manual_order'` и пункт «Вручную» в `TASK_SORT_FIELDS`. При выборе:
- `useFilteredListData` сортирует по `project_threads.sort_order` (всегда `asc`, направление игнорируется).
- В диалоге настроек скрыт селектор направления.
- В `BoardListCard` оборачиваем список в `DndContext` (sensor с порогом 8px), используем тот же паттерн drop-indicator (синяя линия сверху/снизу карточки), что и в `TaskGroupList`.
- Новый компонент `DraggableBoardTaskRow` — обёртка с `useDraggable + useDroppable`.
- Используется существующий `useReorderTasks` (через `workspaceThreadKeys.workspace(workspaceId)`).

DnD включён только для task-списков без группировки.

### 2. Фикс кнопок «Выше/Ниже»

- В `useCreateList` теперь вычисляется `max(sort_order) + 1` в пределах колонки.
- Миграция `20260415_board_lists_reseed_sort_order.sql` — перенумерация существующих списков по `(board_id, column_index)` через `ROW_NUMBER()`.
- Миграция `20260415_project_threads_reseed_sort_order.sql` — перенумерация задач в пределах `project_id` с шагом 10 (для вставок между). Обе применены в проде через Supabase MCP.

### 3. Фикс optimistic update в `useReorderTasks`

- `setQueryData` заменён на `setQueriesData` (по префиксу) — раньше мутация передавала ключ-префикс `['workspace-threads', wsId]`, а реальный кэш хранится по `['workspace-threads', wsId, userId]`. Префикс не совпадал — оптимистичное обновление не применялось.
- Инвалидация перенесена из `onError` в `onSettled` — после успешной мутации сервер дотягивает свежие данные.

Без этого фикса перетаскивание визуально работало только после ручного обновления страницы.

### 4. Панорамирование доски

Новый хук `usePanDrag`:
- Находит ближайшего скроллируемого родителя через `getComputedStyle(parent).overflowX/Y`.
- При зажатии ЛКМ на пустом месте + перетаскивании скроллит контейнер по `scrollLeft`/`scrollTop`.
- Игнорирует клики по интерактивным элементам через `closest('button, a, input, textarea, select, [role="button"], [data-board-card], [contenteditable="true"]')`.
- Порог активации 5px (меньше — клик).

Подключён к корневому `<div>` `BoardView` с курсором `cursor-grab`.

### 5. Визуальные доработки

- **`BoardListHeader`** — после таблетки заголовка добавлена тонкая линия (`h-0.5`) цвета фона таблетки до правого края с маленьким отступом слева. Меню на ховере вынесено в `absolute right-0` с фоном `bg-[#f6f6f7]` (равен фону страницы досок `bg-gray-100/60` поверх white) — кнопки появляются поверх линии без скачка.
- **`BoardTaskRow`** — название просроченных задач теперь красное (`text-red-500`), как и дедлайн. Выбранная задача (`text-brand-700`) приоритетнее.
- **Новое поле `spacer`** в `CardFieldId`, доступно для задач и проектов. Рендерится как пустой блок шириной 18px в карточках задач (= ширина иконки статуса `sm`) и 14px в карточках проектов (= ширина `FolderOpen h-3.5`). Используется во второй строке карточки, чтобы следующее поле начиналось по линии названия.
- **`CardLayoutPreview`** — размеры моков приведены к реальным: статус — круг-«пончик» 18×18 с border-2, аватары — 18×18.

### 6. Фикс ширины списков (горизонтальный скролл)

- `BoardListCard` — все `grid gap-1` заменены на `grid grid-cols-1 gap-1`. Без `grid-cols-1` неявная единственная колонка расширялась до `min-content` ребёнка → длинные имена вылезали наружу.
- `DraggableBoardTaskRow` — добавлен `min-w-0` на обёртку. Без него `truncate` внутри `BoardTaskRow` не срабатывал.

### 7. Корректное выравнивание полей в карточке

- В `BoardTaskRow` логика `flex-1` для name переписана: даётся только когда name — **последнее `align: 'left'` поле в строке**. Если после name идёт ещё одно left-поле (assignees с `align: 'left'`) — `flex-1` уходит, имя занимает свою длину, assignees прижимаются к нему слитно.
- `ml-auto` для компонентных полей (status/assignees/unread) теперь применяется через обёртку по `style.align === 'right'`. Раньше `ml-auto` писался в `classes` через `fieldStyleToClasses`, но в `<div>` обёртки не передавался — выравнивание этих полей вообще не работало.

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `src/components/boards/types.ts` | `'manual_order'`, `'spacer'` в `CardFieldId`/`SortField`. |
| `src/components/boards/listSettingsConfigs.ts` | «Вручную» в `TASK_SORT_FIELDS`, `'spacer'` в `CARD_FIELD_DEFS`. |
| `src/components/boards/hooks/useFilteredListData.ts` | Сортировка `manual_order` по `sort_order`. |
| `src/components/boards/hooks/useListMutations.ts` | `useCreateList` вычисляет `max(sort_order) + 1`. |
| `src/components/boards/ListSettingsGeneralTab.tsx` | Скрытие селектора направления для `manual_order`. |
| `src/components/boards/BoardListCard.tsx` | DnD для ручной сортировки, `grid-cols-1` для исправления ширины. |
| `src/components/boards/DraggableBoardTaskRow.tsx` | Новая обёртка с DnD. |
| `src/components/boards/BoardListHeader.tsx` | Линия после таблетки, меню поверх линии. |
| `src/components/boards/BoardTaskRow.tsx` | Поле `spacer`, красное имя для overdue, корректное `flex-1`/`ml-auto`. |
| `src/components/boards/BoardProjectRow.tsx` | Поле `spacer` 14px. |
| `src/components/boards/CardLayoutPreview.tsx` | Реальные размеры моков, поддержка `spacer`. |
| `src/components/boards/BoardView.tsx` | Подключение `usePanDrag`. |
| `src/components/boards/hooks/usePanDrag.ts` | Новый хук панорамирования. |
| `src/components/tasks/useTaskMutations.ts` | `setQueriesData` + `onSettled` в `useReorderTasks`. |
| `supabase/migrations/20260415_board_lists_reseed_sort_order.sql` | Перенумерация `board_lists.sort_order`. |
| `supabase/migrations/20260415_project_threads_reseed_sort_order.sql` | Перенумерация `project_threads.sort_order`. |

## Проверки

- `tsc --noEmit` — без ошибок ✅
- Миграции применены в проде через MCP ✅
- Ручная проверка: drag & drop работает, оптимистичное обновление мгновенно, панорамирование не конфликтует с кликами по карточкам.
