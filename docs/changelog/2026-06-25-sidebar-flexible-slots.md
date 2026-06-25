# Гибкие слоты сайдбара: ссылки, доски/списки в палитре, повторное размещение, иконки папок

**Дата:** 2026-06-25
**Тип:** feat
**Статус:** completed (ждёт деплоя фронта)

---

## Что было

Редактор сайдбара (раздел «Сайдбар» в настройках воркспейса) был ограничен:

- В палитру «Доступные» попадали только навигация, разделы и быстрые действия —
  **доски и списки** туда не добавлялись (только через отдельный «pin»).
- Размещённый пункт **исчезал** из палитры → один пункт нельзя было положить
  дважды (например, в две разные папки-меню).
- Нельзя было добавить **произвольную ссылку**.
- У папок-меню нельзя было выбрать иконку.
- Над сайдбаром висела единая кнопка «Создать» (меню быстрых действий) — при
  новой гибкой модели не нужна.
- Длинная палитра растягивала страницу (панели скроллились вместе).

## Что стало

### Модель слотов — id экземпляра ≠ ссылка (`src/lib/sidebarSettings.ts`)
- В `SidebarSlot` добавлено поле `ref` + хелпер `slotRef(slot)`. Слоты из палитры
  получают уникальный `id` (`slot:<uuid>`) и `ref` на сущность
  (`board:<uuid>`/`nav:<key>`/…). Один пункт можно разместить несколько раз
  (в разных папках/зонах) — он больше не исчезает из палитры.
- Легаси-слоты без `ref` работают как раньше (`ref = id`). Валидация в
  `normalizeSidebarSlots` идёт по ссылке.
- Новый тип слота `link`: поля `url` + `link_icon`. Абсолютный `https://…` →
  внешняя вкладка, относительный путь → внутри воркспейса.
- Новые хелперы `linkIdFromSlotId`, `slotRef`.

### Редактор (`SidebarSettings/SidebarEditorCanvas.tsx`)
- Палитра «Доступные» показывает ВСЁ доступное, сгруппировано: Навигация ·
  Действия · Разделы · Доски · Списки. Размещённое не прячется.
- Кнопка **«Создать ссылку»** (рядом с «Создать раздел»); инспектор ссылки
  (название/URL/иконка из `THREAD_ICONS`).
- Инспектор папки получил **выбор иконки** (`folder_icon`).
- Инспектор перенесён **наверх** правой колонки и визуально выделен
  (рамка/кольцо/тень + заголовок «Настройка пункта»).
- Колонки редактора (макет / палитра) скроллятся **независимо**
  (`sticky` + `max-h` + `overflow-y-auto`) — длинная палитра не растягивает
  страницу.

### Рендер сайдбара (`WorkspaceSidebar/SidebarSlotsRow.tsx`)
- Рендер слота-ссылки (compact = иконка, полный = иконка + название).
- Иконка папки берётся из `folder_icon`.
- Все парсеры id (`navKeyFromSlotId`/`boardIdFromSlotId`/…) читают `slotRef(slot)`.

### Pin (`WorkspaceSidebar/usePinnedSlots.ts`)
- «Закреплено»/«открепить» доски/списка считается по `ref` (видит и экземпляры
  из редактора); открепление убирает все слоты с этой ссылкой.

### Прочее
- `WorkspaceSidebarFull.tsx`: убрана единая кнопка «Создать» (`QuickAddMenu`) —
  действия теперь размещаются как слоты; `slotRef` в активных состояниях.
- `SidebarSettingsTab.tsx`, `zone-card/slotMeta.ts`: `slotRef` в фильтре «мёртвых»
  слотов и в резолве меты; `link` всегда «живой».
- `threadConstants.ts`: +37 иконок (плюс/минус, организация, CRM, навигация) —
  общий список для чатов, действий, ссылок и папок.
- `quick-actions/QuickAddMenu.tsx` удалён (осиротел).

## Хранение

Без изменений БД — всё в `workspace_sidebar_settings.slots` (jsonb). Обратная
совместимость: старые сохранённые слоты валидны.

## Файлы

- `src/lib/sidebarSettings.ts`
- `src/page-components/workspace-settings/SidebarSettings/SidebarEditorCanvas.tsx`
- `src/page-components/workspace-settings/SidebarSettings/zone-card/slotMeta.ts`
- `src/page-components/workspace-settings/SidebarSettingsTab.tsx`
- `src/components/WorkspaceSidebar/SidebarSlotsRow.tsx`
- `src/components/WorkspaceSidebar/usePinnedSlots.ts`
- `src/components/WorkspaceSidebarFull.tsx`
- `src/components/messenger/threadConstants.ts`
- `src/components/quick-actions/QuickAddMenu.tsx` (удалён)
