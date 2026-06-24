# Единая обёртка диалога-редактора + изоляция кликов по тостам

**Дата:** 2026-06-24
**Тип:** fix/refactor
**Статус:** completed (ждёт деплоя фронта)

---

## Проблема

1. **Редактор быстрого ответа терял текст.** Диалог редактирования шаблона
   (`QuickReplyFormDialog`) — обычный `Dialog`, закрывался по любому клику вне
   `DialogContent`. Tiptap-поповеры (цвет, выравнивание, ссылка…) рендерятся в
   портал ВНЕ диалога → клик по ним считался «снаружи» → диалог закрывался,
   несохранённый текст пропадал. То же при случайном клике по затемнению.

2. **Клик по тосту-уведомлению закрывал открытые модалки.** У кнопок тоста
   (крестик, «Прочитано», «Скрыть все») `stopPropagation` стоял только на
   `onClick`, а Radix DismissableLayer (открытые диалоги) слушает `pointerdown`
   — он срабатывает раньше `click`, поэтому окно закрывалось до гашения клика.

## Что сделано

### Единая обёртка `EditorDialogContent`
Новый `src/components/ui/editor-dialog.tsx` — `DialogContent`, который не
закрывается по клику вне (`onInteractOutside` → `preventDefault`). Один источник
для всех диалогов с редактором, чтобы не повторять баг и не сопровождать дубли.

Переведены на неё:
- `QuickReplyFormDialog` — плюс **«Сохранить» вынесена в верхнюю шапку** справа
  от поля названия, **шапка `sticky`** (прилипает при прокрутке тела), нижний
  футер убран.
- `ContextTextDialog`, `AddTextDialog` — убран дублирующий `onInteractOutside`
  (теперь в обёртке), dirty-confirm на крестик/Esc сохранён.

### Изоляция кликов по тостам
`pointerdown`-guard (`stopPropagation`) добавлен на:
- крестик «Закрыть» и «Прочитано» конкретного уведомления (`MessageToastContent`);
- «Скрыть все» (`DismissAllToasts`).

Теперь клик по этим кнопкам делает только своё и не влияет на открытые окна.

## Файлы

- `src/components/ui/editor-dialog.tsx` (новый)
- `src/components/directories/QuickReplyFormDialog.tsx`
- `src/page-components/ProjectPage/components/ContextTextDialog.tsx`
- `src/page-components/ProjectPage/components/context-dialogs/AddTextDialog.tsx`
- `src/hooks/messenger/MessageToastContent.ts`
- `src/components/DismissAllToasts.tsx`

## На будущее

Любой новый диалог с tiptap-редактором — использовать `EditorDialogContent`,
а не голый `DialogContent`, иначе клик по поповеру/затемнению снова будет терять
текст.
