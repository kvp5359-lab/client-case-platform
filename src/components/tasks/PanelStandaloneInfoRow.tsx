"use client"

/**
 * PanelStandaloneInfoRow — верхняя строка боковой панели для standalone-тредов
 * (тред без project_id и без contact_participant_id: личные диалоги TG Business /
 * MTProto / Wazzup личный, или просто внутренний тред без контекста).
 *
 * Показывает имя треда (обычно — имя собеседника) и кнопку «×» для закрытия панели.
 * × живёт здесь, а не во вкладочной строке, чтобы кнопка закрытия была
 * всегда доступна в standalone-режиме (TabBar не рендерится).
 */

import { X, MessageSquare } from 'lucide-react'
import type { TaskItem } from './types'

interface PanelStandaloneInfoRowProps {
  thread: TaskItem
  onHidePanel: () => void
}

export function PanelStandaloneInfoRow({ thread, onHidePanel }: PanelStandaloneInfoRowProps) {
  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b shrink-0 bg-gray-100/60 text-xs">
      <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="font-medium text-sm truncate min-w-0 shrink">{thread.name}</span>

      <div className="flex-1 min-w-0" />

      <button
        type="button"
        onClick={onHidePanel}
        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white border border-gray-200 transition-all duration-150 hover:scale-110 hover:rotate-90 hover:border-gray-300"
        title="Скрыть панель"
        aria-label="Скрыть панель"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
