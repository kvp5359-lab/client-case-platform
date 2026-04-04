/**
 * ТОКЕНЫ ДИЗАЙНА
 *
 * Стили для форм и анкет, основанные на архивном прототипе
 */

/**
 * BRAND — фирменный тёмно-золотой акцент.
 * CSS-переменные: --brand-50..700 (index.css), Tailwind: brand-50..700 (tailwind.config.js).
 *
 * Маппинг на замену:
 *   bg-yellow-600/5   → bg-brand-50          (selected строка)
 *   bg-yellow-600/10  → bg-brand-100         (badge / chip фон)
 *   bg-yellow-600/15  → bg-brand-100         (badge чуть темнее — теперь один токен)
 *   border-yellow-600/30 → border-brand-200  (рамка badge)
 *   text-yellow-600   → text-brand-500       (иконки, приглушённый текст)
 *   text-yellow-600/70 → text-brand-500      (папки)
 *   text-yellow-700   → text-brand-600       (основной текст badge)
 *   text-yellow-700/70 → text-brand-500      (ссылки-действия)
 *   text-yellow-800   → text-brand-700       (hover)
 *   bg-amber-400 / bg-yellow-400 → bg-brand-400 (кнопки solid)
 *   hover:bg-amber-500 / hover:bg-yellow-500 → hover:bg-brand-500
 */
export const brand = {
  /** Фон badge / chip */
  badge: 'bg-brand-100 text-brand-600',
  /** Фон badge с бордером */
  badgeBorder: 'bg-brand-100 text-brand-600 border border-brand-200',
  /** Активный элемент в списке */
  selected: 'bg-brand-50',
  /** Hover на активном элементе */
  selectedHover: 'bg-brand-50 hover:bg-brand-100',
  /** Текст-ссылка (action link) */
  link: 'text-brand-500 hover:text-brand-600',
  /** Иконка фирменная */
  icon: 'text-brand-500',
  /** Кнопка solid (Create, Save) */
  button: 'bg-brand-400 hover:bg-brand-500 text-black',
} as const

export const designTokens = {
  /**
   * СТИЛИ ДЛЯ ТАБЛИЦ ФОРМ (АНКЕТЫ В ПРОЕКТАХ)
   */
  formTable: {
    /**
     * Контейнер таблицы
     */
    container: 'border border-border overflow-hidden rounded-lg',

    /**
     * Сама таблица
     */
    table: 'w-full border-collapse',

    /**
     * Заголовок группы/секции
     */
    groupHeader:
      'w-full px-4 py-2 bg-muted hover:bg-muted/80 transition-colors flex items-center gap-3 font-semibold text-base text-left',

    /**
     * Ячейка с названием поля (левая колонка)
     */
    fieldLabelCell: 'py-1 px-3 text-sm align-top border-r border-border bg-muted/30',

    /**
     * Ячейка со значением поля (правая колонка)
     */
    fieldValueCell: 'py-1 px-3 text-sm',

    /**
     * Граница снизу ячейки
     */
    cellBorderBottom: 'border-b border-border',

    /**
     * Подсветка незаполненного обязательного поля
     */
    highlightRequired: 'bg-yellow-50',

    /**
     * Инпут внутри ячейки таблицы
     */
    fieldInput: 'w-full border-0 bg-transparent p-0 focus:outline-none focus:ring-0',
  },

  /**
   * СТИЛИ ДЛЯ КНОПОК ДЕЙСТВИЙ
   */
  actionButtons: {
    /**
     * Кнопка фильтра
     */
    filter:
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 px-3 py-1.5 h-8 bg-muted text-foreground hover:bg-muted/80',

    /**
     * Активное состояние для фильтра (жёлтый)
     */
    filterActive: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  },

  /**
   * СТИЛИ ДЛЯ ОБЯЗАТЕЛЬНЫХ ПОЛЕЙ
   */
  required: {
    placeholder: 'placeholder:text-destructive/60',
    border: 'border-destructive/30',
    borderFilled: 'border-border',
  },
}
