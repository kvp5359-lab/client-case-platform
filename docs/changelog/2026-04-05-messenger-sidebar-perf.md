# Мессенджер, сайдбар, оптимизация прав доступа

**Дата:** 2026-04-05
**Тип:** fix, perf, ui
**Статус:** completed

---

## Что сделано

### Мессенджер: исправление дрожания чата при скролле истории
- `src/components/messenger/MessageList.tsx` — автоскролл вниз больше не срабатывает при подгрузке старых сообщений (отличаем добавление сверху/снизу по `firstId`/`lastId` вместо длины массива)
- Сохранение scroll-позиции при добавлении старых сверху: фиксируется `scrollHeight` до запроса, после рендера компенсируется `scrollTop` на дельту высоты — видимые сообщения больше не прыгают

### Мессенджер: фиксы React-варнингов и утечек каналов
- `src/hooks/messenger/useAiSources.ts`, `src/hooks/messenger/useMessengerAi.ts` — уведомление родителя о смене состояния вынесено из `setState` в `useEffect` (устранён setState во время рендера)
- `src/hooks/messenger/useTypingIndicator.ts` — учтён префикс `realtime:`, который Supabase добавляет к topic каналов, чтобы находить и удалять старые presence-каналы

### Сайдбар: клиентские вкладки проекта с анимацией
- `src/components/WorkspaceSidebar/ProjectListItem.tsx` — вкладки разворачиваются через Radix Collapsible (плавная CSS-анимация grid-rows), активный проект оборачивается в рамку с фоном
- `src/components/WorkspaceSidebarFull.tsx` — убран лишний запрос за проектом: `template_id` берётся из уже загруженного списка projects
- Вкладки не мерцают при переключении проектов — показывается предыдущий список, пока грузятся новые
- `searchParams` читается через `useSearchParams()` вместо `window.location` (корректно для SSR)

### Оптимизация прав доступа к проекту
- `src/hooks/permissions/useProjectPermissions.ts` — запрос прав объединён в один с JOIN через `participants!inner` (было 2 последовательных roundtrip — сначала participant, потом project_participants)
- Добавлены `staleTime`, `gcTime`, `keepPreviousData`, отключён `refetchOnWindowFocus` для project, participant и roles-запросов
- `src/page-components/ProjectPage/hooks/useProjectAccess.ts` — те же оптимизации кеширования
- `src/page-components/ProjectPage/hooks/useProjectData.ts` — новый хук `useProjectTemplate(templateId)` для загрузки шаблона без запроса проекта

### Инфраструктура
- `package.json`, `.claude/rules/infrastructure.md` — порт dev-сервера возвращён на 8080
- `deploy/nginx-clientcase.conf` — новый объединённый конфиг для двух доменов (app.relostart.com + clientcase.kvp-projects.com) на один upstream (порт 3002)
- `deploy/nginx-app-relostart.conf` — удалён (заменён объединённым конфигом)
