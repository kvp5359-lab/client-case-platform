# Шасси layout: ширина контента, сворачивание сайдбара, ресайз правой панели + адаптивные документы

**Дата:** 2026-05-14
**Тип:** feature (medium) + ux polish
**Статус:** completed

---

## Контекст

На широких мониторах был ощутимый «воздух» по бокам приложения, правая панель открывалась всегда на жёстких 50% и нельзя было её ни ресайзить, ни запретить отжимать контент. На странице документов это било больнее всего: панель сжимала main и карточки документов с длинными испанскими названиями («CERTIFICADO de Tecnologías …») обрезались до неузнаваемости. Параллельно поиск во «Входящих» искал только в текущей вкладке (`Все`/`Непрочитанные`), что мешало быстро найти прочитанного собеседника.

Внутри одной сессии разобрал layout-шасси целиком: ширина контента, сворачивание сайдбара, ресайз и режим работы правой панели, адаптивный рендер документов под новые ограничения — и заодно поправил поиск во входящих.

## 1. Ширина контента и сворачивание сайдбара

### Контент

В [`src/app/(app)/layout.tsx`](../../src/app/(app)/layout.tsx) поднял `max-w` обёртки приватной части с **1700px → 1800px** — на стандартных FullHD/2K серый фон по краям ещё остаётся, но контента стало заметно больше.

### Сворачивание сайдбара

Сайдбар уже умел ресайзиться мышью ([`useSidebarResize`](../../src/components/WorkspaceSidebar/useSidebarResize.ts)), а вот «свернуть до нуля» — нет. Добавил:

- Хук [`useSidebarCollapsed`](../../src/components/WorkspaceSidebar/useSidebarCollapsed.ts) — состояние `cc:sidebar-collapsed` в localStorage, с защитой от SSR-mismatch (читаем после mount).
- В [`WorkspaceSidebarFull`](../../src/components/WorkspaceSidebarFull.tsx) при ресайзе пишется CSS-переменная `--sidebar-width` на `documentElement` — её используют две кнопки переключения, не таская проп через всё дерево.
- Внутри строки селектора воркспейса — узкая прямоугольная кнопка-полоса (h-10 w-5, `rounded-l-md`, белый фон + тень + `border-r-0`) прижатая к правой границе сайдбара. Чтобы не наезжала на дропдаун селектора, обёртке добавлен `pr-6` — селектор уехал немного влево.
- В [`WorkspaceLayout`](../../src/components/WorkspaceLayout.tsx) обёртка сайдбара получает `md:w-0` при свёрнутом состоянии + `transition-all duration-200 overflow-hidden` для плавности. Внутренний `<aside>` остаётся со своей шириной (`sidebarWidth`), но обрезается родителем.
- Когда сайдбар свёрнут, у левого края экрана появляется **зеркальная** копия той же кнопки (`rounded-r-md`, `border-l-0`, `PanelLeftOpen`) на `top-3 left-0`.

Мобильное поведение (translate-x-full + overlay) не трогал — оно живёт по-старому.

## 2. Ресайз правой панели мышью

### Хук [`useRightPanelResize`](../../src/hooks/useRightPanelResize.ts) (новый)

- Default 600px, диапазон **30%/80% от `window.innerWidth`** (clamp при mount пересчитывается под текущее окно).
- Сохранение в `cc:right-panel-width`.
- **Pointer Capture + прямое обновление CSS-переменной**, без `setState` на каждый pointermove. До этого был `mouseDown/mouseMove` на `document` и `setState` на каждый кадр — `WorkspaceLayout` вместе с `TaskPanelTabbedShell` пересобирался при каждом движении мыши, отсюда «рваное» перетаскивание. И `mouseUp` иногда ловился внутренним элементом панели с большим z-index — граница «прилипала» к курсору после отпускания.
- Pointer Capture (`setPointerCapture(pointerId)`) гарантирует что все pointermove/pointerup приходят на handle, даже под чужими z-index. React-state апдейтится один раз на pointerup и пишется в localStorage.
- `touch-action: none` на handle — для тач-устройств.

### Глобальный CSS

В [`globals.css`](../../src/app/globals.css) `.side-panel` теперь читает ширину из переменной:

```css
.side-panel {
  @apply absolute top-0 right-0 h-full min-w-[360px] border-l ...;
  width: var(--panel-width, 50%);
}
```

Fallback `50%` — на случай SSR / до первого mount хука. Handle в [`WorkspaceLayout`](../../src/components/WorkspaceLayout.tsx) тоже едет по той же переменной (`right: calc(var(--panel-width, 600px) - 2px)`), что даёт плавное движение без участия React.

## 3. Поведение панели: overlay vs push (per-page)

Старая логика: `marginRight: 50%` на `<main>` ВСЕГДА, когда панель открыта → панель отжимала контент на любой странице. На широкоформатных страницах (например, анкеты с Google Sheets) это съедало половину полезной площади под лист.

Новая логика — **по умолчанию overlay**, push-режим включают только страницы, которые сами заявляют, что им так удобнее:

- В [`globals.css`](../../src/app/globals.css):

  ```css
  body[data-panel-open][data-panel-mode="push"] main {
    margin-right: var(--panel-width, 50%);
  }
  ```

- На push-страницах — `useEffect` ставит `body[data-panel-mode="push"]` на mount и снимает на unmount:
  - [`TaskListView`](../../src/components/tasks/TaskListView.tsx) — страница задач (`/tasks`), вкладка задач в проекте, списки `item_lists` с тредами.
  - [`DocumentsTabContent`](../../src/page-components/ProjectPage/components/DocumentsTabContent.tsx) — вкладка «Документы» в проекте.

- Атрибут `data-panel-open` уже выставлялся `WorkspaceLayout` через `panelVisible` — здесь оставлен без изменений.

При переключении внутри проекта `tab=tasks → tab=forms` старый push-компонент размонтируется, атрибут уезжает, panel становится overlay. Без перезагрузки страницы, без явных подписок.

## 4. Документы — адаптивная ширина под новый push

С `marginRight` страница документов раньше получала ~789px (старый `cardMaxW`), и этого хватало. После того как push стал условным, оказалось:

- Карточки документов всё равно ограничены `max-w-[789px]` (в `DocumentsTabContent` и в **отдельном** месте — `KitDocuments.tsx`, который я сначала пропустил).
- Привязка к `useSidePanelStore.panelTab` устарела — это легаси-стор, новой системой `TaskPanelTabbedShell` не используется и всегда даёт `null`.

### Фикс (`max-w` снимается, когда панель видна)

В [`DocumentsTabContent.tsx`](../../src/page-components/ProjectPage/components/DocumentsTabContent.tsx) и [`KitDocuments.tsx`](../../src/page-components/ProjectPage/components/Documents/KitDocuments.tsx) `sidePanelOpen` теперь — OR двух источников:

```ts
const layoutPanel = useLayoutTaskPanel()
const sidePanelOpen =
  useSidePanelStore((s) => s.panelTab !== null) ||
  !!(layoutPanel?.hasTabs && !layoutPanel?.isHidden)
```

При открытой панели `cardMaxW=''` → карточки растягиваются на всю ширину main.

### `table-fixed` для truncate

Карточки рендерят таблицу [`<table>`](../../src/page-components/ProjectPage/components/Documents/UngroupedCard.tsx) — с дефолтным `table-layout: auto` ширина колонки определяется содержимым, и длинное название «расталкивало» таблицу за пределы main вместо обрезки. Добавил `table-fixed` к таблицам в [`UngroupedCard`](../../src/page-components/ProjectPage/components/Documents/UngroupedCard.tsx) и [`FolderCard`](../../src/page-components/ProjectPage/components/Documents/FolderCard.tsx) — теперь `truncate` на span'е названия реально обрезает.

### Container query на текстовый статус документа

При узкой панели даже `truncate` оставляет ровно один-два знака под имя — на испанских названиях это нечитаемо. Решил через CSS Container Query (без плагина — `@container` поддерживается Tailwind 3.4 + браузерами с 2023):

В [`DocumentItem`](../../src/page-components/ProjectPage/components/Documents/DocumentItem.tsx) обёртка строки получает класс `.docs-row`, текстовая кнопка статуса — `.docs-status-label`. В [`globals.css`](../../src/app/globals.css):

```css
.docs-row {
  container-type: inline-size;
  container-name: docs-row;
}
@container docs-row (max-width: 480px) {
  .docs-status-label { display: none }
}
```

Когда строка документа уже 480px (= панель отжала main достаточно сильно) — текстовый «Проверен/Требует перевода» исчезает. Иконка статуса слева и размер файла справа остаются, цветной кружок продолжает доносить смысл.

Я сначала пробовал «всегда скрывать при открытой панели» — пользователь резонно возразил, что это пережим: на широком мониторе статус надо оставить. Container query даёт правильный компромисс — реагирует на реальную ширину строки, а не на состояние панели.

## 5. Поиск во «Входящих» с вкладкой «Непрочитанные»

В [`BoardInboxList`](../../src/components/boards/BoardInboxList.tsx) фильтрация шла так: сначала по вкладке (`all`/`unread`), потом по строке поиска. Если у юзера активна «Непрочитанные» и он ищет «Аня» — поиск ходил только по непрочитанным, и реального собеседника (давно прочитанного) не находил.

Поправил порядок: при непустом запросе вкладка `unread` игнорируется, поиск идёт по полному `threads`. Бейдж счётчика `unreadCount` всегда считается по полному списку, цифра не сбивается.

```ts
const q = searchQuery.trim().toLowerCase()
if (filter === 'unread' && !q) { /* ... unread фильтр ... */ }
if (q) { /* ... поиск по всем ... */ }
```

## Файлы

**Новые:**
- [`src/components/WorkspaceSidebar/useSidebarCollapsed.ts`](../../src/components/WorkspaceSidebar/useSidebarCollapsed.ts)
- [`src/hooks/useRightPanelResize.ts`](../../src/hooks/useRightPanelResize.ts)

**Изменённые:**
- [`src/app/(app)/layout.tsx`](../../src/app/(app)/layout.tsx)
- [`src/app/globals.css`](../../src/app/globals.css)
- [`src/components/WorkspaceLayout.tsx`](../../src/components/WorkspaceLayout.tsx)
- [`src/components/WorkspaceSidebar/index.ts`](../../src/components/WorkspaceSidebar/index.ts)
- [`src/components/WorkspaceSidebarFull.tsx`](../../src/components/WorkspaceSidebarFull.tsx)
- [`src/components/boards/BoardInboxList.tsx`](../../src/components/boards/BoardInboxList.tsx)
- [`src/components/tasks/TaskListView.tsx`](../../src/components/tasks/TaskListView.tsx)
- [`src/page-components/ProjectPage/components/Documents/DocumentItem.tsx`](../../src/page-components/ProjectPage/components/Documents/DocumentItem.tsx)
- [`src/page-components/ProjectPage/components/Documents/FolderCard.tsx`](../../src/page-components/ProjectPage/components/Documents/FolderCard.tsx)
- [`src/page-components/ProjectPage/components/Documents/KitDocuments.tsx`](../../src/page-components/ProjectPage/components/Documents/KitDocuments.tsx)
- [`src/page-components/ProjectPage/components/Documents/UngroupedCard.tsx`](../../src/page-components/ProjectPage/components/Documents/UngroupedCard.tsx)
- [`src/page-components/ProjectPage/components/DocumentsTabContent.tsx`](../../src/page-components/ProjectPage/components/DocumentsTabContent.tsx)

## Что осталось / known limits

- **Старый `useSidePanelStore.panelTab`** ещё используется в нескольких местах (помимо документов). Это уже легаси и стабильно даёт `null` — для UX оно не вредит, но при следующей чистке стоит выпилить.
- **Container query на `.docs-row`** срабатывает по ширине самой строки. Если в одной таблице окажутся строки с принципиально разной длиной названия, скрытие будет «всё или ничего» — но они в одной таблице всегда одинаковой ширины, так что это не проблема.
- **Pointer Capture vs touch**: `touch-action: none` повешен, но реальный тач-интерфейс на мобильной ширине отжимается под мобильное меню — отдельной проверки на iPad/таблете не делал.
