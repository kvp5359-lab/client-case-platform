# «Превратить событие в задачу»: редизайн диалога + удаление из Google Calendar

**Дата:** 2026-06-11
**Тип:** feature + ui
**Статус:** completed

---

## Что стало

Диалог конвертации внешнего Google-события в задачу переработан:

- **Сводка события** — карточка с названием, человекочитаемым интервалом
  («11 июн, 7:00–9:50» или межсуточный) и местом (`location`, если задано).
- **Адаптивная ширина** — `w-[calc(100vw-2rem)] max-w-[460px]`, не распирает на
  мобильном; футер `flex-wrap` переносит кнопки при нехватке места.
- **Удаление события из Google Calendar** — кнопка-иконка (корзина) с
  подтверждением через `AlertDialog`. Зовёт `useWriteExternalEvent` с
  `action: 'delete'`. Удаляет событие безвозвратно у всех участников.
- Второстепенные действия (открыть в Google, удалить) — иконками слева,
  основные (Отмена / Создать задачу) — справа.

## Затронутые файлы

- [`ConvertExternalEventDialog.tsx`](../../src/components/boards/ConvertExternalEventDialog.tsx)
  — редизайн, `formatEventWhen`, удаление, проп `location`.
- [`BoardListCalendarView.tsx`](../../src/components/boards/BoardListCalendarView.tsx)
  — прокидка `location` из внешнего события.

## Проверки

- `npx tsc --noEmit && npm run lint` — зелёные.
- Удаление зависит от рабочего write-в-Google (`useWriteExternalEvent`).
