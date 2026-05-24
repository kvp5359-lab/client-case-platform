import { useReducer, useEffect } from 'react'
import { defaultVisibleFields, defaultCardLayout } from '../listSettingsConfigs'
import {
  DEFAULT_CALENDAR_SETTINGS,
  type BoardList,
  type CardLayout,
  type CalendarSettings,
  type DisplayMode,
  type VisibleField,
  type GroupByField,
  type ListHeight,
} from '../types'
import type { FilterGroup, SortField, SortDir } from '@/lib/filters/types'

export type ListSettingsState = {
  name: string
  entityType: 'thread' | 'project' | 'inbox'
  columnIndex: string
  filters: FilterGroup
  sortBy: SortField
  sortDir: SortDir
  displayMode: DisplayMode
  visibleFields: VisibleField[]
  groupBy: GroupByField
  listHeight: ListHeight
  headerColor: string
  cardLayout: CardLayout
  calendarSettings: CalendarSettings
  inboxDefaultFilter: 'all' | 'unread'
}

type Action =
  | { type: 'SET'; field: keyof ListSettingsState; value: unknown }
  | { type: 'RESET_FROM_LIST'; list: BoardList }
  | { type: 'CHANGE_ENTITY_TYPE'; entityType: 'thread' | 'project' | 'inbox' }
  | { type: 'PICK_CALENDAR' }
  | { type: 'RESET_ALL'; entityType: 'thread' | 'project' | 'inbox' }

function parseInboxFilter(list: BoardList): 'all' | 'unread' {
  const raw = list.filters as unknown as { default_filter?: string } | null
  return raw?.default_filter === 'unread' ? 'unread' : 'all'
}

function stateFromList(list: BoardList): ListSettingsState {
  return {
    name: list.name,
    entityType: list.entity_type as 'thread' | 'project' | 'inbox',
    columnIndex: String(list.column_index),
    filters: list.filters?.rules ? list.filters : { logic: 'and', rules: [] },
    sortBy: list.sort_by ?? 'created_at',
    sortDir: list.sort_dir ?? 'desc',
    displayMode: list.display_mode ?? 'list',
    visibleFields: list.visible_fields ?? defaultVisibleFields(list.entity_type),
    groupBy: list.group_by ?? 'none',
    listHeight: list.list_height ?? 'auto',
    headerColor: list.header_color ?? '#6B7280',
    cardLayout: list.card_layout ?? defaultCardLayout(list.entity_type),
    calendarSettings: list.calendar_settings ?? DEFAULT_CALENDAR_SETTINGS,
    inboxDefaultFilter: parseInboxFilter(list),
  }
}

function reducer(state: ListSettingsState, action: Action): ListSettingsState {
  switch (action.type) {
    case 'SET':
      return { ...state, [action.field]: action.value }

    case 'RESET_FROM_LIST':
      return stateFromList(action.list)

    case 'CHANGE_ENTITY_TYPE':
      return {
        ...state,
        entityType: action.entityType,
        // Выход из календаря: если был календарный режим — сбрасываем display_mode.
        displayMode: state.displayMode === 'calendar' ? 'list' : state.displayMode,
        filters: { logic: 'and', rules: [] },
        visibleFields: defaultVisibleFields(action.entityType),
        cardLayout: defaultCardLayout(action.entityType),
        sortBy: 'created_at',
        groupBy: 'none',
      }

    case 'PICK_CALENDAR':
      return {
        ...state,
        entityType: 'thread',
        displayMode: 'calendar',
        calendarSettings: state.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS,
      }

    case 'RESET_ALL':
      return {
        ...state,
        filters: { logic: 'and', rules: [] },
        sortBy: 'created_at',
        sortDir: 'desc',
        displayMode: 'list',
        visibleFields: defaultVisibleFields(action.entityType),
        cardLayout: defaultCardLayout(action.entityType),
        calendarSettings: DEFAULT_CALENDAR_SETTINGS,
        groupBy: 'none',
        listHeight: 'auto',
        headerColor: 'gray',
      }

    default:
      return state
  }
}

export function useListSettingsState(list: BoardList, open: boolean) {
  const [state, dispatch] = useReducer(reducer, list, stateFromList)

  useEffect(() => {
    if (open) dispatch({ type: 'RESET_FROM_LIST', list })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = <K extends keyof ListSettingsState>(field: K, value: ListSettingsState[K]) =>
    dispatch({ type: 'SET', field, value })

  return { state, set, dispatch }
}
