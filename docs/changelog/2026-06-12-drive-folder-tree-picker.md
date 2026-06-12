# Дерево папок Google Drive: единый пикер, мастер создания подпапок, создание папки проекта

**Дата:** 2026-06-12
**Тип:** feature + refactor
**Статус:** completed (фронт проверен локально lint/tsc; edge-функция задеплоена)

---

## Что было

Диалог «Создать папки на Google Drive» (меню набора документов → подпапки) и
диалог «Добавить анкету» (Google Таблица → создать копию из шаблона) выбирали
целевую папку **плоским списком**: корень проекта + только папки первого уровня.
Вложенность глубже не отображалась, имя корня бралось отдельным запросом
(`google-drive-get-folder-name`), а пункт меню «Создать папки» был доступен
только если папка проекта уже подключена. Нумерация подпапок жёстко начиналась
с 1, удалить лишние из списка было нельзя, всё помещалось в одно окно без шагов.

## Что стало

### 1. Рекурсивное дерево папок в edge function

`supabase/functions/_shared/googleDriveHelpers.ts`:
- `getFileName(folderId)` — имя папки по id (один GET к Drive).
- `listFolderTree(folderId, { maxDepth=6, maxNodes=500 })` — последовательный
  рекурсивный обход подпапок (по одной, чтобы не упереться в rate limit Google),
  возвращает вложенное дерево `{ id, name, children }` + флаг `truncated` при
  достижении лимита глубины/числа узлов.

`supabase/functions/google-drive-create-folder/index.ts`:
- `action: 'list'` теперь дополнительно отдаёт `folderName` (имя корня).
- Новый `action: 'tree'` — `{ folderName, tree, truncated }` за один запрос.

### 2. Переиспользуемый `DriveFolderTreePicker`

`src/components/google-drive/DriveFolderTreePicker.tsx` (новый) — общий выбор
папки деревом:
- корень проекта (с реальным именем + пометкой «(корень проекта)») и
  раскрываемая/сворачиваемая иерархия подпапок на любой глубине;
- натуральная сортировка по имени (1, 2 … 10, рекурсивно);
- `autoSelectRoot` — авто-выбор корня после загрузки;
- `reloadKey` — форсит перезагрузку дерева (после создания новой папки);
- индикатор загрузки, пустого состояния и усечения (`truncated` —
  без тихого обрезания, явная подпись).

### 3. Диалог подпапок — двухшаговый мастер

`CreateDriveFoldersDialog.tsx`:
- **Шаг 1 «Куда»** — дерево (`DriveFolderTreePicker`) + кнопка «Новая папка»,
  создающая папку **в выбранной** папке (а не всегда в корне); после создания
  дерево перезагружается.
- **Шаг 2 «Подпапки»** — список секций набора: переименование, **тумблер
  нумерации** (вкл/выкл) + **начальный номер**, **удаление** лишних строк
  (крестик внутри поля, по наведению), плашка выбранной папки с кнопкой
  «Изменить» (возврат на шаг 1).
- Высота окна увеличена (`max-h-[85vh]`, прокрутка).
- **Создание папки проекта прямо из диалога**, если у проекта ещё нет папки на
  Drive: переиспользует `onCreateGoogleDriveFolder` из настроек проекта
  (создаёт папку в `root_folder_id` шаблона + сохраняет ссылку). После создания
  диалог сам переходит к выбору папок. Пункт меню «Создать папки» теперь
  доступен и без подключённой папки.

Проброс новых пропсов: `ProjectTabsContent` → `DocumentsTabContent` →
`CreateDriveFoldersDialog` (`onCreateProjectFolder`, `rootFolderId`,
`defaultProjectFolderName`).

### 4. Диалог анкеты — на общий пикер

`BriefTemplateStep.tsx`: плоский список «Папка на Google Drive» заменён на
`DriveFolderTreePicker` (`autoSelectRoot`). Бонусом бриф теперь умеет выбирать
вложенные папки на любой глубине. Удалён отдельный вызов
`google-drive-get-folder-name` — имя корня приходит из `action: 'tree'`.

## Затронутые файлы

- `supabase/functions/_shared/googleDriveHelpers.ts` — `getFileName`, `listFolderTree`
- `supabase/functions/google-drive-create-folder/index.ts` — `folderName` в `list`, новый `tree`
- `src/components/google-drive/DriveFolderTreePicker.tsx` — новый общий компонент
- `src/page-components/ProjectPage/components/Documents/CreateDriveFoldersDialog.tsx` — мастер, нумерация, удаление, создание папки проекта
- `src/page-components/ProjectPage/components/DocumentsTabContent.tsx` — проброс пропсов, разгейчивание меню
- `src/page-components/ProjectPage/components/ProjectTabsContent.tsx` — проброс пропсов
- `src/components/projects/add-form-kit/BriefTemplateStep.tsx` — переход на общий пикер

## Деплой

- Фронт — через CI (push в main).
- Edge `google-drive-create-folder` — задеплоена отдельно
  (`supabase functions deploy google-drive-create-folder`). **Обязательна**:
  оба диалога теперь зовут `action: 'tree'`, которого до деплоя в проде не было.

## Проверки

- `npm run lint` — 0 по затронутым файлам, `tsc --noEmit` — чисто.
- Флоу проверялся в UI по ходу: дерево, имя корня, выбор/создание папки в
  выбранном узле, нумерация (вкл/выкл, начальный номер), удаление подпапок,
  двухшаговый мастер, создание папки проекта при отсутствии подключённой.
