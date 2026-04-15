# Перенос длинных ссылок в поле первого сообщения

**Дата:** 2026-04-15
**Тип:** fix
**Статус:** completed

---

## Проблема

При создании новой задачи в поле «Первое сообщение», если вставить длинную неразрывную строку (например, URL документа Google Docs), поле увеличивало ширину диалога. Правый край уходил за видимую область — кнопка «Создать», вкладки и часть интерфейса становились недоступны.

## Решение

Ссылки и неразрывный текст теперь переносятся внутри поля ввода.

### 1. Перенос внутри редактора Tiptap

В [MinimalTiptapEditor.tsx](../../src/components/messenger/MinimalTiptapEditor.tsx) к классам `.ProseMirror` добавлены `break-words [overflow-wrap:anywhere]` (в двух местах — при инициализации и при обновлении `editorMaxHeight`).

`overflow-wrap: anywhere` разрешает перенос в любой точке строки, включая URL без пробелов.

### 2. Защита от раздвигания родителя

- В [ComposeField.tsx](../../src/components/messenger/ComposeField.tsx) корень получил `min-w-0 overflow-hidden` — флекс-ребёнок теперь не может стать шире родителя.
- В [ChatSettingsDialog.tsx](../../src/components/messenger/ChatSettingsDialog.tsx) обёртка «Первое сообщение» получила `min-w-0` — та же причина (дефолтный `min-width: auto` у флекс-элементов).

## Файлы

- `src/components/messenger/MinimalTiptapEditor.tsx`
- `src/components/messenger/ComposeField.tsx`
- `src/components/messenger/ChatSettingsDialog.tsx`
