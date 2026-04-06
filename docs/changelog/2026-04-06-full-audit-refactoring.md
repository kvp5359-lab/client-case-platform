# Полный аудит кодовой базы и рефакторинг

**Дата:** 2026-04-06
**Тип:** security, perf, refactor, infra
**Статус:** completed

---

## Что сделано

### Безопасность
- `src/contexts/AuthContext.tsx` — исправлен Open Redirect в Google OAuth: `nextPath` теперь проходит через `safeInternalPath()` перед передачей в redirect URL
- `src/hooks/shared/useAuthRedirect.ts` — усилена `safeInternalPath()`: добавлена защита от URL-encoded обходов и `javascript:` протокола
- `src/components/messenger/QuickReplyPicker.tsx` — замена `innerHTML` на `DOMParser` для безопасного парсинга HTML
- `src/utils/format/messengerHtml.ts` — экранирование `"` в href атрибутах linkifyText, добавлен `ALLOW_UNKNOWN_PROTOCOLS: false` в DOMPurify
- `src/hooks/messenger/useSendMessage.ts` — `Date.now()` заменён на `crypto.randomUUID()` для optimistic message ID (исключена коллизия)

### Производительность
- `src/components/tasks/TaskListView.tsx`, `src/components/documents/FloatingBatchActions.tsx`, `src/components/messenger/ChatSettingsChannels.tsx` — обёрнуты в `React.memo`
- 11 файлов: `<img>` заменён на `next/image` с оптимизацией (lazy-load, avif/webp)
- `src/hooks/comments/useCommentMutations.ts` — инвалидация сужена с `commentKeys.all` до `commentKeys.byEntity(type, id)`
- `src/hooks/messenger/useCurrentParticipant.ts` — новый React Query хук с кэшированием (staleTime: 5 мин) вместо повторных запросов в 4+ хуках
- `src/store/documentKitUI/` — добавлены 12 гранулярных селекторов (вместо широких на 22-25 полей), обновлены 5 компонентов-потребителей

### Архитектура: удаление useWorkspaceStore
- `src/store/workspaceStore.ts` — удалён Zustand store, дублировавший React Query кэш
- `src/hooks/useWorkspace.ts` — новый React Query хук (staleTime: 5 мин)
- `src/contexts/WorkspaceContext.tsx` — переписан: использует `useWorkspace` вместо Zustand
- 15 потребителей обновлены: `refreshWorkspace()` → `invalidateQueries()`

### Архитектура: MessengerContext
- `src/components/messenger/MessengerContext.tsx` — новый контекст для сессионных данных чата
- `MessageList` — было 28 пропсов, стало 7
- `MessageBubble` — было 23 пропса, стало 7

### Архитектура: FloatingBatchActions
- `src/components/documents/batch-actions/` — 7 подкомпонентов: AI, Merge, Move, Status, Delete, Visibility, Download
- `FloatingBatchActions.tsx` — с 379 строк до ~180 (тонкая обёртка)

### Архитектура: перенос компонентов из page-components
- `TemplateAccessPopover` → `src/components/knowledge/`
- `InboxChatItem` → `src/components/messenger/`
- `GenerationCard` + `GenerationEditDialog` + `GenerationSaveDialog` → `src/components/projects/DocumentKitsTab/components/`
- Устранены циклические зависимости между page-components

### Реструктуризация services/api/
- `src/services/api/messenger/` — 9 файлов (messengerService, Ai, Attachment, Draft, Participant, Reaction, ReadStatus, helpers, types)
- `src/services/api/knowledge/` — 7 файлов (Base, Conversation, Indexing, QA, Search, Stream, types)
- `src/services/api/documents/` — 4 файла + вложенная `documentKit/`
- `src/services/api/forms/` — 2 файла
- ~90 импортов обновлены

### Реструктуризация utils/
- `src/utils/files/` — 7 файлов (fileIcons, fileValidation, fileConversion, downloadBlob, mergePDF, csvParser, formatSize)
- `src/utils/format/` — 4 файла (messengerHtml, buildParticipantMap, sanitizeHtml, dateFormat)

### Конфигурация и инфраструктура
- `next.config.ts` — удалён `ignoreBuildErrors: true` (0 TS-ошибок)
- `next.config.ts` — добавлены remotePatterns для Google-доменов (аватарки, иконки Drive)
- `eslint.config.mjs` — 5 правил ужесточены с `warn` на `error` (no-unused-vars, exhaustive-deps, no-img-element, prefer-const, no-require-imports)
- 13 файлов исправлены для соответствия новым правилам ESLint
- `.env.example` — создан шаблон переменных окружения
- `.gitignore` — добавлено исключение `!.env.example`
- `src/app/(auth)/layout.tsx` — Server Component с редиректом залогиненного пользователя на /profile
- `Dockerfile` — обновлён с node:20-alpine на node:22-alpine
