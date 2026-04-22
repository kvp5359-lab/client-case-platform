# История в боковой панели, контекстное меню, Gotenberg-proxy и полировка мессенджера

**Дата:** 2026-04-22
**Тип:** feat + fix + refactor
**Статус:** completed

---

## Контекст

Сессия началась с косметики (пропавшие отступы между бабблами в истории проекта), перетекла в рефакторинг поповеров мессенджера по образцу Telegram (правая кнопка мыши → меню, единая точка истины), потом выросла в портирование «Всей истории» проекта внутрь боковой панели треда, и завершилась починкой генерации PDF — упавшей после какого-то старого рефакторинга nginx. Ниже по блокам.

---

## 1. Контекстное меню + три точки вместо hover-кнопок

**Проблема:** при наведении на баббл вылезали три отдельные кнопки (Ответить, Цитировать, реакция) + «…», которые перекрывали текст сообщения в узких бабблах.

**Решение:** оставлена единственная кнопка «три точки» в правом верхнем углу бабла. Весь набор действий (включая quick reactions и полный пикер) открывается:
- кликом по «…» (DropdownMenu);
- правой кнопкой мыши по баблу (ContextMenu).

Единый источник правды — функция `renderMessageMenuBody(components, props)`, принимающая набор примитивов (Item/Separator/Sub/SubTrigger/SubContent) из любой библиотеки Radix. В [`MessageActions.tsx`](../../src/components/messenger/MessageActions.tsx) рендерится дважды: с `DropdownMenu*`-примитивами и с `ContextMenu*`-примитивами. Меню идентичное, дублирования JSX нет.

Новый UI-примитив [`src/components/ui/context-menu.tsx`](../../src/components/ui/context-menu.tsx) — shadcn-стиль обёртка над `@radix-ui/react-context-menu` (по шаблону имеющегося dropdown-menu).

Визуал кнопки: `MoreVertical` (вертикальные точки), top-right, фон в цвет бабла (через `bubbleStyles[accent].own/incoming`) — сливается с баблом, перекрывает галочку статуса в коротких однострочных сообщениях. Цвет точек — контрастный к фону (`text-white` на своих, `text-gray-900` на входящих).

## 2. Динамические quick-reactions

Вместо статичных `REACTIONS.slice(0, 6)` — частые эмодзи пользователя из localStorage. Сохраняется в ключе `cc:recentReactions:v1` как массив `{emoji, count, lastUsed}`. Хук [`useQuickReactions`](../../src/hooks/messenger/useQuickReactions.ts) через `useSyncExternalStore` — стабильный снапшот с инвалидацией на запись. SSR-fallback — дефолтные `REACTIONS.slice(0, 6)`.

Помощник [`trackReactionUsage`](../../src/utils/messenger/recentReactions.ts) вызывается при явном выборе эмодзи (ряд + полный пикер), НЕ при снятии существующей реакции — это не показатель предпочтения. Если в памяти меньше 6 эмодзи, ряд добивается дефолтами в порядке из `REACTIONS`.

## 3. Одна реакция на пользователя на сообщение

Раньше RPC `toggle_message_reaction` только включала/выключала конкретный эмодзи. Если у пользователя уже стоял 🎉 и он кликнул 🙏 — обе реакции висели. Теперь [миграция `20260422_toggle_reaction_single_per_user.sql`](../../supabase/migrations/20260422_toggle_reaction_single_per_user.sql):
- Есть реакция того же эмодзи → удалить (снять).
- Есть реакция ДРУГОГО эмодзи → удалить старую + вставить новую (атомарно в одной транзакции RPC).
- Нет реакции → вставить.

Возвращаемое значение то же: `TRUE` если реакция в итоге стоит, `FALSE` если снята. Telegram-sync в [`messengerReactionService.ts`](../../src/services/api/messenger/messengerReactionService.ts) не пришлось трогать — `setMessageReaction` в TG API принимает массив, передача `[{emoji: new}]` автоматически заменяет предыдущую.

## 4. Реакции больше не перекрывают текст, баббл расширяется

Раньше `ReactionBadges` был `absolute bottom-0 left-0` внутри бабла. При большом количестве (много людей поставили реакции) badges наслаивались на текст сообщения и уходили за границы `overflow-hidden`.

Теперь [`ReactionBadges.tsx`](../../src/components/messenger/ReactionBadges.tsx) рендерится как сибл в нормальном потоке (`relative -mt-2 ml-2 z-10`) — частично заезжает на нижний край бабла (как в Telegram/iMessage), но при `flex flex-wrap` занимает столько строк, сколько нужно, баббл естественно растёт по вертикали. Убран `pb-8`-хак на баббле ([`MessageBubble.tsx`](../../src/components/messenger/MessageBubble.tsx)) и absolute-таймстамп для случая реакций — таймстамп inline в тексте теперь всегда отображается (убран ненужный `hasReactions` prop из [`BubbleTextContent.tsx`](../../src/components/messenger/BubbleTextContent.tsx)).

## 5. «Вся история» внутри боковой панели треда

Раньше «Вся история» проекта была только на уровне вкладок проекта (`tab=history`). Теперь доступна прямо из TaskPanel — кнопка «История» рядом с «Другие задачи».

Вынесен компонент [`AllHistoryContent`](../../src/components/history/AllHistoryContent.tsx) из `HistoryTabContent.tsx` — переиспользуется и там, и в панели.

В [`TaskPanel.tsx`](../../src/components/tasks/TaskPanel.tsx):
- Локальный `viewMode: 'thread' | 'history'`, переключается кнопкой «История», сбрасывается на `'thread'` при смене треда в стеке.
- Клик по названию треда в разделителе ChatDivider → `onOpenThreadInStack(...)` → пушит выбранный тред поверх стека (с кнопкой «Назад» в шапке). Если клик на тот же тред, что сейчас активен — просто закрывает режим истории.
- Загружается `message_read_status` по всем тредам проекта (`Map<thread_id, last_read_at>`) — прокидывается в `TimelineFeed`, чтобы красная рамка «непрочитано» в бабблах работала как в обычном мессенджере.

В [`TaskPanelTaskHeader.tsx`](../../src/components/tasks/TaskPanelTaskHeader.tsx):
- В режиме истории заголовок = «История» (и иконка `History` слева вместо StatusDropdown/иконки чата).
- Для чатов/email в обычном режиме слева теперь иконка самого чата (в его accent-цвете), а не пустой серый кружок статуса задачи.
- Размер названия задачи уменьшен до `text-sm`, проект в той же строке (rounded link с external-иконкой), серая точка-разделитель `•` между названием задачи и проектом. «Другие задачи» + дедлайн остались во второй строке.

## 6. Timeline — разные полировки

В [`TimelineFeed.tsx`](../../src/components/history/TimelineFeed.tsx):
- **Разделитель чата** теперь считается глобальным проходом по ленте (`Set<message_id>`), а не локально в рамках дня — смена даты внутри того же треда больше не добавляет лишнюю строку с названием. Вставка только там, где реально меняется `thread_id`.
- **Показ аватара/имени** (`showAvatar`) форсируется `true` после каждого `ChatDivider` — раньше первое сообщение нового чата в истории шло без аватара, если предыдущее сообщение (в другом чате) было от того же отправителя.
- **Автоскролл вниз** при начальной загрузке был 3-секундной гонкой (`scrollIntoView` на каждое изменение длины). Теперь — one-shot после первой пачки данных, плюс любой `wheel`/`touchmove` сразу блокирует эффект.
- **Аудит-события** теперь рендерятся не отдельным `ActivityItem` с иконкой слева, а новым [`AuditPill`](../../src/components/history/AuditPill.tsx) — визуально идентичным `ServiceMessage` из мессенджера (центрированная пилюля с временем, цветные имена статусов через inline `color`, форматирование для `change_deadline`/`rename`). Карта `Map<id, {name, color}>` строится в `AllHistoryContent` из `useTaskStatuses(workspaceId)`.
- **Миграция `get_project_history` RPC** ([`20260422_history_actor_name_from_participant.sql`](../../supabase/migrations/20260422_history_actor_name_from_participant.sql)) — теперь имя актора берётся из `participants.name + last_name` в воркспейсе проекта. Раньше бралось из `auth.users.raw_user_meta_data.full_name`, куда могло осесть имя Google OAuth-профиля (не совпадающее с именем пользователя в сервисе — например, «Денис» в сервисе отображался как «Ксения Прудникова», потому что он использует чужой Google Диск). Цепочка fallback: participant → raw_user_meta_data.full_name → .name → split email.

## 7. Скролл-перформанс мессенджера

Жалоба: дёрганье при прокрутке на тачпаде MacBook в чате и истории.

Частично починено:
- В [`MessageList.tsx`](../../src/components/messenger/MessageList.tsx) `contentVisibility: auto` с `containIntrinsicSize: auto 80px` давал reflow при входе бабла в вьюпорт (80px — сильно меньше реальной высоты). Теперь включается только при `messages.length > 300` и с резервом `200px`. Добавлен `overflow-anchor: none` на скролл-контейнере, чтобы браузерный scroll-anchoring не конкурировал с ручной компенсацией `scrollTop` при подгрузке старых сообщений.
- Аналогично `overflow-anchor: none` в [`AllHistoryContent.tsx`](../../src/components/history/AllHistoryContent.tsx).

Полностью не помогло, баг зарегистрирован в [`docs/bugs/open/2026-04-22-scroll-jitter-touchpad.md`](../bugs/open/2026-04-22-scroll-jitter-touchpad.md) для последующей проработки (кандидаты: Radix ScrollArea vs plain div, sticky day headers, лишние React re-renders во время скролла).

## 8. Копирование с форматированием

В контекстном меню «Копировать текст» раньше писало в буфер обмена только `text/plain` (через `stripHtml`). Теперь, если контент содержит HTML, параллельно пишется `text/html` + `text/plain` через `ClipboardItem` — вставка в Word/Notion/Google Docs сохраняет жирный/курсив/ссылки, простые поля получают plain text. Fallback на `writeText` если `ClipboardItem` недоступен.

## 9. ImageLightbox — портал в body

При клике на вложенную картинку в сообщении внутри `TaskPanel` лайтбокс (`fixed inset-0 z-50`) отображался ЗАЖАТЫМ в границах правой боковой панели, а не на весь экран. Причина — CSS-правило: `position: fixed` перестаёт быть относительно viewport, если в предках есть элемент с `transform` (`translate-x-full`/`translate-x-0` у `.side-panel`).

[`ImageLightbox.tsx`](../../src/components/messenger/ImageLightbox.tsx) теперь рендерится через `createPortal(... , document.body)` — гарантированно на top-level, вне любых transformed-контейнеров.

## 10. PDF-генерация — Gotenberg proxy

**Симптом:** кнопка «Сгенерировать PDF» возвращала 500 с `{error: "Failed to convert document to PDF"}`. В обычный период работы эта фича ломалась молча после какого-то рефакторинга nginx-конфига.

**Диагностика:** временно добавили в catch-блок [`generate-document/index.ts`](../../supabase/functions/generate-document/index.ts) вывод текста исключения и HTTP-статуса Gotenberg в response body. Ответ: `Gotenberg 404: Server action not found.` — значит сервис Gotenberg жив и отвечает, но отбивает путь `/forms/libreoffice/convert`.

**Причина:** nginx-конфиг `/opt/relostart/nginx/conf.d/app-relostart.conf` имел location-блок только `/` (проксирование на `clientcase-app`). Раньше (по логам gotenberg: `remote_ip: <AWS IP>, host: app.relostart.com, path: /forms/libreoffice/convert, status: 200`) этот location существовал и проксировал на контейнер gotenberg. При каком-то последующем переписывании конфига его убрали, и запросы на `/forms/...` стали уходить в Next.js и возвращать 404.

**Фикс** (на VPS, не в git):
- В `app-relostart.conf` добавлен `upstream gotenberg { server gotenberg:3000; keepalive 16; }` (контейнер в общей docker-сети `relostart_web`).
- Location `/forms/libreoffice/convert` проксирует туда с проверкой header `X-Gotenberg-Token` (нет совпадения → `403`). Параметры буферизации и таймаутов подкручены под большие DOCX: `proxy_request_buffering off`, `client_max_body_size 50m`, `proxy_read_timeout 120s`.
- Supabase secrets `GOTENBERG_TOKEN` и `GOTENBERG_URL` перезаписаны новыми значениями (токен — `openssl rand -hex 32`, URL — `https://app.relostart.com`).
- Проверка: `curl -X POST https://app.relostart.com/forms/libreoffice/convert` без токена → `403`, с правильным токеном → `415 Unsupported Media Type` (ожидаемо — Gotenberg ждёт multipart, в который наш edge-function его упакует).

Бэкап старого конфига: `/opt/relostart/nginx/conf.d/app-relostart.conf.bak-<timestamp>`. Новый конфиг на VPS, в git этих правок нет — инфра живёт отдельно от репозитория.

## Результат

- Единый механизм меню (dropdown + contextmenu) — меньше hover-шума на бабблах.
- Реакции не перекрывают текст, баббл растёт, одна реакция на пользователя.
- Quick-reactions подстраиваются под привычки пользователя.
- «Вся история» проекта доступна прямо в TaskPanel с корректным переключением режимов, красной рамкой непрочитанных и переходом к треду по клику на разделитель.
- Аудит-события в истории выглядят как в чате — цветные имена статусов через миграцию RPC и mapping на клиенте. Акторы показывают правильное имя из сервиса.
- Копирование текста из сообщения вставляется с форматированием в Word/Notion.
- Лайтбокс больше не зажимается в TaskPanel.
- Генерация PDF работает — nginx-прокси на Gotenberg восстановлен.
- Баг дёрганья скролла залогирован в открытые — будем тщательно прорабатывать позже.
