# Переводчик сообщений и фиксы превью уведомлений

**Дата:** 2026-05-14
**Тип:** feature (large) + fix (medium)
**Статус:** completed

---

## Контекст

Долго работаем с клиентами на нескольких языках через один интерфейс — менеджер пишет на русском, клиент на испанском/английском. Раньше перевод делали внешним сервисом, копировали туда-сюда. Сделали встроенный переводчик: входящие сообщения можно перевести на свой язык, исходящие — наоборот, написать на своём и отправить переводом, оригинал виден только автору. Заодно починили три бага в превью уведомлений (HTML entities, иконка треда, литерал «Проект» в личных диалогах).

## Главное: переводчик сообщений

### Что появилось у юзера

1. **Селект «Мой язык» в `/profile`** ([TranslationLanguageSection](../../src/page-components/ProfilePage/TranslationLanguageSection.tsx)) — 20 языков. Запись применяется ко всем participant'ам юзера (один язык на все воркспейсы), но БД хранит per-workspace — если потом надо будет разный, расширим без миграции.
2. **Меню сообщения → «Перевести»** ([MessageMenuBody](../../src/components/messenger/MessageMenuBody.tsx)). После клика — текст в баббле заменяется на перевод, в углу баббла появляется пилюля-toggle «🌐 RU» (видна на ховер). Клик по пилюле — переключение «оригинал ↔ перевод» внутри того же баббла, без отдельных блоков снизу.
3. **Split-кнопка перевода в композере** ([TranslateActionButton](../../src/components/messenger/TranslateActionButton.tsx)) — иконка-глобус + код угаданного target-языка (например «🌐 ES»). Клик по основной части — мгновенный перевод на этот язык. Клик по стрелке ▼ — поповер со списком всех 20 языков; выбор оттуда переводит и запоминает как новый default.
4. **Угадывание target-языка** ([useThreadTargetLanguage](../../src/hooks/messenger/useThreadTargetLanguage.ts)) — fallback цепочка:
   1. localStorage per-thread (последний выбор в этом чате) — `cc:translate-target:<threadId>`.
   2. `source_language` из кэша переводов входящих этого треда (тот язык, на котором пишет клиент) — если входящие уже переводились.
   3. localStorage global — последний выбор где угодно.
   4. `'en'`.
   Синхронизация между инстансами через `window` event `cc:translate-target-changed`.
5. **Банер «Переведено на … (с …). Оригинал: …»** ([MessageInputBanners](../../src/components/messenger/MessageInputBanners.tsx)) над композером, с кнопкой «Вернуть» (откатить к оригиналу). Банер **переживает перезагрузку страницы**: state сохраняется в `localStorage` по ключу `msg_translation:<threadId>` рядом с обычным черновиком. При маунте сверяется `editor.getHTML()` с сохранённым `translatedHtml` — если совпадает, банер восстанавливается; если юзер успел поправить, банер не показывается и запись удаляется. Сбрасывается при отправке, при «Вернуть» и при правке текста (через onTyping диф).
6. **Унифицированная пилюля для отправленных переводов**. Если автор отправил перевод (есть `message.original_content`) — в углу его собственного баббла такая же пилюля «🌐 RU». Default — показан перевод (что реально ушло клиенту), клик — переключение на русский оригинал. Логика общая с входящими через единый источник `translationSource` в [MessageBubble](../../src/components/messenger/MessageBubble.tsx).
7. **Настройки воркспейса** ([TranslationSettingsSection](../../src/page-components/workspace-settings/components/TranslationSettingsSection.tsx)) — отдельная модель для перевода (можно поставить дешёвую Haiku, оставив для других задач Sonnet) и чекбокс «Использовать контекст диалога».

### Архитектура

**БД** — три миграции применены к проду напрямую через apply_migration MCP, файлы добавлены в репо:

- [`20260513_message_translation.sql`](../../supabase/migrations/20260513_message_translation.sql) — `participants.preferred_language`, `project_messages.original_content/original_language`, новая таблица `message_translations (message_id, target_language, translated_content, source_language, model, ...)` с PK на пару `(message_id, target_language)`. RLS: SELECT через `can_user_access_thread`, write только service_role. Кэш по языку (не по юзеру) — если у меня и коллеги target='ru', переводим один раз.
- [`20260513_set_my_preferred_language_rpc.sql`](../../supabase/migrations/20260513_set_my_preferred_language_rpc.sql) — RPC `set_my_preferred_language(text)` (SECURITY DEFINER) для массового апдейта participants залогиненного юзера.
- [`20260513_translation_workspace_settings.sql`](../../supabase/migrations/20260513_translation_workspace_settings.sql) — `workspaces.translation_model`, `workspaces.translation_use_thread_context`.

**Edge function** [`translate-message`](../../supabase/functions/translate-message/index.ts) — verify_jwt=true, два режима:

1. `{ message_id, target_language }` — переводит существующее сообщение, кэширует в `message_translations`. На входе проверяет RLS-доступ через user client. Если кэш есть — возвращает мгновенно без вызова LLM.
2. `{ workspace_id, content, target_language, source_language?, thread_id? }` — preview без сохранения (для композера).

Использует общий `_shared/ai-chat-setup.ts` (Anthropic/Gemini). Если в `workspaces.translation_model` задана отдельная модель — она используется вместо `ai_model`. Если `translation_use_thread_context=true` и есть thread_id — подгружаются последние 5 сообщений треда и кладутся в системный промпт как «conversation context» с явной инструкцией использовать только для consistency терминов и тона, не переводить.

**HTML обрабатывается просто**: на входе HTML → plain text (`htmlToPlain`), перевод plain → plain, на выходе plain → простой `<p>...</p>` HTML. Tiptap-форматирование (bold/italic/lists) при переводе теряется. Если будет нужно сохранять — отдельная задача.

**Хранение оригинала исходящих**: при отправке перевода фронт пишет `original_content` + `original_language` через расширенную сигнатуру `sendMessage` ([messengerService.send.ts](../../src/services/api/messenger/messengerService.send.ts)). Виден только автору в UI через тот же `translationSource`.

### Чеклист регрессий

- Реакции работают на переведённых сообщениях как обычно.
- Edit/Delete своих исходящих переводов — без изменений (редактируется `content`, оригинал в `original_content` не трогается).
- Email/Telegram/Wazzup получают `content` = перевод. `original_content` уходит только в наш `project_messages`, во внешние каналы не уходит.
- Split-кнопка в композере для editing-сообщений скрыта (нет смысла переводить уже отправленное).
- Если AI-ключ воркспейса не настроен — translate-message вернёт 400 «API key not configured».

## Сопутствующие фиксы превью уведомлений

### 1. HTML entities в превью email'ов

**Симптом**: в toast'ах входящих от email-клиентов превью выглядело как `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Estimado cliente: Ya tienes disponible tu &uacute;ltimo...`.

**Корень**: `stripHtml` в [messengerHtml.ts](../../src/utils/format/messengerHtml.ts) снимал теги, но не декодировал HTML entities. Большинство email-клиентов пишет `&nbsp;` для отступов и `&uacute;` для нелатинских символов — после `replace(/<[^>]*>/g, '')` они остаются как есть в plain text.

**Решение**: добавил `decodeHtmlEntities()` через `document.createElement('textarea').innerHTML = ... ; .value` — стандартный браузерный паттерн декодирует все стандартные и numeric entities. SSR fallback вручную для `&nbsp; &amp; &lt; &gt; &quot; &#39;` плюс `&#NNN;` / `&#xHH;`. Подключено в `stripHtml`, дотягивается до `stripHtmlIgnoreQuotes` и всех мест, где это используется (тосты, превью инбокса, превью списков тредов).

### 2. Иконка треда в тосте

К аватарке отправителя в новом сообщении добавлен маленький бейдж 16×16 в правом нижнем углу с иконкой треда из `THREAD_ICONS` (Email, Telegram, WhatsApp, обычный чат и т.п.). По нему сразу понятно, из какого канала пришло сообщение.

Реализация: `buildAvatar` в [MessageToastContent.ts](../../src/hooks/messenger/MessageToastContent.ts) принимает опциональный `threadIcon`, рисует wrapper `relative` + позиционирует бейдж абсолютно. Иконка берётся из `getChatIconComponent(threadIcon)`. В [useNewMessageToast](../../src/hooks/messenger/useNewMessageToast.ts) иконка подтягивается сначала из `InboxThreadEntry.thread_icon` (быстро, из кэша), fallback на `project_threads.icon` через прямой SELECT.

### 3. Литерал «Проект» в личных диалогах

**Симптом**: при входящем сообщении в личный диалог (TG Business / Wazzup / личный email — треды с `project_id = NULL`) в тосте после имени отправителя стояло «(Проект)».

**Корень**: fallback цепочка `threadEntry?.project_name ?? threadEntry?.counterpart_name ?? 'Проект'` упиралась в литерал, когда оба поля null.

**Решение**: явная проверка `isPersonal = !msg.project_id` → `projectName = null` → в `buildToastContent` суффикс в скобках вообще не рендерится. Для проектных тредов остался `project_name ?? 'Проект'` как fallback на случай ненагруженного кэша.

## Что не сделано / на потом

- **HTML-форматирование при переводе**: bold/italic/lists теряются. Можно передавать LLM HTML с инструкцией сохранять разметку, но это +токены и риск багов.
- **Авто-определение языка**: target-язык угадывается, но язык клиента (source) для preview-превода в композере берётся из `participants.preferred_language` юзера — может быть мимо. Авто-детект через LLM не делал — лишний запрос.
- **Translation для редактирования сообщения**: при редактировании композер `translate` отключён.
- **Реакции в Telegram Business / Wazzup**: переведённые сообщения наследуют те же ограничения каналов, что и обычные — отдельной работы не требуется.

## Файлы

### Миграции (новые)

- `supabase/migrations/20260513_message_translation.sql`
- `supabase/migrations/20260513_set_my_preferred_language_rpc.sql`
- `supabase/migrations/20260513_translation_workspace_settings.sql`

### Edge function (новая)

- `supabase/functions/translate-message/index.ts`

### Хуки (новые)

- `src/hooks/useMyPreferredLanguage.ts`
- `src/hooks/useTranslationSettings.ts`
- `src/hooks/messenger/useTranslateMessage.ts`
- `src/hooks/messenger/useThreadTranslations.ts`
- `src/hooks/messenger/useThreadTargetLanguage.ts`

### UI-компоненты (новые)

- `src/components/messenger/TranslateActionButton.tsx`
- `src/page-components/ProfilePage/TranslationLanguageSection.tsx`
- `src/page-components/workspace-settings/components/TranslationSettingsSection.tsx`

### Изменённые

- `src/components/messenger/MessageActions.tsx` — translationToggle prop, пилюля языка в углу баббла.
- `src/components/messenger/MessageBubble.tsx` — unified `translationSource`, displayContent внутри баббла, viewMode toggle.
- `src/components/messenger/MessageInput.tsx` — state перевода, банер, persistence в localStorage, проброс original в onSend.
- `src/components/messenger/MessageInputBanners.tsx` — компонент `TranslationBanner`.
- `src/components/messenger/MessageInputToolbar.tsx` — рендер `TranslateActionButton` рядом с send.
- `src/components/messenger/MessageMenuBody.tsx` — пункт меню «Перевести».
- `src/components/messenger/hooks/useMessengerHandlers.ts` — проброс original в sendMessage.mutate.
- `src/services/api/messenger/messengerService.send.ts` — `original_content` + `original_language` в INSERT.
- `src/services/api/messenger/messengerService.types.ts` — поля `original_content`/`original_language` в типе `ProjectMessage`.
- `src/page-components/ProfilePage.tsx` — рендер `TranslationLanguageSection`.
- `src/page-components/workspace-settings/GeneralSettingsTab.tsx` — рендер `TranslationSettingsSection`.
- `src/hooks/messenger/useSendMessage.ts` — generic-типизация мутации с `originalContent`/`originalLanguage`.
- `src/types/database.ts` — регенерация после миграций.
- `src/utils/format/messengerHtml.ts` — `decodeHtmlEntities` в `stripHtml`.
- `src/hooks/messenger/MessageToastContent.ts` — иконка треда у аватарки, скрытие суффикса при null projectName.
- `src/hooks/messenger/useNewMessageToast.ts` — подгрузка thread_icon, флаг isPersonal.
