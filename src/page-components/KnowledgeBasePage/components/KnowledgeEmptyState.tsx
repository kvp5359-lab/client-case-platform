import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, FolderPlus, BookOpen } from 'lucide-react'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function KnowledgeEmptyState({ page }: { page: PageReturn }) {
  return (
    <Card className="p-12">
      <div className="text-center">
        <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Нет статей</h3>
        <p className="text-muted-foreground mb-4">
          Создайте первую группу или статью для базы знаний
        </p>
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              page.setAddingGroupParentId('root')
              page.setNewGroupName('')
            }}
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Создать группу
          </Button>
          <Button onClick={() => page.createArticleMutation.mutate(undefined)}>
            <Plus className="w-4 h-4 mr-2" />
            Создать статью
          </Button>
        </div>
      </div>
    </Card>
  )
}
