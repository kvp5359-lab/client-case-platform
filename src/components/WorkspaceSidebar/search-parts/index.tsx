"use client"

/**
 * Вспомогательные компоненты для SidebarGlobalSearch:
 * SearchInputInline, SectionHeader, EntityIcon, ENTITY_GROUP_LABEL.
 */

import { createElement } from 'react'
import {
  Search,
  BookOpen,
  Mail,
  MessageSquare,
  ListChecks,
  User,
  Quote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getProjectIcon } from '@/components/common/project-icons'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { GlobalSearchEntityType } from '@/hooks/useGlobalSearch'

export function SearchInputInline({
  value,
  onChange,
  inputRef,
  onSubmit,
}: {
  value: string
  onChange: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onSubmit?: () => void
}) {
  return (
    <div className="relative p-2">
      <Search
        size={14}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder="Поиск"
        autoFocus
        className="w-full h-8 pl-7 pr-2 text-sm bg-gray-50 border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </div>
  )
}

export function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
      {icon}
      <span>{label}</span>
    </div>
  )
}

type ProjectIconResolver = (
  templateId: string | null,
  statusId: string | null,
) => {
  iconId: string | null
  iconColor: string
}

export function EntityIcon({
  type,
  threadType,
  accentColor,
  projectTemplateId,
  projectStatusId,
  resolveProjectIcon,
  muted = false,
}: {
  type: GlobalSearchEntityType
  threadType: string | null
  accentColor: string | null
  projectTemplateId: string | null
  projectStatusId: string | null
  resolveProjectIcon: ProjectIconResolver
  muted?: boolean
}) {
  const size = 14

  // Проект — иконка/цвет как в сайдбаре (template.icon + status/fixed color).
  if (type === 'project' && !muted) {
    const { iconId, iconColor } = resolveProjectIcon(projectTemplateId, projectStatusId)
    return createElement(getProjectIcon(iconId), {
      size,
      className: 'shrink-0',
      style: { color: safeCssColor(iconColor || '#6B7280') },
    })
  }

  // accent_color у тредов — семантический ключ Tailwind-палитры
  // ('slate', 'violet', 'rose' …), не CSS-цвет. Резолвим через COLOR_TEXT.
  const useAccent = !muted && accentColor && (type === 'thread' || type === 'message')
  const accentClass = useAccent ? COLOR_TEXT[accentColor! as ThreadAccentColor] ?? 'text-gray-500' : null
  const cls = cn(
    'shrink-0',
    accentClass ?? (muted ? 'text-gray-400' : 'text-gray-500'),
  )

  if (type === 'thread' || type === 'message') {
    if (threadType === 'task') return <ListChecks size={size} className={cls} />
    if (threadType === 'email') return <Mail size={size} className={cls} />
    return <MessageSquare size={size} className={cls} />
  }
  if (type === 'project') {
    // muted (для шапки секции «Проекты») — без template, ставим базовую папку с серым.
    return createElement(getProjectIcon(null), { size, className: cls })
  }
  if (type === 'knowledge_article') return <BookOpen size={size} className={cls} />
  if (type === 'participant') return <User size={size} className={cls} />
  return <Quote size={size} className={cls} />
}

export const ENTITY_GROUP_LABEL: Record<GlobalSearchEntityType, string> = {
  thread: 'Треды',
  project: 'Проекты',
  knowledge_article: 'База знаний',
  participant: 'Контакты',
  message: 'Сообщения',
}
