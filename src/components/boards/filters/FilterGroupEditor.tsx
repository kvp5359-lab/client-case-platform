"use client"

/**
 * Редактор группы фильтров для досок. Поддерживает:
 *  - вложенные группы (логика И/ИЛИ)
 *  - условия с произвольными полями (task/project)
 *  - drag & drop перестановку правил и групп между собой
 *
 * После аудита 2026-04-11 (Зона 6) разбит на несколько файлов:
 *  - `filterPathUtils.ts` — чистые утилиты работы с path-массивом
 *  - `DraggableFilterRule.tsx` — обёртка drag-handle + drop-target
 *  - `FilterDragOverlay.tsx` — overlay-содержимое во время drag
 *  - этот файл — `InnerGroupEditor` + `FilterGroupEditorRoot` (dnd-контекст)
 */

import { useCallback, useId, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core'
import { Plus, FolderPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FilterRuleRow } from './FilterRuleRow'
import { getFieldsForEntity } from './filterDefinitions'
import {
  type RulePath,
  getRuleByPath,
  removeByPath,
  insertAtPosition,
  adjustPathAfterRemoval,
  adjustIndexAfterRemoval,
  pathToId,
  idToPath,
} from './filterPathUtils'
import { DraggableFilterRule, type DropIndicatorState } from './DraggableFilterRule'
import { FilterDragOverlay } from './FilterDragOverlay'
import type { FilterGroup, FilterRule, FilterCondition } from '../types'

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
              <DraggableFilterRule
                dndId={ruleId}
                dropIndicator={dropIndicator}
                rulePath={rulePath}
              >
                <FilterRuleRow
                  condition={rule}
                  onChange={(updated) => updateRule(i, updated)}
                  onRemove={() => removeRule(i)}
                  entityType={entityType}
                  workspaceId={workspaceId}
                />
              </DraggableFilterRule>
            ) : (
              <DraggableFilterRule
                dndId={ruleId}
                dropIndicator={dropIndicator}
                rulePath={rulePath}
              >
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
              </DraggableFilterRule>
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
        {activeRule && <FilterDragOverlay rule={activeRule} entityType={entityType} />}
      </DragOverlay>
    </DndContext>
  )
}
