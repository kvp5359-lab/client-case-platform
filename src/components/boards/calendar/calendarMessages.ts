/**
 * Локализованные подписи react-big-calendar (RBC) для нашего календаря.
 */

export function buildCalendarMessages(nextNDays: number) {
  return {
    today: 'Сегодня',
    previous: '←',
    next: '→',
    week: 'Неделя',
    work_week: 'Будни',
    day: 'День',
    // Подпись таба кастомного вида — типы Messages не знают про next_n
    ...({ next_n: `${nextNDays} дн.` } as object),
    date: 'Дата',
    time: 'Время',
    event: 'Задача',
    allDay: 'Весь день',
    noEventsInRange: 'Нет задач со временем',
  }
}
