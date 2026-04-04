"use client"

/**
 * KnowledgeBasePage — единая страница базы знаний
 *
 * Три вкладки: Таблица / Дерево / Q&A.
 */

import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BookOpen, MessageCircleQuestion, TableProperties, TreePine } from 'lucide-react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useKnowledgeBasePage } from './KnowledgeBasePage/useKnowledgeBasePage'
import { KnowledgeTreeView } from './KnowledgeBasePage/KnowledgeTreeView'
import { KnowledgeTableView } from './KnowledgeBasePage/KnowledgeTableView'
import { KnowledgeQAView } from './KnowledgeBasePage/KnowledgeQAView'

export default function KnowledgeBasePage() {
  const page = useKnowledgeBasePage()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === 'qa' ? 'qa' : tabParam === 'table' ? 'table' : 'tree'

  const handleTabChange = (value: string) => {
    router.replace(value === 'tree' ? pathname : `${pathname}?tab=${value}`)
  }

  if (!page.workspaceId) {
    return (
      <WorkspaceLayout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Рабочее пространство не выбрано</p>
        </div>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-primary" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold">База знаний</h1>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="tree">
                <TreePine className="w-4 h-4 mr-1.5" />
                Дерево
              </TabsTrigger>
              <TabsTrigger value="table">
                <TableProperties className="w-4 h-4 mr-1.5" />
                Таблица
              </TabsTrigger>
              <TabsTrigger value="qa">
                <MessageCircleQuestion className="w-4 h-4 mr-1.5" />
                Q&A
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tree" className="mt-4">
              <KnowledgeTreeView page={page} />
            </TabsContent>

            <TabsContent value="table" className="mt-4">
              <KnowledgeTableView page={page} />
            </TabsContent>

            <TabsContent value="qa" className="mt-4">
              <KnowledgeQAView workspaceId={page.workspaceId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <ConfirmDialog {...page.confirmDialogProps} />
    </WorkspaceLayout>
  )
}
