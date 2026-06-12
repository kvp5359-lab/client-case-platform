# Пересылка сообщений и файлов через «буфер пересылки»

**Дата:** 2026-06-11
**Тип:** feature (замена старого механизма)
**Статус:** completed (ждёт смок-теста в проде)

---

## Что было

Пересылка работала через подменю «Переслать в чат» в меню сообщения: выбор
целевого треда из готового списка проекта → принудительный переход в этот тред →
текст сообщения всегда превращался в blockquote, вложения — в чипы. Минусы:
нельзя переслать отдельный файл, нельзя несколько чатов/мультивыбор, текст всегда
цитата, выдёргивает из текущего чата.

## Что стало

**Буфер пересылки** — глобальный накопитель с гранулярными блоками.

- **Добавление в буфер:**
  - «Переслать сообщение» в меню сообщения — раскладывает сообщение на блоки:
    текстовый блок (если есть текст) + по блоку на каждое вложение.
  - «Переслать» в меню файла (`AttachmentMenuButton`) — кладёт один файл-блок.
- **Вставка:** плашка `ForwardBufferBar` над полем ввода показывается в **любом**
  чате, пока буфер не пуст. Чекбоксы — что взять, переключатель формата для
  текста (**Оригинал / Цитата**), кнопка **«Вставить»**. Вставка НЕ отправляет:
  текст идёт в редактор (цитата — `<blockquote>Переслано от <b>автор</b></blockquote>`,
  оригинал — как есть), файлы — в чипы вложений композера. Дальше пользователь
  отправляет обычной кнопкой. Вставленные блоки убираются из буфера.

Буфер глобальный (`sidePanelStore.forwardBuffer`), переживает переход между
чатами/проектами, в памяти (reset чистит). Несколько текстовых блоков
вставляются одним `insertContent` — соседними цитатами, без вложения друг в друга.

## Почему файлы доходят клиенту во внешний канал

Пересылка переиспользует существующий путь `forwardedAttachments`: в
`message_attachments` пишется ссылка на тот же `file_id`/`storage_path` без
перезаливки. `telegram-send-message` резолвит файл по `file_id`→`files`→signed
URL (не по `telegram_file_id`, которого у forwarded-вложения из чужого чата нет),
`wazzup-send` — signed URL в `contentUri`. **Бэкенд/edge не менялись.**

## Фикс: вставленные файлы переживают переключение чата

**Баг:** после «Вставить» файлы попадали в поле ввода, но при переходе на другой
диалог и обратно пропадали (текст оставался). Причина: текст сохранялся в
черновик (`localStorage: msg_draft:<thread>`), а `forwardedAttachments` был
эфемерным `useState` и терялся при перемонтировании компонента.

**Решение:** файлы-пересылки — сериализуемые метаданные (`file_id`/`storage_path`),
поэтому им сделан такой же черновик в localStorage по треду. Новый хук
[`useForwardedAttachmentsDraft.ts`](../../src/components/messenger/hooks/useForwardedAttachmentsDraft.ts):
lazy-init из localStorage, перечитывание при смене треда (эффект + `queueMicrotask`,
как в `useDraftMessage`), персист на каждое изменение, очистка ключа при
отправке/очистке. В `useMessengerState` `useState` заменён на этот хук.

## Фикс: буфер пересылки переживает перезагрузку страницы

**Баг:** выбранные для пересылки сообщения/файлы (буфер) пропадали при F5 —
буфер жил только в памяти (Zustand). Несогласованно с вставленными файлами,
которые уже персистились.

**Решение:** буфер сохраняется в localStorage (`cc:forward-buffer`).
Инициализируется из него при загрузке (`loadPersistedState`), пишется при
add/remove/clear, чистится при логауте (`lsClearPanelKeys`). Буфер глобальный
(на воркспейс), поэтому переживает и переход между чатами, и перезагрузку, и
закрытие вкладки.

- `src/store/sidePanelStore.localStorage.ts` — ключ `LS_KEY_FORWARD_BUFFER`,
  загрузка в `loadPersistedState`, очистка в `lsClearPanelKeys`.
- `src/store/sidePanelStore.ts` — `forwardBuffer` инициализируется из persisted,
  `lsSet` на каждой мутации.

## Затронутые файлы

- `src/components/messenger/ForwardBufferBar.tsx` (новый)
- `src/utils/messenger/forwardContent.ts` (новый — `buildForwardContent`, `toForwardedAttachments`)
- `src/store/sidePanelStore.{ts,types.ts,test.ts}` — `forwardBuffer` + `add/remove/clear`, удалён `pendingForwardMessage`
- `src/components/messenger/MessageMenuBody.tsx`, `MessageActions.tsx`, `MessageBubble.tsx`, `MessengerContext.tsx` — проп `onForward` вместо `onForwardToChat`/`forwardChats`
- `src/components/messenger/MessengerTabContent.tsx` — плашка + `handleInsertForward` + `insertContentRef`
- `src/components/messenger/MessageInput.tsx` — `insertContentRef` (вставка HTML в редактор)
- `src/components/messenger/AttachmentMenuButton.tsx` — пункт «Переслать»
- `src/components/messenger/hooks/useMessengerHandlers.ts`, `useMessengerState.ts`
- `src/components/tasks/useTaskPanelInternal.ts` — удалена авто-навигация в целевой тред
- `.claude/rules/messenger-ledger.md` — запись в журнал

## Проверки

- `npx tsc --noEmit && npm run lint && npx vitest run` — зелёные (tsc 0, lint 0, 679 тестов).
- Смок-тест доставки в TG/Wazzup живьём — **ждёт проверки в проде**.
