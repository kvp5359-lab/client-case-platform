/**
 * Popover для выбора шаблона треда в ChatSettingsDialog.
 * Показывает список шаблонов workspace, сгруппированных по типу.
 */

import { useState, createElement } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Zap, Search, MessageSquare, CheckSquare, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useThreadTemplatesForProject } from '@/hooks/messenger/useThreadTemplates'
import { projectTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'
import { getChatIconComponent } from './EditChatDialog'
import { COLOR_BG } from './threadConstants'
import type { ThreadTemplate } from '@/types/threadTemplate'

interface ThreadTemplatePickerProps {
  workspaceId: string | undefined
  projectId: string | null | undefined
  onSelect: (template: ThreadTemplate) => void
}

export function ThreadTemplatePicker({
  workspaceId,
  projectId,
  onSelect,
}: ThreadTemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Тип проекта, откуда создаётся тред. Нужен, чтобы показать только
  // шаблоны для этого типа + глобальные.
  const { data: projectTemplateId = null } = useQuery<string | null>({
    queryKey: projectTemplateKeys.idByProject(projectId),
    queryFn: async () => {
      if (!projectId) return null
      const { data, error } = await supabase
        .from('projects')
        .select('template_id')
        .eq('id', projectId)
        .maybeSingle()
      if (error) throw error
      return (data?.template_id as string | null) ?? null
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })

  // Имя типа проекта — берём из кеша projectTemplateKeys.detail, который
  // уже наполнен useProjectTemplate в ProjectPage. Не делаем отдельный
  // запрос, чтобы не конфликтовать с контрактом этого кеша.
  const queryClient = useQueryClient()
  const projectTemplate = projectTemplateId
    ? queryClient.getQueryData<{ name?: string } | null>(
        projectTemplateKeys.detail(projectTemplateId),
      )
    : null
  const projectTemplateName = projectTemplate?.name ?? 'Тип проекта'

  const { data: templates = [] } = useThreadTemplatesForProject(workspaceId, projectTemplateId)

  if (templates.length === 0) return null

  const q = search.toLowerCase()
  const filtered = templates.filter(
    (t) => t.name.toLowerCase().includes(q) || (t.description?.toLowerCase().includes(q) ?? false),
  )

  // Делим на два блока: глобальные workspace и привязанные к типу проекта.
  // Внутри каждого — подгруппы по типу треда (Задачи/Чаты/Email).
  const globals = filtered.filter((t) => t.owner_project_template_id === null)
  const projectScoped = filtered.filter((t) => t.owner_project_template_id !== null)

  const splitByType = (arr: ThreadTemplate[]) => ({
    tasks: arr.filter((t) => t.thread_type === 'task' && !t.is_email),
    chats: arr.filter((t) => t.thread_type === 'chat' && !t.is_email),
    emails: arr.filter((t) => t.is_email),
  })
  const globalGroups = splitByType(globals)
  const projectGroups = splitByType(projectScoped)

  const renderItem = (t: ThreadTemplate) => (
    <button
      key={t.id}
      type="button"
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left text-sm"
      onClick={() => {
        onSelect(t)
        setOpen(false)
        setSearch('')
      }}
    >
      <div
        className={cn(
          'w-5 h-5 rounded flex items-center justify-center flex-shrink-0',
          COLOR_BG[t.accent_color] ?? 'bg-blue-500',
        )}
      >
        {createElement(getChatIconComponent(t.icon), {
          className: 'w-3 h-3 text-white',
        })}
      </div>
      <span className="truncate">{t.name}</span>
    </button>
  )

  const renderGroup = (label: string, icon: typeof MessageSquare, items: ThreadTemplate[]) => {
    if (items.length === 0) return null
    return (
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
          {createElement(icon, { className: 'w-3 h-3' })}
          {label}
        </p>
        {items.map(renderItem)}
      </div>
    )
  }

  const renderSection = (
    title: string,
    groups: { tasks: ThreadTemplate[]; chats: ThreadTemplate[]; emails: ThreadTemplate[] },
  ) => {
    const total = groups.tasks.length + groups.chats.length + groups.emails.length
    if (total === 0) return null
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase text-foreground/80 px-2 pt-2 pb-1 border-b border-border/60 mb-1">
          {title}
        </p>
        {renderGroup('Задачи', CheckSquare, groups.tasks)}
        {renderGroup('Чаты', MessageSquare, groups.chats)}
        {renderGroup('Email', Mail, groups.emails)}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground/50 hover:text-muted-foreground h-7 text-xs px-2"
        >
          <Zap className="w-3.5 h-3.5" />
          Шаблон
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="end">
        {templates.length > 5 && (
          <div className="flex items-center gap-1 mb-2 px-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 p-0"
            />
          </div>
        )}
        <div
          className="max-h-[28rem] overflow-y-auto space-y-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {renderSection('Общие', globalGroups)}
          {renderSection(projectTemplateName, projectGroups)}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Ничего не найдено</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
