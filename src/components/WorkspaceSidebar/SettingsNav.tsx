"use client"

/**
 * SettingsNav — вертикальное меню разделов настроек. Рендерится ВНУТРИ
 * WorkspaceSidebarFull (в режиме настроек), на месте поиска/проектов, в том же
 * стиле сайдбара (#f7f7f7). Пункты ведут на существующие роуты /settings/<tab>.
 * Гейтинг прав 1:1 с WorkspaceSettingsPage.
 */

import { useParams, useRouter, usePathname } from 'next/navigation'
import {
  ArrowLeft,
  Settings,
  Palette,
  Users,
  Lock,
  LayoutDashboard,
  Globe,
  BookOpen,
  LayoutTemplate,
  Plug,
  BookText,
  Trash2,
  SendHorizonal,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspacePermissions } from '@/hooks/permissions'

type Item = { key: string; label: string; icon: LucideIcon; show: boolean }
type Group = { title: string; items: Item[] }

export function SettingsNav({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })

  const canSettings = permissions.isOwner || permissions.can('manage_workspace_settings')
  const canParticipants = permissions.isOwner || permissions.can('manage_participants')
  const canRoles = permissions.isOwner || permissions.can('manage_roles')
  const canTemplates = permissions.isOwner || permissions.can('manage_templates')
  const isOwner = permissions.isOwner

  const groups: Group[] = [
    {
      title: 'Пространство',
      items: [
        { key: 'general', label: 'Общие', icon: Settings, show: canSettings },
        { key: 'palette', label: 'Палитра цветов', icon: Palette, show: canSettings },
        { key: 'participants', label: 'Участники', icon: Users, show: canParticipants },
        { key: 'permissions', label: 'Права доступа', icon: Lock, show: canRoles },
        { key: 'sidebar', label: 'Сайдбар', icon: LayoutDashboard, show: isOwner },
        { key: 'domain', label: 'Домен', icon: Globe, show: isOwner },
      ],
    },
    {
      title: 'Контент',
      items: [
        { key: 'directories', label: 'Справочники', icon: BookOpen, show: true },
        { key: 'templates', label: 'Шаблоны', icon: LayoutTemplate, show: canTemplates },
      ],
    },
    {
      title: 'Каналы',
      items: [{ key: 'integrations', label: 'Интеграции', icon: Plug, show: isOwner }],
    },
    {
      title: 'Прочее',
      items: [
        { key: 'digest', label: 'Дневник проекта', icon: BookText, show: isOwner },
        { key: 'trash', label: 'Корзина', icon: Trash2, show: canSettings },
        { key: 'send-failures', label: 'Не отправленные', icon: SendHorizonal, show: canSettings },
      ],
    },
  ]

  const activeKey = (() => {
    for (const part of [
      'palette',
      'participants',
      'permissions',
      'directories',
      'templates',
      'integrations',
      'digest',
      'sidebar',
      'domain',
      'send-failures',
      'trash',
    ]) {
      if (pathname.includes(`/${part}`)) return part
    }
    return 'general'
  })()

  const go = (key: string) => {
    router.push(`/workspaces/${workspaceId}/settings/${key}`)
    onNavigate?.()
  }

  const itemClass = (active: boolean) =>
    cn(
      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors w-full',
      active
        ? 'bg-black/[0.06] text-foreground font-medium'
        : 'text-muted-foreground hover:bg-black/[0.04] hover:text-foreground',
    )

  return (
    <div className="flex flex-col gap-3 pb-2">
      <button
        type="button"
        onClick={() => {
          router.push(`/workspaces/${workspaceId}`)
          onNavigate?.()
        }}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-black/[0.04] hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span className="truncate">Назад в пространство</span>
      </button>

      {groups.map((group) => {
        const visible = group.items.filter((i) => i.show)
        if (visible.length === 0) return null
        return (
          <div key={group.title} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {group.title}
            </div>
            {visible.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => go(item.key)}
                className={itemClass(activeKey === item.key)}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
