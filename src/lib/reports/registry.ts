/**
 * Клиентский реестр датасетов отчётов — зеркало whitelist-реестра в БД
 * (функция _report_registry(), см. миграции отчётов).
 *
 * ⚠️ Ключи датасетов и полей должны совпадать с серверными (реестр живёт в
 * функции _report_registry()). Здесь — только презентация: лейблы, типы для
 * UI фильтров, форматы. При добавлении поля/датасета править ОБА места.
 */

import type {
  ReportColumnAgg,
  ReportConfig,
  ReportDatasetKey,
  ReportDateGranularity,
} from '@/types/reports'

export type ReportFieldType = 'text' | 'number' | 'date' | 'uuid'

/** Откуда UI фильтра берёт варианты значений для поля. */
export type ReportOptionsKind =
  | 'participants'
  | 'projects'
  | 'txCategories'
  | 'projectStatuses'
  | 'threadStatuses'
  | 'templates'
  | 'financeServices'

export type ReportFieldDef = {
  key: string
  label: string
  type: ReportFieldType
  groupable: boolean
  optionsKind?: ReportOptionsKind
  /** Статичные варианты (enum-поля типа Доход/Расход). */
  staticOptions?: { value: string; label: string }[]
  /** number-поле с денежным форматированием (2 знака + €). */
  money?: boolean
  /**
   * Ссылочное поле: в записях значение становится ссылкой на сущность.
   * Сервер для таких полей отдаёт ещё и id (ключи cN_id / cN_pid).
   */
  link?: 'project' | 'thread'
}

/** Что можно выводить в строке группы для поля этого типа. */
export function aggsForField(field: ReportFieldDef): ReportColumnAgg[] {
  return field.type === 'number'
    ? ['none', 'count', 'sum', 'avg', 'min', 'max']
    : ['none', 'count']
}

export const AGG_LABELS: Record<ReportColumnAgg, string> = {
  none: 'Ничего не выводить',
  count: 'Количество записей',
  sum: 'Сумма значений',
  avg: 'Среднее значение',
  min: 'Минимум',
  max: 'Максимум',
}

/** Формат ячейки-агрегата: count — всегда штуки, остальное — как у поля. */
export function aggFormat(field: ReportFieldDef | null, agg: ReportColumnAgg): 'money' | 'number' {
  if (agg === 'count') return 'number'
  return field?.money ? 'money' : 'number'
}

export type ReportDatasetDef = {
  key: ReportDatasetKey
  label: string
  description: string
  fields: ReportFieldDef[]
  /** Поле даты, к которому применяется быстрый период на странице отчёта. */
  periodField?: string
  /** Дефолт конфига при создании отчёта на этом датасете. */
  defaultConfig: Omit<ReportConfig, 'dataset'>
  /** Колонки режима «Список» по умолчанию — зеркало detail_default в run_report. */
  detailDefault: string[]
}

const CLIENT_FIELD = (key = 'client'): ReportFieldDef => ({
  key,
  label: 'Клиент',
  type: 'uuid',
  groupable: true,
  optionsKind: 'participants',
})

export const REPORT_DATASETS: Record<ReportDatasetKey, ReportDatasetDef> = {
  transactions: {
    key: 'transactions',
    label: 'Платежи (доходы и расходы)',
    description: 'Движения денег по проектам: кто, когда и сколько оплатил.',
    periodField: 'date',
    fields: [
      {
        key: 'type', label: 'Тип', type: 'text', groupable: true,
        staticOptions: [
          { value: 'income', label: 'Доход' },
          { value: 'expense', label: 'Расход' },
        ],
      },
      { key: 'date', label: 'Дата', type: 'date', groupable: true },
      { key: 'amount', money: true, label: 'Сумма', type: 'number', groupable: false },
      { key: 'category', label: 'Статья', type: 'uuid', groupable: true, optionsKind: 'txCategories' },
      { key: 'participant', label: 'Плательщик', type: 'uuid', groupable: true, optionsKind: 'participants' },
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects', link: 'project' },
      CLIENT_FIELD(),
      { key: 'project_status', label: 'Статус проекта', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'comment', label: 'Комментарий', type: 'text', groupable: false },
    ],
    detailDefault: ['date', 'type', 'amount', 'category', 'project', 'participant', 'comment'],
    defaultConfig: {
      groupBy: [{ field: 'type' }, { field: 'date', granularity: 'month' }],
      columns: [
        { key: 'type' },
        { key: 'date' },
        { key: 'project', agg: 'count' },
        { key: 'amount', agg: 'sum' },
      ],
      showRecords: true,
    },
  },

  services: {
    key: 'services',
    label: 'Услуги (выставлено)',
    description: 'Услуги в проектах: объём оказанного/выставленного.',
    periodField: 'created',
    fields: [
      { key: 'service', label: 'Услуга', type: 'uuid', groupable: true, optionsKind: 'financeServices' },
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects', link: 'project' },
      CLIENT_FIELD(),
      { key: 'project_status', label: 'Статус проекта', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'quantity', label: 'Кол-во', type: 'number', groupable: false },
      { key: 'price', money: true, label: 'Цена', type: 'number', groupable: false },
      { key: 'total', money: true, label: 'Сумма', type: 'number', groupable: false },
      { key: 'created', label: 'Дата добавления', type: 'date', groupable: true },
    ],
    detailDefault: ['service', 'project', 'client', 'quantity', 'price', 'total'],
    defaultConfig: {
      groupBy: [{ field: 'service' }],
      columns: [
        { key: 'service' },
        { key: 'project', agg: 'count' },
        { key: 'client' },
        { key: 'quantity', agg: 'sum' },
        { key: 'total', agg: 'sum' },
      ],
      showRecords: true,
    },
  },

  client_balance: {
    key: 'client_balance',
    label: 'Баланс клиентов (кто должен)',
    description: 'По каждому проекту: выставлено услуг − оплачено = долг.',
    fields: [
      CLIENT_FIELD(),
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects', link: 'project' },
      { key: 'project_status', label: 'Статус проекта', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'template', label: 'Шаблон', type: 'uuid', groupable: true, optionsKind: 'templates' },
      { key: 'created', label: 'Дата создания проекта', type: 'date', groupable: true },
      { key: 'billed', money: true, label: 'Выставлено', type: 'number', groupable: false },
      { key: 'paid', money: true, label: 'Оплачено', type: 'number', groupable: false },
      { key: 'expenses', money: true, label: 'Расходы', type: 'number', groupable: false },
      { key: 'balance', money: true, label: 'Долг', type: 'number', groupable: false },
    ],
    detailDefault: ['client', 'project', 'project_status', 'billed', 'paid', 'balance'],
    defaultConfig: {
      groupBy: [{ field: 'client' }],
      columns: [
        { key: 'client' },
        { key: 'project' },
        { key: 'billed', agg: 'sum' },
        { key: 'paid', agg: 'sum' },
        { key: 'balance', agg: 'sum' },
      ],
      showRecords: true,
      sort: { by: 'c4', dir: 'desc' },
    },
  },

  projects: {
    key: 'projects',
    label: 'Проекты',
    description: 'Проекты в разрезе статусов, шаблонов и периодов + финансы: услуги, доходы, расходы, долг.',
    periodField: 'created',
    fields: [
      { key: 'project', label: 'Проект', type: 'uuid', groupable: false, optionsKind: 'projects', link: 'project' },
      { key: 'status', label: 'Статус', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'template', label: 'Шаблон', type: 'uuid', groupable: true, optionsKind: 'templates' },
      CLIENT_FIELD(),
      { key: 'created', label: 'Дата создания', type: 'date', groupable: true },
      { key: 'deadline', label: 'Дедлайн', type: 'date', groupable: true },
      // Финансы проекта: считаются по его услугам и платежам (LATERAL в реестре БД).
      { key: 'billed', money: true, label: 'Сумма услуг', type: 'number', groupable: false },
      { key: 'paid', money: true, label: 'Доходы', type: 'number', groupable: false },
      { key: 'expenses', money: true, label: 'Расходы', type: 'number', groupable: false },
      { key: 'balance', money: true, label: 'Долг', type: 'number', groupable: false },
    ],
    detailDefault: ['project', 'status', 'template', 'client', 'created'],
    defaultConfig: {
      groupBy: [{ field: 'status' }],
      columns: [
        { key: 'status' },
        { key: 'project', agg: 'count' },
        { key: 'template' },
        { key: 'created' },
      ],
      showRecords: true,
    },
  },

  threads: {
    key: 'threads',
    label: 'Задачи и чаты',
    description: 'Треды (задачи/чаты/письма) в разрезе статусов и проектов.',
    periodField: 'created',
    fields: [
      { key: 'thread', label: 'Название', type: 'uuid', groupable: false, link: 'thread' },
      {
        key: 'thread_type', label: 'Тип', type: 'text', groupable: true,
        staticOptions: [
          { value: 'task', label: 'Задача' },
          { value: 'chat', label: 'Чат' },
          { value: 'email', label: 'Email' },
        ],
      },
      { key: 'status', label: 'Статус', type: 'uuid', groupable: true, optionsKind: 'threadStatuses' },
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects', link: 'project' },
      { key: 'created', label: 'Дата создания', type: 'date', groupable: true },
      { key: 'deadline', label: 'Срок', type: 'date', groupable: true },
    ],
    detailDefault: ['thread', 'thread_type', 'status', 'project', 'created', 'deadline'],
    defaultConfig: {
      groupBy: [{ field: 'thread_type' }, { field: 'status' }],
      columns: [
        { key: 'thread_type' },
        { key: 'status' },
        { key: 'thread', agg: 'count' },
        { key: 'created' },
      ],
      showRecords: true,
    },
  },
}

export const REPORT_DATASET_LIST: ReportDatasetDef[] = Object.values(REPORT_DATASETS)

export const GRANULARITY_OPTIONS: { value: ReportDateGranularity; label: string }[] = [
  { value: 'day', label: 'По дням' },
  { value: 'week', label: 'По неделям' },
  { value: 'month', label: 'По месяцам' },
  { value: 'quarter', label: 'По кварталам' },
  { value: 'year', label: 'По годам' },
]

/** Операторы фильтра, доступные в UI для типа поля. */
export function operatorsForField(field: ReportFieldDef): { value: string; label: string }[] {
  if (field.staticOptions) {
    return [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '≠' },
    ]
  }
  switch (field.type) {
    case 'uuid':
      return [
        { value: 'in', label: 'любой из' },
        { value: 'not_in', label: 'кроме' },
        { value: 'is_null', label: 'пусто' },
        { value: 'is_not_null', label: 'не пусто' },
      ]
    case 'number':
      return [
        { value: 'after', label: '>' },
        { value: 'after_eq', label: '≥' },
        { value: 'before', label: '<' },
        { value: 'before_eq', label: '≤' },
        { value: 'equals', label: '=' },
        { value: 'not_equals', label: '≠' },
      ]
    case 'date':
      return [
        { value: 'between', label: 'между' },
        { value: 'after_eq', label: 'с даты' },
        { value: 'before_eq', label: 'по дату' },
      ]
    default:
      return [
        { value: 'contains', label: 'содержит' },
        { value: 'equals', label: '=' },
      ]
  }
}

export function getDatasetDef(key: string | undefined | null): ReportDatasetDef | null {
  if (!key) return null
  return REPORT_DATASETS[key as ReportDatasetKey] ?? null
}

export function getFieldDef(dataset: ReportDatasetDef, key: string): ReportFieldDef | null {
  return dataset.fields.find((f) => f.key === key) ?? null
}

