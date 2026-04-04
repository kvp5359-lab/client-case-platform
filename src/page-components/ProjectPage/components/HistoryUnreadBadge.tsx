/**
 * Бейдж непрочитанных записей истории для вкладки проекта.
 */

import { useHistoryUnreadCount } from '@/hooks/useProjectHistory'

export function HistoryUnreadBadge({ projectId }: { projectId: string }) {
  const { data: count } = useHistoryUnreadCount(projectId)
  if (!count || count === 0) return null
  return (
    <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-medium inline-flex items-center justify-center leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}
