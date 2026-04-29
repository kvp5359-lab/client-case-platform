# Вкладки боковой панели подтягивают свежие название/цвет/иконку треда

**Дата:** 2026-04-29
**Тип:** fix
**Статус:** completed

---

## Контекст

В `task_panel_tabs` (БД) и в `localStorage` хранится снапшот треда на момент открытия вкладки: `meta.accentColor`, `meta.icon`, `title`. После того как пользователь меняет настройки чата (название, цвет, иконку) через диалог настроек, тред в БД обновляется, но вкладка в баре боковой панели продолжает показывать старые значения, пока её не закроют и не откроют заново.

## Решение

В `TaskPanelTabbedShell` добавлен `useProjectThreads(projectId)` — fresh-данные тредов scope-проекта. Перед передачей в `TaskPanelTabBar` каждая thread-вкладка обогащается актуальными `name`, `accent_color`, `icon` из БД (через `Map<id, thread>`). Вкладки из других проектов (если scope сменился) фолбэкают на закэшированный `meta`.

`useUpdateThread` уже инвалидирует ключ `useProjectThreads`, поэтому изменения в настройках чата подтягиваются мгновенно.

## Файлы

- `src/components/tasks/TaskPanelTabbedShell.tsx` — `useProjectThreads` + merge meta в `visibleTabs`

## Почему так

**Merge на уровне Shell, не TabBar.** Альтернатива — тащить `useProjectThreads` внутрь `TaskPanelTabBar`. Но Bar — глупый презентер, не должен лезть в data-слой. Shell уже знает `projectId` и работает с tabs — там и место для merge.

**Fresh поверх snapshot, а не вместо.** Если скоупим в чужом проекте и встретим вкладку без свежих данных — нужно показать хоть что-то. Snapshot в `tab.meta` — fallback. Так не теряем UX при переключении scope.
