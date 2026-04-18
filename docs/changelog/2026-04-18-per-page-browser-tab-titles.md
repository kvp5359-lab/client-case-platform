# Заголовок вкладки браузера по текущей странице

**Дата:** 2026-04-18
**Тип:** feat
**Статус:** completed

---

## Контекст

Все вкладки с ClientCase выглядели одинаково: «ClientCase». Когда открыто несколько проектов в соседних вкладках, приходилось перебирать их мышью по одной, чтобы понять, где какой клиент — из названий вкладок это было не вытащить. У активных пользователей (у клиента подтвердилось на скриншоте) по 5–10 таких вкладок одновременно.

## Решение

Новый хук [usePageTitle.ts](../../src/hooks/usePageTitle.ts) — ставит `document.title` в формате `<Название> — ClientCase`.

### Две важные детали, чтобы title не скакал

1. **Без cleanup на unmount.** Первая версия восстанавливала `prev` при размонтировании — и оказалось, что при навигации между страницами старая компонента успевала затереть новый title. Теперь cleanup нет: следующая страница сама выставляет свой title, а если её нет — остаётся предыдущий.
2. **Пустые значения игнорируются.** Пока `project.name` не пришёл из react-query, хук не сбрасывает на дефолт — иначе во время загрузки title моргал на `ClientCase` и обратно.

### Интеграция в 11 страниц

Динамические (по данным):

- `ProjectPage` → `project.name`
- `BoardPage` → `board.name`
- `WorkspacePage` → `workspace.name`

Статические:

- `InboxPage` → «Входящие»
- `TasksPage` → «Задачи»
- `BoardsPage` → «Доски»
- `ProjectsPage` → «Проекты»
- `DashboardPage` → «Дашборд»
- `ProfilePage` → «Профиль»
- `WorkspacesPage` → «Рабочие пространства»
- `WorkspaceSettingsPage` → по активной вкладке: «Настройки» / «Участники» / «Права» / «Справочники» / «Шаблоны» / «Корзина»

## Файлы

- `src/hooks/usePageTitle.ts` (new) — хук
- `src/page-components/ProjectPage.tsx` — project name
- `src/page-components/BoardPage/index.tsx` — board name
- `src/page-components/WorkspacePage.tsx` — workspace name
- `src/page-components/InboxPage/index.tsx` — «Входящие»
- `src/page-components/TasksPage/index.tsx` — «Задачи»
- `src/page-components/BoardsPage/index.tsx` — «Доски»
- `src/page-components/ProjectsPage.tsx` — «Проекты»
- `src/page-components/DashboardPage.tsx` — «Дашборд»
- `src/page-components/ProfilePage.tsx` — «Профиль»
- `src/page-components/WorkspacesPage.tsx` — «Рабочие пространства»
- `src/page-components/WorkspaceSettingsPage.tsx` — по активной вкладке (карта `SETTINGS_TAB_TITLES`)
