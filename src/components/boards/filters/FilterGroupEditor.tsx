"use client"

import { useCallback, useId, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core'
import { Plus, FolderPlus, X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FilterRuleRow } from './FilterRuleRow'
import { getFieldsForEntity } from './filterDefinitions'
import type { FilterGroup, FilterRule, FilterCondition } from '../types'

// ── Утилиты для работы с path ────────────────────────────

type RulePath = number[]

/** Получить правило по path */
function getRuleByPath(group: FilterGroup, path: RulePath): FilterRule | null {
  if (path.length === 0) return null
  const [idx, ...rest] = path
  const rule = group.rules[idx]
  if (!rule) return null
  if (rest.length === 0) return rule
  if (rule.type === 'group') return getRuleByPath(rule.group, rest)
  return null
}

/** Удалить правило по path, вернуть [новая группа, удалённое правило] */
function removeByPath(group: FilterGroup, path: RulePath): [FilterGroup, FilterRule | null] {
  if (path.length === 0) return [group, null]
  if (path.length === 1) {
    const idx = path[0]
    const removed = group.rules[idx] ?? null
    return [{ ...group, rules: group.rules.filter((_, i) => i !== idx) }, removed]
  }
  const [idx, ...rest] = path
  const rule = group.rules[idx]
  if (!rule || rule.type !== 'group') return [group, null]
  const [newSubGroup, removed] = removeByPath(rule.group, rest)
  const newRules = [...group.rules]
  newRules[idx] = { type: 'group', group: newSubGroup }
  return [{ ...group, rules: newRules }, removed]
}

/** Вставить правило в группу по groupPath, на позицию insertIdx */
function insertAtPosition(
  group: FilterGroup,
  groupPath: RulePath,
  insertIdx: number,
  rule: FilterRule,
): FilterGroup {
  if (groupPath.length === 0) {
    const newRules = [...group.rules]
    newRules.splice(insertIdx, 0, rule)
    return { ...group, rules: newRules }
  }
  const [idx, ...rest] = groupPath
  const target = group.rules[idx]
  if (!target || target.type !== 'group') return group
  const newSubGroup = insertAtPosition(target.group, rest, insertIdx, rule)
  const newRules = [...group.rules]
  newRules[idx] = { type: 'group', group: newSubGroup }
  return { ...group, rules: newRules }
}

/**
 * Корректирует target path после удаления элемента по removedPath.
 */
function adjustPathAfterRemoval(targetPath: RulePath, removedPath: RulePath): RulePath {
  if (removedPath.length === 0 || targetPath.length === 0) return targetPath
  const removedParent = removedPath.slice(0, -1)
  const removedIdx = removedPath[removedPath.length - 1]
  const adjusted = [...targetPath]
  if (removedParent.length <= targetPath.length) {
    const parentMatches = removedParent.every((v, i) => v === targetPath[i])
    if (parentMatches && removedParent.length < targetPath.length) {
      const levelIdx = removedParent.length
      if (adjusted[levelIdx] > removedIdx) {
        adjusted[levelIdx] = adjusted[levelIdx] - 1
      }
    }
  }
  return adjusted
}

function adjustIndexAfterRemoval(
  targetGroupPath: RulePath,
  targetIdx: number,
  removedPath: RulePath,
): number {
  const removedParent = removedPath.slice(0, -1)
  const removedIdx = removedPath[removedPath.length - 1]
  // Если удаляем из той же группы и перед целевым индексом
  if (
    removedParent.length === targetGroupPath.length &&
    removedParent.every((v, i) => v === targetGroupPath[i]) &&
    removedIdx < targetIdx
  ) {
    return targetIdx - 1
  }
  return targetIdx
}

// ── Drag IDs ─────────────────────────────────────────────

function pathToId(prefix: string, path: RulePath): string {
  return `${prefix}:rule:${path.join('-')}`
}

function idToPath(prefix: string, id: string): { type: 'rule'; path: RulePath } | null {
  if (!id.startsWith(prefix + ':')) return null
  const rest = id.slice(prefix.length + 1)
  const ruleMatch = rest.match(/^rule:(.+)$/)
  if (ruleMatch) {
    return { type: 'rule', path: ruleMatch[1].split('-').map(Number) }
  }
  return null
}

// ── Drop indicator state ─────────────────────────────────

interface DropIndicatorState {
  /** Path элемента, рядом с которым показать линию */
  targetPath: RulePath
  /** Позиция линии */
  position: 'top' | 'bottom'
}

// ── Draggable Rule ───────────────────────────────────────

interface DraggableRuleProps {
  dndId: string
  children: React.ReactNode
  dropIndicator: DropIndicatorState | null
  rulePath: RulePath
}

function DraggableRule({ dndId, children, dropIndicator, rulePath }: DraggableRuleProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dndId,
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
  })

  const showTop =
    dropIndicator &&
    dropIndicator.position === 'top' &&
    dropIndicator.targetPath.join('-') === rulePath.join('-')
  const showBottom =
    dropIndicator &&
    dropIndicator.position === 'bottom' &&
    dropIndicator.targetPath.join('-') === rulePath.join('-')

  return (
    <div
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      className={cn(
        'relative flex items-center gap-1 border rounded-md px-2 py-1.5 bg-background',
        isDragging && 'opacity-30',
      )}
    >
      {showTop && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {showBottom && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/50 hover:text-muted-foreground shrink-0 touch-none"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ── FilterGroupEditor (внутренний, без DndContext) ────────

interface InnerGroupEditorProps {
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  entityType: 'task' | 'project'
  depth: number
  onRemove?: () => void
  workspaceId: string
  dndPrefix: string
  path: RulePath
  dropIndicator: DropIndicatorState | null
}

function InnerGroupEditor({
  group,
  onChange,
  entityType,
  depth,
  onRemove,
  workspaceId,
  dndPrefix,
  path,
  dropIndicator,
}: InnerGroupEditorProps) {
  const fields = getFieldsForEntity(entityType)
  const defaultField = fields[0]?.key ?? ''

  const toggleLogic = useCallback(() => {
    onChange({ ...group, logic: group.logic === 'and' ? 'or' : 'and' })
  }, [group, onChange])

  const updateRule = useCallback(
    (index: number, rule: FilterRule) => {
      const newRules = [...group.rules]
      newRules[index] = rule
      onChange({ ...group, rules: newRules })
    },
    [group, onChange],
  )

  const removeRule = useCallback(
    (index: number) => {
      onChange({ ...group, rules: group.rules.filter((_, i) => i !== index) })
    },
    [group, onChange],
  )

  const addCondition = useCallback(() => {
    const newCondition: FilterCondition = {
      type: 'condition',
      field: defaultField,
      operator: 'equals',
      value: null,
    }
    onChange({ ...group, rules: [...group.rules, newCondition] })
  }, [group, onChange, defaultField])

  const addGroup = useCallback(() => {
    const newGroup: FilterRule = {
      type: 'group',
      group: { logic: 'and', rules: [] },
    }
    onChange({ ...group, rules: [...group.rules, newGroup] })
  }, [group, onChange])

  return (
    <div
      className={cn(
        'space-y-2',
        depth > 0 && 'border rounded-lg p-3 bg-muted/20',
      )}
    >
      {/* Logic toggle + remove */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleLogic}
          className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full transition-colors',
            group.logic === 'and'
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200',
          )}
        >
          {group.logic === 'and' ? 'И' : 'ИЛИ'}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {group.logic === 'and'
            ? 'все условия должны совпасть'
            : 'достаточно одного совпадения'}
        </span>
        {depth > 0 && onRemove && (
          <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={onRemove}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Rules */}
      {group.rules.map((rule, i) => {
        const rulePath = [...path, i]
        const ruleId = pathToId(dndPrefix, rulePath)

        return (
          <div key={i}>
            {rule.type === 'condition' ? (
              <DraggableRule dndId={ruleId} dropIndicator={dropIndicator} rulePath={rulePath}>
                <FilterRuleRow
                  condition={rule}
                  onChange={(updated) => updateRule(i, updated)}
                  onRemove={() => removeRule(i)}
                  entityType={entityType}
                  workspaceId={workspaceId}
                />
              </DraggableRule>
            ) : (
              <DraggableRule dndId={ruleId} dropIndicator={dropIndicator} rulePath={rulePath}>
                <InnerGroupEditor
                  group={rule.group}
                  onChange={(updated) =>
                    updateRule(i, { type: 'group', group: updated })
                  }
                  onRemove={() => removeRule(i)}
                  entityType={entityType}
                  depth={depth + 1}
                  workspaceId={workspaceId}
                  dndPrefix={dndPrefix}
                  path={rulePath}
                  dropIndicator={dropIndicator}
                />
              </DraggableRule>
            )}
          </div>
        )
      })}

      {/* Add buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={addCondition}
        >
          <Plus className="h-3 w-3 mr-1" />
          Условие
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={addGroup}
        >
          <FolderPlus className="h-3 w-3 mr-1" />
          Группа
        </Button>
      </div>
    </div>
  )
}

// ── Overlay для drag ─────────────────────────────────────

function DragOverlayContent({ rule, entityType }: { rule: FilterRule; entityType: 'task' | 'project' }) {
  if (rule.type === 'condition') {
    const fields = getFieldsForEntity(entityType)
    const field = fields.find((f) => f.key === rule.field)
    return (
      <div className="bg-background border rounded-md px-3 py-2 shadow-lg text-xs flex items-center gap-2 max-w-[400px]">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium">{field?.label ?? rule.field}</span>
        <span className="text-muted-foreground">{rule.operator}</span>
        <span className="truncate">{String(rule.value ?? '')}</span>
      </div>
    )
  }
  return (
    <div className="bg-background border rounded-md px-3 py-2 shadow-lg text-xs flex items-center gap-2">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="font-medium">Группа ({rule.group.logic === 'and' ? 'И' : 'ИЛИ'})</span>
      <span className="text-muted-foreground">{rule.group.rules.length} усл.</span>
    </div>
  )
}

// ── FilterGroupEditor (публичный, с DndContext) ──────────

interface FilterGroupEditorProps {
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  entityType: 'task' | 'project'
  depth: number
  onRemove?: () => void
  workspaceId: string
}

export function FilterGroupEditor({
  group,
  onChange,
  entityType,
  depth,
  onRemove,
  workspaceId,
}: FilterGroupEditorProps) {
  if (depth > 0) {
    return (
      <InnerGroupEditor
        group={group}
        onChange={onChange}
        entityType={entityType}
        depth={depth}
        onRemove={onRemove}
        workspaceId={workspaceId}
        dndPrefix=""
        path={[]}
        dropIndicator={null}
      />
    )
  }

  return (
    <FilterGroupEditorRoot
      group={group}
      onChange={onChange}
      entityType={entityType}
      workspaceId={workspaceId}
    />
  )
}

function FilterGroupEditorRoot({
  group,
  onChange,
  entityType,
  workspaceId,
}: {
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  entityType: 'task' | 'project'
  workspaceId: string
}) {
  const instanceId = useId()
  const dndPrefix = `filter-${instanceId}`
  const [activeRule, setActiveRule] = useState<FilterRule | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const parsed = idToPath(dndPrefix, String(event.active.id))
      if (!parsed) return
      const rule = getRuleByPath(group, parsed.path)
      if (rule) {
        setActiveRule(rule)
      }
    },
    [group, dndPrefix],
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        setDropIndicator(null)
        return
      }

      const targetParsed = idToPath(dndPrefix, String(over.id))
      if (!targetParsed) {
        setDropIndicator(null)
        return
      }

      // Вычисляем позицию (top/bottom) по Y-координатам
      const overRect = over.rect
      if (!overRect) {
        setDropIndicator(null)
        return
      }

      const pointerY = (event.activatorEvent as PointerEvent)?.clientY
      const deltaY = event.delta?.y ?? 0
      const currentY = pointerY != null ? pointerY + deltaY : 0
      const midY = overRect.top + overRect.height / 2
      const position: 'top' | 'bottom' = currentY < midY ? 'top' : 'bottom'

      setDropIndicator({ targetPath: targetParsed.path, position })
    },
    [dndPrefix],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const indicator = dropIndicator
      setActiveRule(null)
      setDropIndicator(null)

      const { active, over } = event
      if (!over || active.id === over.id || !indicator) return

      const sourceParsed = idToPath(dndPrefix, String(active.id))
      const targetParsed = idToPath(dndPrefix, String(over.id))
      if (!sourceParsed || !targetParsed) return

      const sourcePath = sourceParsed.path
      const targetPath = targetParsed.path

      // Не перемещаем группу внутрь себя
      if (
        targetPath.length > sourcePath.length &&
        sourcePath.every((v, i) => v === targetPath[i])
      ) {
        return
      }

      // Целевая группа — родитель target элемента
      const targetGroupPath = targetPath.slice(0, -1)
      const targetIdx = targetPath[targetPath.length - 1]
      // Позиция вставки: top → перед элементом, bottom → после
      const insertIdx = indicator.position === 'top' ? targetIdx : targetIdx + 1

      // Если перемещаем в ту же позицию — ничего не делаем
      const sourceGroupPath = sourcePath.slice(0, -1)
      const sourceIdx = sourcePath[sourcePath.length - 1]
      if (
        sourceGroupPath.join('-') === targetGroupPath.join('-') &&
        (sourceIdx === insertIdx || sourceIdx === insertIdx - 1)
      ) {
        return
      }

      // 1. Удалить из источника
      const [afterRemove, removed] = removeByPath(group, sourcePath)
      if (!removed) return

      // 2. Скорректировать target path и insertIdx после удаления
      const adjustedGroupPath = adjustPathAfterRemoval(targetGroupPath, sourcePath)
      const adjustedInsertIdx = adjustIndexAfterRemoval(adjustedGroupPath, insertIdx, sourcePath)

      // 3. Вставить на нужную позицию
      const result = insertAtPosition(afterRemove, adjustedGroupPath, adjustedInsertIdx, removed)
      onChange(result)
    },
    [group, onChange, dndPrefix, dropIndicator],
  )

  const handleDragCancel = useCallback(() => {
    setActiveRule(null)
    setDropIndicator(null)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <InnerGroupEditor
        group={group}
        onChange={onChange}
        entityType={entityType}
        depth={0}
        workspaceId={workspaceId}
        dndPrefix={dndPrefix}
        path={[]}
        dropIndicator={activeRule ? dropIndicator : null}
      />
      <DragOverlay dropAnimation={null}>
        {activeRule && <DragOverlayContent rule={activeRule} entityType={entityType} />}
      </DragOverlay>
    </DndContext>
  )
}
