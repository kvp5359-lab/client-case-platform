# Генерация по справочникам, копирование/сортировка шаблонов, фиксы вставки и ссылок

**Дата:** 2026-06-01
**Тип:** feature + fix
**Статус:** completed

---

## 1. Генерация документов — привязка плейсхолдеров к справочникам

**Было:** плейсхолдер `{{...}}` в шаблоне документа можно было привязать только к
полю анкеты. Если поле было типа «Справочник» (`directory_ref`), в готовый
документ подставлялся технический UUID записи, а не читаемое значение.

**Стало:** плейсхолдер можно привязать **напрямую к справочнику + колонке**.
В окне генерации напротив такого поля — выпадающий список записей справочника
(«Название — значение колонки»); выбранная запись подставляется в документ.

- [`documentTemplateService.ts`](../../src/services/api/documents/documentTemplateService.ts):
  в тип `DocumentTemplatePlaceholder` добавлены `source_directory_id` (прямая
  привязка к справочнику) и `directory_field_id` (колонка для подстановки).
- [`PlaceholderMappingDialog.tsx`](../../src/components/templates/PlaceholderMappingDialog.tsx):
  выпадашка источника разбита на две группы — «Поля анкеты» и «Справочники».
  При выборе справочника появляется второй селектор колонки (по умолчанию —
  название записи).
- [`useDirectoryPlaceholderOptions.ts`](../../src/hooks/documents/useDirectoryPlaceholderOptions.ts)
  (новый): грузит записи справочников для плейсхолдеров с прямой привязкой,
  лейбл «Название — значение».
- [`GenerationEditDialog.tsx`](../../src/components/projects/DocumentKitsTab/components/GenerationEditDialog.tsx)
  + `GenerationCard.tsx` + `useGenerationCardHandlers.ts`: для directory-полей
  вместо текстового инпута — `Select` с записями справочника.
- [`documentGenerationService.ts`](../../src/services/api/documents/documentGenerationService.ts)
  + [`generate-document/index.ts`](../../supabase/functions/generate-document/index.ts)
  (edge): резолв id записи → значение выбранной колонки (или `display_name`)
  на фронте и на сервере. Для поля-анкеты типа `directory_ref` — тоже резолв
  читаемого значения. **Edge-функция задеплоена (v37).**

## 2. Копирование и drag-сортировка шаблонов

**Было:** шаблоны проектов нельзя было копировать; оба списка (шаблоны проектов
и наборы документов) не сортировались перетаскиванием.

**Стало:** копирование шаблона проекта (полная копия) + drag-сортировка обоих
списков.

- Миграция
  [`20260601_template_order_and_duplicate.sql`](../../supabase/migrations/20260601_template_order_and_duplicate.sql)
  (новая, **применена в проде**):
  - `order_index` на `project_templates` и `document_kit_templates` (+ бэкфилл
    по `created_at`, индексы);
  - RPC `duplicate_project_template(p_template_id, p_new_name)` —
    `SECURITY DEFINER`, полная копия одной транзакцией: базовый шаблон + статусы,
    формы, наборы документов, привязанные поля, ссылки на базу знаний, быстрые
    ответы, треды/задачи (с исполнителями) и блоки плана (с ремапом
    `thread_template_id`). Внешние Google-ресурсы (`brief_template_sheet_id`,
    `root_folder_id`) не копируются.
- [`useTemplateList.ts`](../../src/components/templates/useTemplateList.ts):
  опции `orderByColumn`/`orderAscending`, мутация перестановки (`handleReorder`,
  оптимистично через `setQueryData`, откат при ошибке).
- [`SortableTemplateRow.tsx`](../../src/components/templates/SortableTemplateRow.tsx)
  (новый): общая draggable-строка таблицы (`@dnd-kit`).
- [`ProjectTemplatesContent.tsx`](../../src/components/templates/ProjectTemplatesContent.tsx):
  кнопка копирования (через RPC) + DnD.
- [`DocumentKitTemplatesContent.tsx`](../../src/components/templates/DocumentKitTemplatesContent.tsx):
  DnD + копия набора в конец списка.
- `src/types/database.ts`: перегенерированы типы (RPC + `order_index`).

## 3. Мессенджер — ссылки в окне ввода

**Было:** в редакторе ввода сообщения вставленная ссылка была жирной и
подчёркнутой, а текст, набранный сразу после неё, «прилипал» к ссылке и
наследовал её оформление (Link-mark был `inclusive`).

**Стало:** ссылка non-inclusive — текст после не становится её частью.

- [`MinimalTiptapEditor.tsx`](../../src/components/messenger/MinimalTiptapEditor.tsx):
  отключён встроенный Link из StarterKit, подключён настроенный `Link`
  (`inclusive: () => false`, `autolink`/`linkOnPaste`). Класс ссылки —
  `text-blue-600 underline font-normal` (классический синий, подчёркнутая, не
  жирная).

## 4. Редактор статей — вставка списков из Notion

**Было:** при вставке списка из Notion появлялись огромные пустые промежутки
между пунктами. Причина: Notion отдаёт глубоко вложенные `<div>` без `<p>`/`<br>`,
а прежняя логика `<div>→<p>` плодила пустые параграфы из каждой вложенной обёртки.

**Стало:** Notion-разметка распознаётся и разбирается через `DOMParser`:

- [`tiptap-editor.tsx`](../../src/components/tiptap-editor/tiptap-editor.tsx)
  `transformPastedHTML`: листовые блоки (`data-block-id`) собираются в чистый
  HTML — буллеты/чек-листы/тоглы → `<ul><li>`, нумерованные → `<ol><li>`
  (соседние группируются), заголовки → жирный абзац, остальное → `<p>`.
  Инлайн-форматирование сохраняется. Для прочих источников — прежняя логика
  (вырезание пустых блоков, `<div>/<br>` → `<p>`).

## 5. Telegram — reply при fallback на бота-секретаря

**Было:** при отправке через бота-секретаря с цитированием нативный reply падал
(`message to be replied not found`) — `reply_parameters.message_id` в нумерации
личного бота секретарю неизвестен.

**Стало:** в fallback-ветке секретаря `reply_parameters` сбрасывается и вместо
него вставляется blockquote-цитата оригинала.

- [`telegram-send-message/index.ts`](../../supabase/functions/telegram-send-message/index.ts):
  две fallback-ветки (text и media) — `delete reply_parameters` +
  `loadReplyQuoteHtml`. **Карантинная зона.** Edge-функция деплоится отдельно
  (`--no-verify-jwt`).

## Затронутые файлы

- `supabase/migrations/20260601_template_order_and_duplicate.sql` (новый)
- `supabase/functions/generate-document/index.ts`
- `supabase/functions/telegram-send-message/index.ts`
- `src/hooks/documents/useDirectoryPlaceholderOptions.ts` (новый)
- `src/components/templates/SortableTemplateRow.tsx` (новый)
- `src/components/templates/PlaceholderMappingDialog.tsx`
- `src/components/templates/useTemplateList.ts`
- `src/components/templates/ProjectTemplatesContent.tsx`
- `src/components/templates/DocumentKitTemplatesContent.tsx`
- `src/components/projects/DocumentKitsTab/components/GenerationEditDialog.tsx`
- `src/components/projects/DocumentKitsTab/components/GenerationCard.tsx`
- `src/components/projects/DocumentKitsTab/components/hooks/useGenerationCardHandlers.ts`
- `src/services/api/documents/documentTemplateService.ts`
- `src/services/api/documents/documentGenerationService.ts`
- `src/components/messenger/MinimalTiptapEditor.tsx`
- `src/components/tiptap-editor/tiptap-editor.tsx`
- `src/types/database.ts`

## Проверки

- `npm run lint && npx tsc --noEmit && npm test` — зелёные (lint 0, tsc 0, 662 теста).
- Миграция и RPC применены в проде; `generate-document` задеплоена (v37);
  `telegram-send-message` — деплой при выкатке.
