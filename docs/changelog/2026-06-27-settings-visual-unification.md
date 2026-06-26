# Унификация визуальных стилей раздела настроек воркспейса

**Дата:** 2026-06-27
**Тип:** refactor (UI)
**Статус:** completed (ждёт деплоя фронта)

Раздел настроек был визуально разнородным: боковые панели на разных вкладках
отличались по стилю, заголовки дублировались, обёртки контента — разные.
Унифицировано.

## Единая боковая под-навигация

Новый общий компонент `SettingsSubNav` (`components/SettingsSubNav.tsx`) —
единый стиль панели для всех вкладок с под-навигацией: активный пункт `amber`,
фон `bg-white`, группы с UPPERCASE-заголовками, опциональные иконка и
бейдж-счётчик. На него переведены:

- `ParticipantsSidebar` (фильтр по ролям, с бейджами-счётчиками).
- `DirectoriesTab` (группы Статусы/Роли/Шаблоны/Финансы/Данные).
- `TemplatesTab` (группы Анкеты/Наборы/Треды/Генерация).
- `IntegrationsTab` — был аутлайером (`bg-muted`/`text-muted-foreground`,
  `py-2`, без рамки-карточки) → теперь как все.

## Единый заголовок раздела

Раньше 6 вкладок рендерили свой `<h2>`, дублируя общий `<h1>` из
`WorkspaceSettingsPage`. Теперь заголовок один: `WorkspaceSettingsPage`
показывает `<h1>` + описание из карты `SETTINGS_TAB_DESCRIPTIONS`. Локальные
дубли убраны из General, Permissions, Directories, Domain, Trash (у Participants
оставлен динамический контентный заголовок — он показывает выбранную роль).

## Единая обёртка контента панельных вкладок

`Интеграции` обёрнуты в ту же карточку `flex bg-white rounded-lg border
min-h-[500px]`, что Справочники/Шаблоны (раньше был голый `flex gap-6`).

## Файлы

- `src/page-components/workspace-settings/components/SettingsSubNav.tsx` (новый)
- `src/page-components/workspace-settings/components/ParticipantsSidebar.tsx`
- `src/page-components/workspace-settings/DirectoriesTab.tsx`
- `src/page-components/workspace-settings/TemplatesTab.tsx`
- `src/page-components/workspace-settings/IntegrationsTab.tsx`
- `src/page-components/WorkspaceSettingsPage.tsx`
- `src/page-components/workspace-settings/GeneralSettingsTab.tsx`
- `src/page-components/workspace-settings/PermissionsTab.tsx`
- `src/page-components/workspace-settings/DomainSettingsTab.tsx`
- `src/page-components/workspace-settings/TrashTab.tsx`
