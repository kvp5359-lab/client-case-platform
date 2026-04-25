# Legacy side panel — архив

Это архивные исходники старой «основной» правой боковой панели проекта, которая
жила в `WorkspaceLayout` рядом с новой системой вкладок треда. Заменена на
**единую систему вкладок треда** (`TaskPanelTabbedShell` + `TaskPanelTabBar`).

## Что здесь

- **`PanelTabs.tsx`** — шапка с тремя вкладками (Чаты / Ассистент / Дополнительно).
- **`MessengerPanelContent.tsx`** — содержимое вкладки «Чаты»: список тредов
  проекта (client/internal), бейджи непрочитанных, переключение каналов.
- **`ChatSettingsSection.tsx`** — обёртка над `ChatSettingsDialog` для создания
  и редактирования чатов из контекста основной панели.

## Что НЕ архивировано (используется новой системой)

- `AiPanelContent` — рендерится внутри вкладки «Ассистент» новой системы.
- `ExtraPanelContent` — рендерится внутри вкладки «Дополнительно».
- `ChatSettingsDialog` — используется напрямую в `TaskPanel` для редактирования.

## Как восстановить

Если что-то понадобится:

1. `git mv src/_archive/legacy-side-panel/<File>.tsx src/components/<File>.tsx`
2. Восстановить импорты и рендер в `WorkspaceLayout.tsx` (см. историю git до
   удаления, коммит-удаление).

## Связанные изменения

- `useSidePanelStore` остался — используется в нескольких местах для `pageContext`,
  `chatsEnabled`, `activeChatId`. Его методы `openPanel`, `openChat`,
  `openMessenger`, `togglePanel`, `closePanel` больше не вызываются из UI — но
  типы оставлены, чтобы не ломать тесты и старый код в архиве.
