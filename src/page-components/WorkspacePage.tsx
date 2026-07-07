"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FolderPlus, Inbox, Plug, Users, LayoutList, BookOpen } from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useClientWorkspaceProjects } from '@/hooks/useClientWorkspaceProjects'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

type Step = {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

const ONBOARDING_STEPS: Step[] = [
  { href: 'projects', icon: FolderPlus, title: 'Создайте проект', description: 'Заведите первое дело клиента — задачи, документы и переписка внутри.' },
  { href: 'settings/integrations', icon: Plug, title: 'Подключите каналы', description: 'Telegram, WhatsApp и почта — общение с клиентами прямо в сервисе.' },
  { href: 'settings/participants', icon: Users, title: 'Пригласите команду', description: 'Добавьте сотрудников и настройте, кто что видит.' },
  { href: 'inbox', icon: Inbox, title: 'Входящие', description: 'Все сообщения клиентов в одном месте — ничего не потеряется.' },
  { href: 'boards', icon: LayoutList, title: 'Доски и списки', description: 'Свой вид на задачи: канбан, таблица, календарь.' },
  { href: 'knowledge-base', icon: BookOpen, title: 'База знаний', description: 'Шаблоны ответов и статьи для команды и клиентов.' },
]

export function WorkspacePage() {
  const { workspace, isLoading, error } = useWorkspaceContext()
  usePageTitle(workspace?.name)

  const router = useRouter()
  const { isClientOnly, isLoading: permsLoading } = useWorkspacePermissions({
    workspaceId: workspace?.id ?? '',
  })
  const { data: clientProjects = [], isLoading: projectsLoading } = useClientWorkspaceProjects(
    isClientOnly ? workspace?.id : undefined,
  )

  useEffect(() => {
    if (!workspace || permsLoading || !isClientOnly || projectsLoading) return
    if (clientProjects.length > 0) {
      router.replace(`/workspaces/${workspace.id}/projects/${clientProjects[0].id}`)
    }
  }, [workspace, permsLoading, isClientOnly, projectsLoading, clientProjects, router])

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-6 md:p-8 overflow-auto">
        {isLoading ? (
          <p className="text-gray-500 text-lg">Загрузка...</p>
        ) : error ? (
          <p className="text-red-500 text-lg">{getUserFacingErrorMessage(error, 'Не удалось загрузить рабочее пространство')}</p>
        ) : workspace ? (
          isClientOnly ? (
            <p className="text-gray-500 text-lg">Загрузка...</p>
          ) : (
            <div className="max-w-4xl">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">{workspace.name}</h1>
              <p className="text-gray-600 mb-8">С чего начать — выберите шаг ниже.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ONBOARDING_STEPS.map((step) => {
                  const Icon = step.icon
                  return (
                    <Link
                      key={step.href}
                      href={`/workspaces/${workspace.id}/${step.href}`}
                      className="group flex flex-col rounded-lg border bg-card p-5 transition-colors hover:border-blue-400 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      <Icon className="h-6 w-6 text-blue-600 mb-3" />
                      <span className="font-semibold text-gray-900 mb-1">{step.title}</span>
                      <span className="text-sm text-gray-600">{step.description}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        ) : (
          <p className="text-gray-500 text-lg">Рабочее пространство не найдено</p>
        )}
      </main>
    </WorkspaceLayout>
  )
}
