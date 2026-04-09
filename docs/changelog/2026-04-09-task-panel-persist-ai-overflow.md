# TaskPanel не закрывается при навигации + AI-панель overflow fix — 2026-04-09

**Дата:** 2026-04-09
**Тип:** fix, refactoring
**Статус:** completed

---

## Что сделано

### TaskPanel — панель треда не закрывается при навигации
- Убран обработчик click-outside (mousedown на document) — панель больше не закрывается при клике вне неё
- Закрытие только по Escape, крестику или при открытии другого треда
- Создан `TaskPanelContext` — контекст для layout-level TaskPanel
- `WorkspaceLayout` провайдит контекст — TaskPanel живёт на уровне layout и не зависит от монтирования дочерних компонентов
- `TaskListView` использует layout TaskPanel через контекст: при переключении вкладок проекта (Задачи → Документы и т.д.) панель треда остаётся открытой

### AI-панель — исправление горизонтального переполнения
- `AiMessageBubble` / `AiStreamingBubble` — добавлены `min-w-0`, `overflow-hidden`, `max-w-full` на контейнерах
- Таблицы и pre-блоки в markdown получили `overflow-x-auto` для горизонтального скролла внутри пузыря
- `AiPanelContent` — `min-w-0` + `overflow-hidden` на обёртке
- `ProjectAiChat` — убран `max-w-3xl mx-auto` (мешал в узкой панели), добавлен `overflow-hidden`
- CSS: `.side-panel [data-radix-scroll-area-viewport]` — запрет горизонтального скролла в Radix ScrollArea

### Прочее
- `.gitignore` — добавлен `.playwright-mcp/`

---

## Затронутые файлы

- `src/components/tasks/TaskPanel.tsx`
- `src/components/tasks/TaskPanelContext.tsx` (новый)
- `src/components/tasks/TaskListView.tsx`
- `src/components/WorkspaceLayout.tsx`
- `src/components/ai-panel/AiMessageBubble.tsx`
- `src/components/ai-panel/AiStreamingBubble.tsx`
- `src/components/ai-panel/AiPanelContent.tsx`
- `src/components/ai-panel/ProjectAiChat.tsx`
- `src/app/globals.css`
- `.gitignore`
