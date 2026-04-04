import { useDroppable } from '@dnd-kit/core'
import { UNGROUPED_ID } from '../useKnowledgeTreeDnd'

interface UngroupedDropZoneProps {
  children: React.ReactNode
  isOver: boolean
}

export function UngroupedDropZone({ children, isOver }: UngroupedDropZoneProps) {
  const { setNodeRef } = useDroppable({ id: UNGROUPED_ID })
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors rounded-sm ${isOver ? 'bg-blue-50/40 ring-1 ring-blue-300' : ''}`}
    >
      {children}
    </div>
  )
}
