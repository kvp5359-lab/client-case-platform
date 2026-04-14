"use client"

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight, LayoutList, LayoutGrid } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { CardLayout, CardFieldId, CardFieldStyle, CardFontSize, CardAlign, CardTruncate, DisplayMode } from './types'
import { getFieldLabel } from './listSettingsConfigs'
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
import { DraggableLayoutField } from './DraggableLayoutField'
import { CardLayoutPreview } from './CardLayoutPreview'

interface ListSettingsAppearanceTabProps {
  entityType: 'task' | 'project'
  cardLayout: CardLayout
  onCardLayoutChange: (layout: CardLayout) => void
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  columnWidth?: number
}

const FONT_SIZES: { value: CardFontSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
]

const ALIGNS: { value: CardAlign; icon: React.ElementType }[] = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
]

const TRUNCATES: { value: CardTruncate; label: string }[] = [
  { value: 'truncate', label: 'Обрезать' },
  { value: 'wrap', label: 'Переносить' },
]

const BANK_ID = '__bank__'

/** Банк неразмещённых полей (droppable + sortable items) */
function FieldBank({
  unplacedIds,
  onAddToRow,
}: {
  unplacedIds: CardFieldId[]
  onAddToRow: (fieldId: CardFieldId) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK_ID })
  const sortableIds = unplacedIds.map((fid) => `${BANK_ID}::${fid}`)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-wrap items-center gap-1.5 min-h-[36px] px-2 py-1.5 rounded-md border border-dashed transition-colors',
        isOver ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/30',
      )}
    >
      {unplacedIds.length === 0 ? (
        <span className="text-[11px] text-muted-foreground/50">Все поля размещены</span>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground mr-1">Доступные:</span>
          <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
            {unplacedIds.map((fid) => (
              <DraggableLayoutField
                key={fid}
                fieldId={fid}
                rowId={BANK_ID}
                onClick={() => onAddToRow(fid)}
              />
            ))}
          </SortableContext>
        </>
      )}
    </div>
  )
}

/** Строка с полями (droppable) */
function LayoutRow({
  rowId,
  rowIndex,
  totalRows,
  fieldIds,
  activeFieldId,
  onFieldClick,
  onRemoveRow,
  onRemoveField,
}: {
  rowId: string
  rowIndex: number
  totalRows: number
  fieldIds: CardFieldId[]
  activeFieldId: CardFieldId | null
  onFieldClick: (fieldId: CardFieldId) => void
  onRemoveRow: () => void
  onRemoveField: (fieldId: CardFieldId) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: rowId })
  const sortableIds = fieldIds.map((fid) => `${rowId}::${fid}`)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Строка {rowIndex + 1}</span>
        <div className="flex-1" />
        {totalRows > 1 && (
          <button
            type="button"
            onClick={onRemoveRow}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-wrap items-center gap-1.5 min-h-[36px] px-2 py-1.5 rounded-md border border-dashed transition-colors',
          isOver ? 'border-primary bg-primary/5' : 'border-border',
          fieldIds.length === 0 && 'justify-center',
        )}
      >
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {fieldIds.length === 0 && (
            <span className="text-[11px] text-muted-foreground/50">Перетащите поля сюда</span>
          )}
          {fieldIds.map((fid) => (
            <DraggableLayoutField
              key={fid}
              fieldId={fid}
              rowId={rowId}
              isActive={activeFieldId === fid}
              onClick={() => onFieldClick(fid)}
              onRemove={() => onRemoveField(fid)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

/** Инлайн-панель настроек выбранного поля */
function FieldStyleEditor({
  fieldId,
  style,
  onStyleChange,
  onClose,
}: {
  fieldId: CardFieldId
  style: CardFieldStyle
  onStyleChange: (patch: Partial<CardFieldStyle>) => void
  onClose: () => void
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{getFieldLabel(fieldId)}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Закрыть
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Размер</Label>
          <div className="flex gap-1">
            {FONT_SIZES.map((fs) => (
              <button
                key={fs.value}
                type="button"
                onClick={() => onStyleChange({ fontSize: fs.value })}
                className={cn(
                  'flex-1 py-1 rounded text-xs border transition-colors',
                  style.fontSize === fs.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50',
                )}
              >
                {fs.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Выравнивание</Label>
          <div className="flex gap-1">
            {ALIGNS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => onStyleChange({ align: a.value })}
                className={cn(
                  'flex-1 flex items-center justify-center py-1 rounded border transition-colors',
                  style.align === a.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                <a.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Текст</Label>
          <div className="flex gap-1">
            {TRUNCATES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onStyleChange({ truncate: t.value })}
                className={cn(
                  'flex-1 py-1 rounded text-xs border transition-colors',
                  style.truncate === t.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Жирный</Label>
          <div className="flex items-center h-[30px]">
            <Switch
              checked={style.bold}
              onCheckedChange={(checked) => onStyleChange({ bold: checked })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ListSettingsAppearanceTab({
  entityType,
  cardLayout,
  onCardLayoutChange,
  displayMode,
  onDisplayModeChange,
  columnWidth,
}: ListSettingsAppearanceTabProps) {
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
      {/* Режим отображения */}
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

      {/* Расположение полей */}
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
    </div>
  )
}
