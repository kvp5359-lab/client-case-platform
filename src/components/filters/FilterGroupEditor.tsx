"use client"

/**
 * Редактор группы фильтров для досок. Поддерживает:
 *  - вложенные группы (логика И/ИЛИ)
 *  - условия с произвольными полями (task/project)
 *  - drag & drop перестановку правил и групп между собой
 *
 * Файл — тонкий роутер: пробрасывает в InnerFilterGroupEditor (UI) и
 * оборачивает корень в DndContext + хук useFilterDnD (логика).
 *
 * Соседи:
 *  - `filterPathUtils.ts` — чистые утилиты работы с path-массивом
 *  - `DraggableFilterRule.tsx` — обёртка drag-handle + drop-target
 *  - `FilterDragOverlay.tsx` — overlay-содержимое во время drag
 *  - `InnerFilterGroupEditor.tsx` — рекурсивный UI редактора
 *  - `useFilterDnD.ts` — DnD-обработчики
 */

import { useId } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { InnerFilterGroupEditor } from './InnerFilterGroupEditor'
import { FilterDragOverlay } from './FilterDragOverlay'
import { FilterRootGroupContext } from './FilterRootContext'
import { useFilterDnD } from './useFilterDnD'
import type { FilterGroup, FilterEntityType } from '@/lib/filters/types'

type FilterGroupEditorProps = {
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  entityType: FilterEntityType
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
      <InnerFilterGroupEditor
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
  entityType: FilterEntityType
  workspaceId: string
}) {
  const instanceId = useId()
  const dndPrefix = `filter-${instanceId}`

  const {
    sensors,
    activeRule,
    dropIndicator,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useFilterDnD({ group, onChange, dndPrefix })

  return (
    <FilterRootGroupContext.Provider value={group}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <InnerFilterGroupEditor
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
    </FilterRootGroupContext.Provider>
  )
}
