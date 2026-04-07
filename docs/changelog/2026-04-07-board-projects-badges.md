# Проекты на досках, фильтры, бейджи сайдбара — 2026-04-07

**Дата:** 2026-04-07
**Тип:** feature + fix + ui
**Статус:** completed

---

## Что сделано

### 1. Проекты на досках
- Списки с `entity_type: 'project'` теперь реально отображают проекты (ранее показывали "Пусто")
- Новый компонент `BoardProjectRow` — отображение проекта в списке и карточках с иконкой папки и ссылкой
- Хук `useWorkspaceProjects` — загрузка проектов с join `project_templates(name)` для отображения шаблона
- Прокидывание проектов через цепочку `BoardTabContent → BoardView → BoardColumn → BoardListCard`

### 2. Настройки списка — переключатель типа данных
- Переключатель "Задачи / Проекты" в настройках списка с возможностью менять тип
- Раздельные опции "Что отображать": задачи (статус, дедлайн, исполнители, проект) / проекты (статус, шаблон)
- Раздельные опции сортировки и группировки по типу данных
- При смене типа — автосброс фильтров, видимых полей, сортировки

### 3. Фильтр статусов проектов
- Для поля `status` (проекты) теперь показываются статусы проектов (Активный, На паузе, Завершён, Архивирован) вместо статусов задач

### 4. Бейджи сайдбара
- Бейджи "Входящие" и "Задачи" — светло-красный фон (`bg-red-100`) + красный текст (`text-red-600`) вместо ярко-красного

---

## Затронутые файлы

- `src/components/boards/BoardProjectRow.tsx` (новый)
- `src/components/boards/hooks/useWorkspaceProjects.ts` (новый)
- `src/components/boards/BoardView.tsx`
- `src/components/boards/BoardColumn.tsx`
- `src/components/boards/BoardListCard.tsx`
- `src/components/boards/ListSettingsDialog.tsx`
- `src/components/boards/filters/FilterValueSelect.tsx`
- `src/components/boards/types.ts`
- `src/page-components/BoardsPage/index.tsx`
- `src/page-components/BoardPage/index.tsx`
- `src/components/WorkspaceSidebar/SidebarNavButton.tsx`
