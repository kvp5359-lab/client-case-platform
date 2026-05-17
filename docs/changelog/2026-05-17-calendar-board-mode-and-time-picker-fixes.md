# Календарный режим списков на доске, drag-bridge @dnd-kit↔RBC, фиксы time-picker'а

**Дата:** 2026-05-17
**Тип:** feature (large) + refactor (medium) + fix (small × 8)
**Статус:** completed

---

## Контекст

Накопилось три больших темы, которые пошли одним выпуском:

1. **Календарный режим board-листа.** Существующий time-grid (RBC) уже был в `BoardListCalendarView` как четвёртый `display_mode`, но без настроек, без удобного выбора в UI и с ворохом мелких косяков (цвет блока не от акцента задачи, шрифты крупные, время сверху названия, нет индикатора Google-стиля, нельзя нормально зацепить ресайз). Также не было собственного «вида N дней» и нормального drag&drop из обычных kanban-списков.
2. **Bridge между @dnd-kit и react-big-calendar.** Обе либы тащат свою DnD-систему. Стандартный паттерн «отдельный HTML5 drag handle» (как у Asana/Notion) был отброшен в пользу полного unified-`@dnd-kit`-моста — карточка тащится как обычно, а календарь регистрируется как `useDroppable` + слушает `useDndMonitor` сам. Координаты → дата+время через DOM-метрики RBC.
3. **Time-picker / чип срока.** Снятие чекбокса «Указать длительность» не очищало время в БД, потому что (а) `TaskPanelTabContents` не передавал `onTimeChange`, (б) триггер `sync_thread_deadline_end_at` от изменения `end_at=NULL` затирал deadline в NULL даже если caller явно его задал. Плюс «открыл-закрыл попап → лог об изменении дедлайна» из-за разных ISO-форматов.

Заодно подобраны мелкие UX-фиксы: курсор на пустых слотах, выпиливание стрелки `?panelTab=` из URL при закрытии панели, optimistic updates для отзывчивости drag/resize.

## Главное 1: настройки и UI календарного режима

### Что было

`display_mode='calendar'` уже жил в `board_lists` как значение, но:

- В `ListSettingsDialog` выбор был только через «Режим» в Appearance-вкладке. «Тип данных» в General был отдельно — пользователю надо было сначала поставить thread, потом перейти в Appearance, потом выбрать Calendar.
- В `CreateListDialog` варианта «Календарь» не было — только Задачи/Проекты/Входящие.
- В режиме календаря всё равно показывались поля cardLayout/visible_fields/group_by/sort_by, которые там не применяются.
- Никаких settings не было: вид по умолчанию (День/Неделя), рабочие часы — всё захардкожено.
- Кастомного вида «Следующие N дней» не существовало.

### Что сделано

**SQL** — три миграции:

- [`20260517_board_lists_display_mode_calendar.sql`](../../supabase/migrations/20260517_board_lists_display_mode_calendar.sql) — расширен CHECK у `board_lists.display_mode` (раньше пропускал только `list`/`cards`).
- [`20260517_board_lists_calendar_settings.sql`](../../supabase/migrations/20260517_board_lists_calendar_settings.sql) — JSONB-колонка `calendar_settings`: `{ default_view, min_hour, max_hour, next_n_days? }`.
- [`20260517_get_board_lists_with_calendar_settings.sql`](../../supabase/migrations/20260517_get_board_lists_with_calendar_settings.sql) — RPC `get_board_lists` теперь возвращает `calendar_settings`. Без этого фронт не видел настройки и сейв в редакторе как будто не сохранялся.

**Фронт:**

- В `ListSettingsGeneralTab` «Календарь» стал четвёртым типом в «Тип данных». Под капотом устанавливает `entity_type='thread'` + `display_mode='calendar'`. В режиме календаря «Проекты»/«Входящие» неактивны.
- `CreateListDialog` тоже получил вариант «Календарь».
- В `ListSettingsAppearanceTab` — секция «Календарь» с тремя селектами: вид по умолчанию, час начала, час конца. Когда выбран `next_n` — появляется четвёртый селект с N (3/4/5/7/10/14/21/30). Блок cardLayout/preview скрыт в календарном режиме.
- В General скрыты сортировка и группировка для календаря (не применяются).

**Кастомный вид «N дней»:**

В `BoardListCalendarView` фабрика `makeNextNDaysView(n)` создаёт View-компонент через внутренний импорт `react-big-calendar/lib/TimeGrid` (RBC не экспортирует TimeGrid из index). `range/navigate/title` замыкаются на N. Регистрируется в `views={{...standard, next_n: View}}`. Label таба — `${N} дн.`.

## Главное 2: drag-bridge @dnd-kit ↔ react-big-calendar

### Что было

Карточки задач в обычных board-листах тащит `@dnd-kit` (kanban между статусами). Внутри `BoardListCalendarView` своя DnD-система RBC (drag/resize событий). Двух систем нельзя совместить нативно — стандартный workaround «отдельный HTML5 drag handle на карточке» (как у Asana/Linear) сначала и реализовали (иконка `CalendarPlus` в углу, native HTML5 dragstart + RBC `onDropFromOutside`).

Пользователь попросил без иконки — тащить карточку целиком. Два пути из обсуждения:
- Заменить `@dnd-kit` в kanban на HTML5 → потеряем accessibility, touch, плавные animations.
- Bridge: `@dnd-kit` снаружи, RBC внутри, конвертер на границе → ~50 строк хрупкой DOM-математики, но сохраняем kanban как есть.

Выбран bridge.

### Что сделано

- В `BoardListCalendarView` оборачивающий `<div>` стал `useDroppable({id:'calendar-drop:<listId>'})`.
- `BoardView.collisionDetection` получил приоритет для `calendar-drop:*` перед `list-cards:` — иначе вложенный `BoardListCardsDropZone` побеждал.
- `useDndMonitor` в `BoardListCalendarView` слушает глобальные drag-события, фильтрует по `over.id === own droppableId`, обрабатывает drop сам через `useUpdateThreadTime`.
- Координаты курсора (`activatorEvent.clientX/Y + delta`) → DOM-метрики RBC через `computeTimeFromCoords` (`document.elementsFromPoint`, выход на `.rbc-day-slot`/`.rbc-time-content`, индекс колонки + bbox для Y→минут, snap на 10 мин).
- Default-длительность дроп: 30 мин.
- При drag-over календаря показываем live preview-«призрак» (полупрозрачный фирменный блок цвета акцента задачи) через `createPortal` под курсором с названием и временем старта.
- DragOverlay (`@dnd-kit`) скрывается когда курсор над календарём — чтобы не было двойного представления (overlay + preview).
- `onDragEnd` / `onDragCancel` чистят preview state.

**Хрупкое место** (для будущего): `computeTimeFromCoords` зависит от селекторов RBC. Если обновление мажорной версии поменяет разметку — функцию нужно переписать. Альтернатив RBC не даёт.

### Optimistic updates

После каждого drag/drop/resize блок визуально «откатывался» на старое место на 1-2 секунды, пока сервер обновляет → query-cache инвалидируется → React перерисовывает. Добавил `onMutate` в `useUpdateThreadTime` и `useUpdateTaskDeadline`:

- Меняем кэш `calendarKeys.all` синхронно — два формата: `CalendarThread[]` (для `useCalendarThreads`) и `Record<id, {start_at, end_at}>` (board-list-times внутри `BoardListCalendarView`).
- Для drop'а новой задачи (entry ещё нет в map) — апсёртим всегда, не проверяем `params.threadId in old`. Блок появляется мгновенно.
- Для `useUpdateTaskDeadline`: если `start_at`/`end_at` оба `null` → удаляем entry (блок исчезает из календаря синхронно с очисткой времени).

## Главное 3: фикс time-picker и BD-триггера

### Что было сломано

**Кейс юзера:** «Открываю срок задачи с временем 01:30–02:00, снимаю чекбокс "Указать длительность", сохраняю. Время не исчезает, появляется какое-то другое.»

Три бага в цепочке:

1. **`TaskPanelTabContents`** (layout-level панель задач) не передавал `onTimeChange` в `<TaskPanel>`. Поэтому в `DeadlinePopover.handleChange` ветка `onChange` была `undefined`, шёл fallback на старый `onSet(date)` — мутация без `start_at`/`end_at`.
2. Даже если бы передавал — в `useTaskPanelSetup` не было реализации `onTimeChange` (только `onDeadlineSet`/`onDeadlineClear`).
3. Даже если бы UPDATE улетал с `{deadline=date, start_at=null, end_at=null}` — БД-триггер `sync_thread_deadline_end_at` правилом «end_at changed → deadline := end_at» затирал deadline в NULL. Семантика триггера не учитывала случай «caller меняет оба поля разом».

Плюс отдельный баг: при простом open→close попапа сравнение `v.deadline !== value.deadline` ловило разницу из-за разных форматов ISO (`+00:00` vs `Z`) → лишний UPDATE → запись в audit-лог об «изменении».

### Что сделано

**Цепочка пробрасывания `onTimeChange`:**

- `TaskPanelTabContents.tsx` — добавлен `onTimeChange={v => updateDeadline.mutate({threadId, deadline, start_at, end_at})}`.
- `useTaskPanelSetup.ts` — добавлена реализация `onTimeChange` с тем же mutate + setStack обновлением.
- `TaskPanelTaskHeader.tsx` уже передавал onTimeChange в `DeadlinePopover` — там цепочка была целая.

**Triger v2** ([`20260517_sync_thread_deadline_end_at_v2.sql`](../../supabase/migrations/20260517_sync_thread_deadline_end_at_v2.sql)):

```sql
-- Правило 1: меняется ТОЛЬКО end_at (deadline без изменений).
IF NEW.end_at IS DISTINCT FROM OLD.end_at
   AND NEW.deadline IS NOT DISTINCT FROM OLD.deadline THEN
  NEW.deadline := NEW.end_at;
  RETURN NEW;
END IF;

-- Правило 2: меняется ТОЛЬКО deadline у задачи-в-календаре.
IF NEW.deadline IS DISTINCT FROM OLD.deadline
   AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at
   AND OLD.start_at IS NOT NULL AND OLD.end_at IS NOT NULL THEN
  ...
END IF;
```

Теперь caller, который шлёт сразу все три поля в одном UPDATE, проходит триггер прозрачно — оба правила не срабатывают.

**TaskTimePickerPopover:**

- При снятии чекбокса состояние сразу пробрасывается наружу через `onChange(buildValue(date, undefined, '', '', false))` — chip обновляется без ожидания закрытия попапа.
- Сравнение на закрытии через `isoEqual(a, b)` — парсит обе строки `Date.parse` и сравнивает timestamps. Разные ISO-форматы одного момента считаются равными.

**Bonus** — `ChatCreatePreset` расширен `startAt`/`endAt`. Когда пользователь кликает на пустой слот календаря в режиме calendar-list, теперь открывается полный `ChatSettingsDialog` (а не мини-диалог) с предзаполненным интервалом. `useChatSettingsFormState.useEffect` правильно ставит `taskShowDuration=true` + время. Минимальная длительность короткого клика — 30 мин (snap по step=10 мин делал слишком маленькие слоты).

## Полировка UI календаря

Куча мелких правок в `globals.css`, накопившихся за итерациями:

- **10-минутный snap при resize/drag** без визуальных делений каждые 10 мин: `step=10, timeslots=6` + `border-top: none !important` на `.rbc-time-slot`. Видны только границы часов через `.rbc-timeslot-group`.
- **Высота часовой строки 48px** (`min-height` на `.rbc-timeslot-group`).
- **Курсор `default`** на пустых слотах вместо `pointer` (RBC ставит pointer когда `selectable=true`).
- **Подсветка точки старта** при наведении на слот: тонкая фирменная линия по ширине дня через `box-shadow: inset 0 2px 0 0`. `.rbc-events-container` получил `pointer-events: none` (события — `auto`), иначе перекрывал hover.
- **Цвет блока из акцента задачи** — `eventPropGetter` ставит `style.backgroundColor` (inline побеждает RBC-дефолт `#3174AD`). Своя hex-карта `ACCENT_HEX` (Tailwind-классы дают `bg-red-500`, но не побеждают по специфичности).
- **Outline 2px вокруг блока** под фон колонки (белый / голубой today) — соседние блоки одного цвета теперь визуально разделяются.
- **Контент блока через `components.event`**: название сверху, под ним проект мелким, время от RBC прилегает сразу под контентом (flex `order` + `flex: 0 1 auto !important; height: auto !important` на `.rbc-event-content`). Для короткого 30-мин блока контент шринкается, время остаётся видимым.
- **Хит-зона resize 14px** (RBC по умолчанию 3px — невозможно попасть), курсор `ns-resize`. Сами иконки-индикаторы скрыты, потому что курсор и так понятен.
- **Индикатор текущего времени в стиле Google Calendar** — красная линия `#ea4335` + круг 10×10 на левом краю через `::before`.
- **Тулбар и подписи времени** на ~2pt меньше: 12px / 11px.
- **Outline DnD-resize-icon** скрыт — было визуально шумно, хит-зона и курсор достаточны.

## Главное 4: чистка `?panelTab=` из URL

### Что было

При закрытии treda по × URL оставался вида `/boards/.../?panelTab=thread:172`. Скопировать ссылку и дать коллеге = у того откроется тот же тред. Не семантично «закрытию».

### Что сделано

- В `useTaskPanelTabs` добавлен метод `clearUrlActive()` — удаляет `?panelTab=` из URL без изменения активной вкладки.
- `TaskPanelTabbedShell.hidePanel` теперь вызывает `tabs.clearUrlActive()` в дополнение к `setHidden(true)`. Вкладка в списке остаётся, можно открыть кликом.
- `showPanel` / `togglePanel` симметрично восстанавливают URL из `tabs.activeTabId` — иначе URL и UI расходились.

## Мелочёвка

- **Удалён мёртвый код** `src/components/boards/dragToCalendarStore.ts` и `calendarDropRegistry.ts` (промежуточные варианты HTML5-handle / реестра до перехода на `useDndMonitor`).
- **`CreateListDialog`** — мелкий баг: `value="task"` при state `'thread'` (селект не подсвечивал дефолт). Заодно поправил.
- **`useUpdateTaskDeadline`** теперь дополнительно инвалидирует `calendarKeys.all` — раньше после очистки времени в попапе блок в календаре висел до перезагрузки.
