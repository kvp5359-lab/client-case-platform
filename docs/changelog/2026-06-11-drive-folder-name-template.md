# Google Drive: настраиваемый шаблон имени папки проекта

**Дата:** 2026-06-11
**Тип:** feature
**Статус:** completed

---

## Было

Имя создаваемой папки проекта в Google Drive собиралось жёстко:
`БП_<дата>_<название>_<описание>` (префикс «БП» захардкожен, настройки нет).

## Стало

В типе проекта (вкладка «Интеграции», под «Корневая папка Google Drive») можно
задать **шаблон имени папки** со строкой-переменными. При создании папки проекта
переменные заменяются данными проекта. Пустой шаблон → старое поведение по
умолчанию (обратная совместимость).

**Доступные переменные:** `{project_name}`, `{contact_name}`, `{description}`,
`{short_id}`, `{template_name}`, `{date}` (ГГГГ.ММ.ДД), `{year}`, `{month}`, `{day}`.

**Флажок «Заменять пробелы нижним подчёркиванием»** — управляет финальной заменой
пробелов на `_` (разделители внутри шаблона пользователь контролирует сам).

Пример: `БП_{date}_{contact_name}` + флажок → `БП_2026.04.18_Иван_Петров`.

## Реализация

- Миграция
  [`20260611_project_template_folder_name_template.sql`](../../supabase/migrations/20260611_project_template_folder_name_template.sql)
  (применена в проде): колонки `folder_name_template text` и
  `folder_name_replace_spaces boolean DEFAULT true` на `project_templates`.
- Движок [`folderNameTemplate.ts`](../../src/lib/folderNameTemplate.ts)
  (`expandFolderNameTemplate` + реестр `FOLDER_NAME_VARIABLES`) + 7 тестов.
- UI: [`RootFolderSection.tsx`](../../src/components/templates/project-template-editor/RootFolderSection.tsx)
  — поле шаблона, чипы переменных (вставка кликом), флажок, **живое превью**,
  отдельная мутация сохранения.
- Применение при создании папки:
  [`GoogleDriveSection.tsx`](../../src/page-components/ProjectPage/components/GoogleDriveSection.tsx)
  — если шаблон задан, рендерится с подстановкой; `{contact_name}` резолвится по
  `contact_participant_id` (запрос только когда шаблон его использует).
- Проброс: `ProjectPage` → `ProjectTabsContent` → `GoogleDriveSection`;
  `useProjectData` (select колонок), `types/index.ts`, `database.ts`,
  `ProjectTemplateEditorPage`.

## Проверки

- `npx tsc --noEmit && npm run lint && npm test` — зелёные (tsc 0, lint 0, 686 тестов).
