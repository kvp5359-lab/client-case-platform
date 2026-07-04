/**
 * Клиентский реестр датасетов отчётов — зеркало whitelist-реестра в RPC
 * run_report (supabase/migrations/20260704130100_run_report_engine.sql).
 *
 * ⚠️ Ключи датасетов/полей/показателей должны совпадать с серверными.
 * Здесь — только презентация: лейблы, типы для UI фильтров, форматы.
 * При добавлении поля/датасета править ОБА места.
 */

import type {
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
}

export type ReportMeasureDef = {
  key: string
  label: string
  format: 'money' | 'number'
  /** Суммируем ли client-side для подытогов групп (avg — нет). */
  additive: boolean
}

export type ReportDatasetDef = {
  key: ReportDatasetKey
  label: string
  description: string
  fields: ReportFieldDef[]
  measures: ReportMeasureDef[]
  /** Поле даты, к которому применяется быстрый период на странице отчёта. */
  periodField?: string
  /** Дефолт конфига при создании отчёта на этом датасете. */
  defaultConfig: Omit<ReportConfig, 'dataset'>
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
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects' },
      CLIENT_FIELD(),
      { key: 'project_status', label: 'Статус проекта', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'comment', label: 'Комментарий', type: 'text', groupable: false },
    ],
    measures: [
      { key: 'sum_amount', label: 'Сумма', format: 'money', additive: true },
      { key: 'avg_amount', label: 'Средний платёж', format: 'money', additive: false },
      { key: 'count', label: 'Кол-во', format: 'number', additive: true },
    ],
    defaultConfig: {
      mode: 'summary',
      groupBy: [{ field: 'type' }, { field: 'date', granularity: 'month' }],
      measures: ['sum_amount', 'count'],
    },
  },

  services: {
    key: 'services',
    label: 'Услуги (выставлено)',
    description: 'Услуги в проектах: объём оказанного/выставленного.',
    periodField: 'created',
    fields: [
      { key: 'service', label: 'Услуга', type: 'uuid', groupable: true, optionsKind: 'financeServices' },
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects' },
      CLIENT_FIELD(),
      { key: 'project_status', label: 'Статус проекта', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'quantity', label: 'Кол-во', type: 'number', groupable: false },
      { key: 'price', money: true, label: 'Цена', type: 'number', groupable: false },
      { key: 'total', money: true, label: 'Сумма', type: 'number', groupable: false },
      { key: 'created', label: 'Дата добавления', type: 'date', groupable: true },
    ],
    measures: [
      { key: 'sum_total', label: 'Сумма', format: 'money', additive: true },
      { key: 'sum_quantity', label: 'Кол-во единиц', format: 'number', additive: true },
      { key: 'count', label: 'Строк', format: 'number', additive: true },
    ],
    defaultConfig: {
      mode: 'summary',
      groupBy: [{ field: 'service' }],
      measures: ['sum_total', 'count'],
    },
  },

  client_balance: {
    key: 'client_balance',
    label: 'Баланс клиентов (кто должен)',
    description: 'По каждому проекту: выставлено услуг − оплачено = долг.',
    fields: [
      CLIENT_FIELD(),
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects' },
      { key: 'project_status', label: 'Статус проекта', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'template', label: 'Шаблон', type: 'uuid', groupable: true, optionsKind: 'templates' },
      { key: 'created', label: 'Дата создания проекта', type: 'date', groupable: true },
      { key: 'billed', money: true, label: 'Выставлено', type: 'number', groupable: false },
      { key: 'paid', money: true, label: 'Оплачено', type: 'number', groupable: false },
      { key: 'expenses', money: true, label: 'Расходы', type: 'number', groupable: false },
      { key: 'balance', money: true, label: 'Долг', type: 'number', groupable: false },
    ],
    measures: [
      { key: 'sum_billed', label: 'Выставлено', format: 'money', additive: true },
      { key: 'sum_paid', label: 'Оплачено', format: 'money', additive: true },
      { key: 'sum_balance', label: 'Долг', format: 'money', additive: true },
      { key: 'sum_expenses', label: 'Расходы', format: 'money', additive: true },
      { key: 'count', label: 'Проектов', format: 'number', additive: true },
    ],
    defaultConfig: {
      mode: 'summary',
      groupBy: [{ field: 'client' }],
      measures: ['sum_billed', 'sum_paid', 'sum_balance'],
      sort: { by: 'a2', dir: 'desc' },
    },
  },

  projects: {
    key: 'projects',
    label: 'Проекты',
    description: 'Количество проектов в разрезе статусов, шаблонов, периодов.',
    periodField: 'created',
    fields: [
      { key: 'project', label: 'Проект', type: 'uuid', groupable: false, optionsKind: 'projects' },
      { key: 'status', label: 'Статус', type: 'uuid', groupable: true, optionsKind: 'projectStatuses' },
      { key: 'template', label: 'Шаблон', type: 'uuid', groupable: true, optionsKind: 'templates' },
      CLIENT_FIELD(),
      { key: 'created', label: 'Дата создания', type: 'date', groupable: true },
      { key: 'deadline', label: 'Дедлайн', type: 'date', groupable: true },
    ],
    measures: [
      { key: 'count', label: 'Проектов', format: 'number', additive: true },
    ],
    defaultConfig: {
      mode: 'summary',
      groupBy: [{ field: 'status' }],
      measures: ['count'],
    },
  },

  threads: {
    key: 'threads',
    label: 'Задачи и чаты',
    description: 'Треды (задачи/чаты/письма) в разрезе статусов и проектов.',
    periodField: 'created',
    fields: [
      { key: 'thread', label: 'Название', type: 'uuid', groupable: false },
      {
        key: 'thread_type', label: 'Тип', type: 'text', groupable: true,
        staticOptions: [
          { value: 'task', label: 'Задача' },
          { value: 'chat', label: 'Чат' },
          { value: 'email', label: 'Email' },
        ],
      },
      { key: 'status', label: 'Статус', type: 'uuid', groupable: true, optionsKind: 'threadStatuses' },
      { key: 'project', label: 'Проект', type: 'uuid', groupable: true, optionsKind: 'projects' },
      { key: 'created', label: 'Дата создания', type: 'date', groupable: true },
      { key: 'deadline', label: 'Срок', type: 'date', groupable: true },
    ],
    measures: [
      { key: 'count', label: 'Тредов', format: 'number', additive: true },
    ],
    defaultConfig: {
      mode: 'summary',
      groupBy: [{ field: 'thread_type' }, { field: 'status' }],
      measures: ['count'],
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

export function getMeasureDef(dataset: ReportDatasetDef, key: string): ReportMeasureDef | null {
  return dataset.measures.find((m) => m.key === key) ?? null
}
