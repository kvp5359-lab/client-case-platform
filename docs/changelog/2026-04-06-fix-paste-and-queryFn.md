# Фиксы после рефакторинга 2026-04-06

**Дата:** 2026-04-06
**Тип:** fix
**Статус:** completed

---

## Что сделано

### 1. Вставка изображений из буфера обмена в чат
- `src/components/messenger/MinimalTiptapEditor.tsx` — перенесён обработчик paste из React `onPaste` на обёрточном div в ProseMirror `editorProps.handlePaste`

**Причина:** Tiptap (ProseMirror) перехватывал paste event внутри contentEditable раньше, чем он всплывал до React-обработчика на div. Из-за этого Ctrl+V с картинкой в буфере просто игнорировался.

### 2. Ошибка «No queryFn was passed» на вкладках «История» и «Задачи»
- `src/components/history/HistoryTabContent.tsx` — добавлен `queryFn` в useQuery с `enabled: false`
- `src/components/tasks/UnreadBadge.tsx` — то же самое

**Причина:** React Query v5 требует наличие `queryFn` даже при `enabled: false`. Оба компонента читают inbox-кэш через `select`, сам запрос не выполняется — но без заглушки `queryFn` кидалась console error.

### 3. Бейджи непрочитанных не сбрасывались после отправки сообщения
- `src/hooks/messenger/useSendMessage.ts` — заменён `inboxKeys.threads()` (v1) на `invalidateMessengerCaches()` (v1 + v2 + sidebar)

**Причина:** После отправки сообщения инвалидировался только устаревший ключ кэша v1. Сайдбар и вкладка «Чаты» используют v2 — бейджи оставались до перезагрузки страницы.

### 4. Ошибка «Не удалось обновить диалог» при входе клиентом
- `src/components/ai-panel/ProjectAiChat.tsx` — заменён `updateConversation` (через `safeFetchOrThrow` → `console.error`) на прямой Supabase-запрос с `logger.debug`

**Причина:** У клиентских пользователей нет RLS-доступа к `knowledge_conversations`. `safeFetchOrThrow` логировал через `console.error`, что вызывало Next.js Error Overlay. Сохранение sources — не критичная операция, ошибку можно игнорировать.
