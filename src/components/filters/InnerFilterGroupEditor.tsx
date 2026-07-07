"use client"

/**
 * InnerFilterGroupEditor — рекурсивный редактор группы фильтров без обёртки
 * DndContext. Используется и как корневой контент (вызывается из
 * FilterGroupEditorRoot), и как вложенная группа (сам себя вызывает).
 *
 * Вынесен из FilterGroupEditor.tsx, чтобы не мешать DnD-роутингу в верхнем
 * файле.
 */

import { useCallback } from 'react'
import { Plus, FolderPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FilterRuleRow } from './FilterRuleRow'
import { getFieldsForEntity } from '@/lib/filters/filterDefinitions'
import { getApplicableThreadTypes, filterFieldsByThreadTypes } from '@/lib/filters/fieldVisibility'
import { useFilterRootGroup } from './FilterRootContext'
import { type RulePath, pathToId } from '@/lib/filters/filterPathUtils'
import { DraggableFilterRule, type DropIndicatorState } from './DraggableFilterRule'
import type { FilterGroup, FilterRule, FilterCondition, FilterEntityType } from '@/lib/filters/types'

type InnerFilterGroupEditorProps = {
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  entityType: FilterEntityType
  depth: number
  onRemove?: () => void
  workspaceId: string
  dndPrefix: string
  path: RulePath
  dropIndicator: DropIndicatorState | null
}

export function InnerFilterGroupEditor({
  group,
  onChange,
  entityType,
  depth,
  onRemove,
  workspaceId,
  dndPrefix,
  path,
  dropIndicator,
}: InnerFilterGroupEditorProps) {
  const rootGroup = useFilterRootGroup()
  const allFields = getFieldsForEntity(entityType)
  const fields =
    entityType === 'thread' && rootGroup
      ? filterFieldsByThreadTypes(allFields, getApplicableThreadTypes(rootGroup))
      : allFields
  // Если первое доступное поле сменилось из-за сужения по type — defaultField
  // тоже подстроится. На уровне выбора поля в FilterRuleRow есть отдельная
  // защита (см. ниже useEffect в FilterRuleRow).
  const defaultField = fields[0]?.key ?? allFields[0]?.key ?? ''

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
          <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={onRemove} aria-label="Удалить группу условий">
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
                <InnerFilterGroupEditor
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
