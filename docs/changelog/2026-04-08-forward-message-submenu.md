# Пересылка сообщений: модалка → вложенное подменю — 2026-04-08

**Дата:** 2026-04-08
**Тип:** ui
**Статус:** completed

---

## Что сделано

### Пересылка сообщений — inline submenu вместо модалки
- "Переслать в чат" в контекстном меню сообщения теперь открывает вложенное подменю (submenu) при наведении
- Список чатов с иконками и цветами отображается прямо в меню — один клик = пересылка
- Удалён отдельный компонент модалки `ForwardMessageDialog`
- Список чатов и колбэк пересылки переданы через `MessengerContext` вместо отдельного стейта модалки

---

## Затронутые файлы

- `src/components/messenger/ForwardMessageDialog.tsx` (удалён)
- `src/components/messenger/MessageActions.tsx`
- `src/components/messenger/MessageBubble.tsx`
- `src/components/messenger/MessengerContext.tsx`
- `src/components/messenger/MessengerTabContent.tsx`
- `src/components/messenger/hooks/useMessengerHandlers.ts`
