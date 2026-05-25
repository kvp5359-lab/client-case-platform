"use client"

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Plus, LayoutList, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  type CardLayout,
  type CardFieldId,
  type CardFieldStyle,
  type DisplayMode,
  type CalendarSettings,
  DEFAULT_CALENDAR_SETTINGS,
} from './types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  updateFieldStyle,
  addRow,
  removeRow,
  hideField,
  placeFieldInRow,
  getUnplacedFields,
  getFieldStyle,
  DEFAULT_FIELD_STYLE,
  moveField,
} from './cardLayoutUtils'
import { CardLayoutPreview } from './CardLayoutPreview'
import { FieldBank, BANK_ID } from './list-settings/FieldBank'
import { LayoutRow } from './list-settings/LayoutRow'
import { FieldStyleEditor } from './list-settings/FieldStyleEditor'
import { CalendarSourcesPicker } from './list-settings/CalendarSourcesPicker'

type ListSettingsAppearanceTabProps = {
  entityType: 'thread' | 'project'
  cardLayout: CardLayout
  onCardLayoutChange: (layout: CardLayout) => void
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  columnWidth?: number
  calendarSettings: CalendarSettings
  onCalendarSettingsChange: (v: CalendarSettings) => void
  /** Нужен для мультиселекта источников-календарей в режиме calendar. */
  workspaceId: string
}

// FieldBank, LayoutRow, FieldStyleEditor вынесены в ./list-settings/

export default function ListSettingsAppearanceTab({
  entityType,
  cardLayout,
  onCardLayoutChange,
  displayMode,
  onDisplayModeChange,
  columnWidth,
  calendarSettings,
  onCalendarSettingsChange,
  workspaceId,
}: ListSettingsAppearanceTabProps) {
  const cs = calendarSettings ?? DEFAULT_CALENDAR_SETTINGS
  const isCalendar = displayMode === 'calendar'
  const [activeFieldId, setActiveFieldId] = useState<CardFieldId | null>(null)

  const unplacedIds = useMemo(
    () => getUnplacedFields(cardLayout, entityType),
    [cardLayout, entityType],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleStyleChange = useCallback(
    (fieldId: CardFieldId, patch: Partial<CardFieldStyle>) => {
      onCardLayoutChange(updateFieldStyle(cardLayout, fieldId, patch))
    },
    [cardLayout, onCardLayoutChange],
  )

  const handleAddRow = useCallback(() => {
    onCardLayoutChange(addRow(cardLayout))
  }, [cardLayout, onCardLayoutChange])

  const handleRemoveRow = useCallback(
    (rowId: string) => {
      onCardLayoutChange(removeRow(cardLayout, rowId))
    },
    [cardLayout, onCardLayoutChange],
  )

  const handleRemoveField = useCallback(
    (fieldId: CardFieldId) => {
      setActiveFieldId((prev) => (prev === fieldId ? null : prev))
      onCardLayoutChange(hideField(cardLayout, fieldId))
    },
    [cardLayout, onCardLayoutChange],
  )

  /** Клик по полю в банке → добавить в последнюю строку */
  const handleAddFromBank = useCallback(
    (fieldId: CardFieldId) => {
      const lastRow = cardLayout.rows[cardLayout.rows.length - 1]
      if (lastRow) {
        onCardLayoutChange(placeFieldInRow(cardLayout, fieldId, lastRow.id))
      }
    },
    [cardLayout, onCardLayoutChange],
  )

  const handleFieldClick = useCallback((fieldId: CardFieldId) => {
    setActiveFieldId((prev) => (prev === fieldId ? null : fieldId))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const activeData = active.data.current as { fieldId: CardFieldId; rowId: string } | undefined
      if (!activeData) return

      const overId = over.id as string
      const fromBank = activeData.rowId === BANK_ID

      // Бросили в банк — убрать поле из строки
      if (overId === BANK_ID || overId.startsWith(BANK_ID + '::')) {
        if (!fromBank) {
          onCardLayoutChange(hideField(cardLayout, activeData.fieldId))
        }
        return
      }

      // Определяем целевую строку
      let targetRowId: string
      let targetIndex: number

      if (overId.includes('::')) {
        const overData = over.data.current as { fieldId: CardFieldId; rowId: string } | undefined
        if (!overData) return
        targetRowId = overData.rowId
        const targetRow = cardLayout.rows.find((r) => r.id === targetRowId)
        if (!targetRow) return
        targetIndex = targetRow.fields.findIndex((f) => f.fieldId === overData.fieldId)
        if (targetIndex === -1) targetIndex = targetRow.fields.length
      } else {
        targetRowId = overId
        const targetRow = cardLayout.rows.find((r) => r.id === targetRowId)
        targetIndex = targetRow ? targetRow.fields.length : 0
      }

      if (fromBank) {
        // Из банка в строку
        onCardLayoutChange(placeFieldInRow(cardLayout, activeData.fieldId, targetRowId))
      } else {
        // Из строки в строку
        onCardLayoutChange(
          moveField(cardLayout, activeData.fieldId, activeData.rowId, targetRowId, targetIndex),
        )
      }
    },
    [cardLayout, onCardLayoutChange],
  )

  const selectedFieldStyle = activeFieldId
    ? getFieldStyle(cardLayout, activeFieldId) ?? DEFAULT_FIELD_STYLE
    : null

  return (
    <div className="py-1">
      {/* Режим отображения — скрыт в календарном режиме (выбор там же в Тип данных) */}
      {!isCalendar && (
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground shrink-0">
          Режим
        </Label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onDisplayModeChange('list')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors',
              displayMode === 'list'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Список
          </button>
          <button
            type="button"
            onClick={() => onDisplayModeChange('cards')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors',
              displayMode === 'cards'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Карточки
          </button>
        </div>
      </div>
      )}

      {/* Настройки календаря — только когда display_mode='calendar' */}
      {isCalendar && (
        <div className="mt-5 space-y-3">
          <Label className="text-xs text-muted-foreground">Календарь</Label>
          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label className="text-[11px] text-muted-foreground">Вид по умолчанию</Label>
              <Select
                value={cs.default_view}
                onValueChange={(v) =>
                  onCalendarSettingsChange({ ...cs, default_view: v as CalendarSettings['default_view'] })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">День</SelectItem>
                  <SelectItem value="work_week">Будни</SelectItem>
                  <SelectItem value="week">Неделя</SelectItem>
                  <SelectItem value="next_n">Следующие N дней</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cs.default_view === 'next_n' && (
              <div className="space-y-1.5 w-[90px] shrink-0">
                <Label className="text-[11px] text-muted-foreground">N (дней)</Label>
                <Select
                  value={String(cs.next_n_days ?? 7)}
                  onValueChange={(v) =>
                    onCalendarSettingsChange({ ...cs, next_n_days: parseInt(v, 10) })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 7, 10, 14, 21, 30].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 w-[110px] shrink-0">
              <Label className="text-[11px] text-muted-foreground">С (час)</Label>
              <Select
                value={String(cs.min_hour)}
                onValueChange={(v) =>
                  onCalendarSettingsChange({ ...cs, min_hour: parseInt(v, 10) })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-[110px] shrink-0">
              <Label className="text-[11px] text-muted-foreground">До (час)</Label>
              <Select
                value={String(cs.max_hour)}
                onValueChange={(v) =>
                  onCalendarSettingsChange({ ...cs, max_hour: parseInt(v, 10) })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Календарь показывает только задачи с заполненными «началом» и «концом». Высота — из «Высоты» во вкладке «Основное».
          </p>

          <CalendarSourcesPicker
            workspaceId={workspaceId}
            value={cs.calendar_ids ?? []}
            onChange={(ids) => onCalendarSettingsChange({ ...cs, calendar_ids: ids })}
          />
        </div>
      )}

      {/* Расположение полей — скрыто в календарном режиме */}
      {!isCalendar && (
      <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="mt-5 space-y-2">
          <Label className="text-xs text-muted-foreground">Расположение полей</Label>
          <FieldBank unplacedIds={unplacedIds} onAddToRow={handleAddFromBank} />
          <div className="space-y-2 group/rows">
            {cardLayout.rows.map((row, rowIndex) => {
              const visibleFieldIds = row.fields
                .filter((f) => f.visible)
                .map((f) => f.fieldId)

              return (
                <LayoutRow
                  key={row.id}
                  rowId={row.id}
                  rowIndex={rowIndex}
                  totalRows={cardLayout.rows.length}
                  fieldIds={visibleFieldIds}
                  activeFieldId={activeFieldId}
                  onFieldClick={handleFieldClick}
                  onRemoveRow={() => handleRemoveRow(row.id)}
                  onRemoveField={handleRemoveField}
                />
              )
            })}
            {cardLayout.rows.length < 3 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground opacity-0 group-hover/rows:opacity-100 transition-opacity"
                onClick={handleAddRow}
              >
                <Plus className="h-3 w-3 mr-1" />
                Добавить строку
              </Button>
            )}
          </div>
        </div>

      </DndContext>

      {/* Настройки выбранного поля */}
      <div className="mt-4 space-y-4">
        {activeFieldId && selectedFieldStyle && (
          <FieldStyleEditor
            fieldId={activeFieldId}
            style={selectedFieldStyle}
            onStyleChange={(patch) => handleStyleChange(activeFieldId, patch)}
            onClose={() => setActiveFieldId(null)}
          />
        )}

        {/* Превью */}
        <CardLayoutPreview layout={cardLayout} entityType={entityType} columnWidth={columnWidth} />
      </div>
      </>
      )}
    </div>
  )
}

// CalendarSourcesPicker вынесен в ./list-settings/CalendarSourcesPicker
