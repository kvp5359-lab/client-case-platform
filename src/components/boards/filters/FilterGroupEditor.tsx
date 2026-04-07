"use client"

import { useCallback } from 'react'
import { Plus, FolderPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FilterRuleRow } from './FilterRuleRow'
import { getFieldsForEntity } from './filterDefinitions'
import type { FilterGroup, FilterRule, FilterCondition } from '../types'

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
        depth > 0 && 'ml-4 pl-3 border-l-2 border-muted',
      )}
    >
      {/* Logic toggle + remove */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleLogic}
          className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full',
            group.logic === 'and'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-orange-100 text-orange-700',
          )}
        >
          {group.logic === 'and' ? 'И' : 'ИЛИ'}
        </button>
        {depth > 0 && onRemove && (
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onRemove}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Rules */}
      {group.rules.map((rule, i) => (
        <div key={i}>
          {rule.type === 'condition' ? (
            <FilterRuleRow
              condition={rule}
              onChange={(updated) => updateRule(i, updated)}
              onRemove={() => removeRule(i)}
              entityType={entityType}
              workspaceId={workspaceId}
            />
          ) : (
            <FilterGroupEditor
              group={rule.group}
              onChange={(updated) =>
                updateRule(i, { type: 'group', group: updated })
              }
              onRemove={() => removeRule(i)}
              entityType={entityType}
              depth={depth + 1}
              workspaceId={workspaceId}
            />
          )}
        </div>
      ))}

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
