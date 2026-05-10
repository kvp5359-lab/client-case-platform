"use client"

/**
 * ItemListsPage — обзор всех списков воркспейса (общих + личных).
 *
 * Кнопка «Создать» открывает CreateItemListDialog. После создания —
 * автоматический переход на страницу нового списка.
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, ListChecks, FolderOpen, User, Users, Loader2 } from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDialog } from '@/hooks/shared/useDialog'
import { useItemLists, type ItemList } from '@/hooks/useItemLists'
import { CreateItemListDialog } from '@/components/itemLists/CreateItemListDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function ItemListsPage() {
  usePageTitle('Списки')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const createDialog = useDialog()
  const { data: lists = [], isLoading } = useItemLists(workspaceId)

  useEffect(() => { closePanel() }, [closePanel])

  if (!workspaceId || !user) return null

  const personal = lists.filter((l) => l.owner_user_id === user.id)
  const shared = lists.filter((l) => l.owner_user_id === null)

  const openList = (id: string) => router.push(`/workspaces/${workspaceId}/lists/${id}`)

  return (
    <WorkspaceLayout>
      <div className="flex flex-col h-full bg-gray-100/60">
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between">
          <h1 className="text-lg font-semibold">Списки</h1>
          <Button size="sm" onClick={createDialog.open}>
            <Plus className="h-4 w-4 mr-1.5" />
            Создать список
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаю…
            </div>
          )}

          {!isLoading && lists.length === 0 && (
            <EmptyState onCreate={createDialog.open} />
          )}

          {shared.length > 0 && (
            <Section title="Общие списки воркспейса" icon={<Users className="h-4 w-4" />}>
              {shared.map((l) => (
                <ListCard key={l.id} list={l} onOpen={openList} />
              ))}
            </Section>
          )}

          {personal.length > 0 && (
            <Section title="Мои личные списки" icon={<User className="h-4 w-4" />}>
              {personal.map((l) => (
                <ListCard key={l.id} list={l} onOpen={openList} />
              ))}
            </Section>
          )}
        </div>
      </div>

      <CreateItemListDialog
        open={createDialog.isOpen}
        onClose={createDialog.close}
        workspaceId={workspaceId}
      />
    </WorkspaceLayout>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  )
}

function ListCard({ list, onOpen }: { list: ItemList; onOpen: (id: string) => void }) {
  const Icon = list.entity_type === 'project' ? FolderOpen : ListChecks
  const rulesCount = list.filter_config?.rules?.length ?? 0
  return (
    <Card
      className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onOpen(list.id)}
    >
      <div className="flex items-start gap-3">
        <div
          className="h-9 w-9 rounded-md flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: list.color ?? '#6B7280' }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{list.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {list.entity_type === 'thread' ? 'Треды' : 'Проекты'}
            {rulesCount > 0 && ` · ${rulesCount} ${pluralRules(rulesCount)}`}
          </div>
        </div>
      </div>
    </Card>
  )
}

function pluralRules(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'фильтр'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'фильтра'
  return 'фильтров'
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <ListChecks className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium mb-1">Списков пока нет</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-4">
        Списки удобны для повседневной работы: один фильтр, табличное представление и пакетные действия.
      </p>
      <Button size="sm" onClick={onCreate}>
        <Plus className="h-4 w-4 mr-1.5" />
        Создать первый список
      </Button>
    </div>
  )
}
