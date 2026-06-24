# Добавление элементов из шаблона в существующий проект

**Дата:** 2026-06-24
**Тип:** feature
**Статус:** completed (ждёт деплоя фронта + смок)

---

## Проблема

Если при создании проекта не отметить задачи/наборы/анкеты — позже добавить их
массово было нельзя, только по одной через «Создать → шаблон». Механизм
массового создания из шаблона существовал только в момент создания проекта
(`CreateProjectDialog`).

## Что сделано

Переиспользован механизм наполнения проекта из шаблона для **уже существующего**
проекта.

### Движок
- Из `createProjectFromTemplate` выделена функция **`seedProjectContent(projectId, …)`**
  — наполняет проект контентом (наборы документов, анкеты, задачи из
  thread_templates, разворачивание плана). `createProjectFromTemplate` стал
  тонким: создать проект → `seedProjectContent`.
- Параметр **`appendMode`**: для существующего проекта задачи, уже
  инстанциированные (по `source_template_id`), пропускаются; новые задачи и
  блоки плана аппендятся в КОНЕЦ (sort после существующих), а не перенумеровывают
  проект. Наборы/анкеты повтор допускают by design.
- `buildPlanSeed` получил `sortOffset` для аппенда.

### UI
- **`useProjectTemplateContent`** — общий хук загрузки контента шаблона (4
  запроса + нормализация). `CreateProjectDialog` переведён на него (убрано
  дублирование).
- **`AddFromTemplateDialog`** — диалог на том же `TemplateItemsList`. Уже
  добавленные задачи скрыты, недостающее предотмечено.
- **Иконка-кнопка** (FolderPlus) рядом с селектором шаблона в настройках
  проекта — открывает диалог для текущего шаблона.
- **Тост-предложение при смене шаблона** проекта («Шаблон изменён → Добавить?»)
  с кнопкой, открывающей тот же диалог. Авто-применения нет, старое не удаляется.

## Файлы

- `src/services/projects/createProjectFromTemplate.ts` — `seedProjectContent`, appendMode, sortOffset.
- `src/components/projects/create-project/useProjectTemplateContent.ts` (новый)
- `src/components/projects/AddFromTemplateDialog.tsx` (новый)
- `src/components/projects/CreateProjectDialog.tsx` — на общий хук.
- `src/components/projects/create-project/TemplateItemsList.tsx` — проп `title`.
- `src/page-components/ProjectPage/components/ProjectSettingsSection.tsx` — иконка-кнопка.
- `src/page-components/ProjectPage/components/ProjectTabsContent.tsx` — проброс.
- `src/page-components/ProjectPage.tsx` — тост + рендер диалога.

## Смок

В существующем проекте: иконка у селектора шаблона → выбрать элементы → добавились,
дубли задач не создались, план встал в конец; смена шаблона показывает тост
с кнопкой «Добавить».
