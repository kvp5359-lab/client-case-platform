"use client"

/**
 * Фильтры timeline — чекбоксы для ресурсов и чатов
 */

import { useMemo } from 'react'
import {
  MessageSquare,
  FileText,
  Folder,
  FolderOpen,
  Users,
  CheckSquare,
  ClipboardEdit,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { TimelineFilterState } from '@/types/history'
import { RESOURCE_TYPE_OPTIONS } from './ActivityItem'

const RESOURCE_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  document_kit: FolderOpen,
  folder: Folder,
  project_participant: Users,
  task: CheckSquare,
  form_kit: ClipboardEdit,
}

interface TimelineFiltersProps {
  state: TimelineFilterState
  onChange: (state: TimelineFilterState) => void
  threads: ProjectThread[]
}

export function TimelineFilters({ state, onChange, threads }: TimelineFiltersProps) {
  const visibleThreads = useMemo(() => threads.filter((t) => !t.is_deleted), [threads])

  // Pre-resolve icons outside of render loop
  const threadIcons = useMemo(
    () => new Map(visibleThreads.map((t) => [t.id, getChatIconComponent(t.icon)])),
    [visibleThreads],
  )

  const totalEnabled = state.auditResourceTypes.size + state.threadIds.size
  const totalPossible = RESOURCE_TYPE_OPTIONS.length + visibleThreads.length

  const toggleAuditResource = (value: string) => {
    const next = new Set(state.auditResourceTypes)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange({ ...state, auditResourceTypes: next })
  }

  const toggleThread = (threadId: string) => {
    const next = new Set(state.threadIds)
    if (next.has(threadId)) next.delete(threadId)
    else next.add(threadId)
    onChange({ ...state, threadIds: next })
  }

  const toggleAll = () => {
    if (totalEnabled === totalPossible) {
      // Выключить всё → оставить только аудит
      onChange({
        auditResourceTypes: new Set(RESOURCE_TYPE_OPTIONS.map((o) => o.value)),
        threadIds: new Set(),
      })
    } else {
      // Включить всё
      onChange({
        auditResourceTypes: new Set(RESOURCE_TYPE_OPTIONS.map((o) => o.value)),
        threadIds: new Set(visibleThreads.map((t) => t.id)),
      })
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Filter className="w-3.5 h-3.5" />
          Фильтры
          {totalEnabled < totalPossible && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
              {totalEnabled}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        {/* Выбрать всё */}
        <button
          type="button"
          onClick={toggleAll}
          className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 border-b"
        >
          {totalEnabled === totalPossible ? 'Снять всё' : 'Выбрать всё'}
        </button>

        {/* Ресурсы аудита */}
        <div className="px-3 py-2 border-b">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Ресурсы
          </p>
          <div className="space-y-1">
            {RESOURCE_TYPE_OPTIONS.map((opt) => {
              const Icon = RESOURCE_ICONS[opt.value] ?? FileText
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                >
                  <Checkbox
                    checked={state.auditResourceTypes.has(opt.value)}
                    onCheckedChange={() => toggleAuditResource(opt.value)}
                    className="h-3.5 w-3.5"
                  />
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs">{opt.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Чаты / треды */}
        {visibleThreads.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Переписка
            </p>
            <div className="space-y-1">
              {visibleThreads.map((thread) => {
                const ThreadIcon = threadIcons.get(thread.id) ?? MessageSquare
                return (
                  <label
                    key={thread.id}
                    className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                  >
                    <Checkbox
                      checked={state.threadIds.has(thread.id)}
                      onCheckedChange={() => toggleThread(thread.id)}
                      className="h-3.5 w-3.5"
                    />
                    <ThreadIcon
                      className={cn('w-3.5 h-3.5', getThreadColor(thread.accent_color))}
                    />
                    <span className="text-xs truncate">{thread.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function getThreadColor(accent: string): string {
  const map: Record<string, string> = {
    blue: 'text-blue-500',
    slate: 'text-stone-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-500',
    rose: 'text-red-500',
    violet: 'text-violet-600',
    orange: 'text-orange-500',
    cyan: 'text-cyan-600',
    pink: 'text-pink-500',
    indigo: 'text-indigo-600',
  }
  return map[accent] ?? 'text-muted-foreground'
}
