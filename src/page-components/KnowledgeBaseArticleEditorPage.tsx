/**
 * KnowledgeBaseArticleEditorPage — редактор статьи базы знаний
 *
 * - Название и настройки сохраняются по кнопке «Сохранить»
 * - Контент автосохраняется через debounce (1.5 с)
 * - Группы обновляются мгновенно (delete all + insert)
 */

import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TiptapEditor } from '@/components/tiptap-editor'
import { ArrowLeft, Save, Loader2, History } from 'lucide-react'
import { ArticleVersionHistoryDialog } from '@/components/knowledge'
import { useArticleEditor } from './KnowledgeBasePage/useArticleEditor'
import { ArticleMetadataSection } from './KnowledgeBasePage/components/ArticleMetadataSection'

export default function KnowledgeBaseArticleEditorPage() {
  const editor = useArticleEditor()

  return (
    <WorkspaceLayout>
      <div className="flex-1 flex flex-col overflow-hidden px-8 pt-4 pb-0">
        <div className="max-w-5xl mx-auto w-full space-y-3 flex flex-col flex-1 min-h-0">
          {editor.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
          ) : !editor.articleQuery.data ? (
            <div className="text-center py-12 text-muted-foreground">Статья не найдена</div>
          ) : (
            <>
              {/* Article settings */}
              <div className="space-y-3">
                {/* Row 1: back + title + autosave + buttons */}
                <div className="flex items-center gap-2 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={editor.handleBack}
                    className="shrink-0 h-9 w-9 absolute -left-11"
                    title="Назад к базе знаний"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <Input
                    id="article-title"
                    value={editor.title}
                    onChange={(e) => editor.setTitle(e.target.value)}
                    placeholder="Название статьи..."
                    className="flex-1 min-w-[200px] font-medium text-lg md:text-lg h-11"
                  />
                  <Select
                    value={editor.accessMode}
                    onValueChange={(v) => editor.setAccessMode(v as 'read_only' | 'read_copy')}
                  >
                    <SelectTrigger className="w-[180px] h-11 text-sm shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read_only">Только чтение</SelectItem>
                      <SelectItem value="read_copy">Чтение + копирование</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center shrink-0">
                    <Button
                      onClick={editor.handleSaveSettings}
                      disabled={editor.updateArticleMutation.isPending || !editor.title.trim()}
                      className="rounded-r-none h-11"
                    >
                      {editor.updateArticleMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Сохранить
                    </Button>
                    <Button
                      onClick={() => editor.setIsVersionDialogOpen(true)}
                      className="rounded-l-none border-l-0 h-11"
                      title="Версии"
                    >
                      <History className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Row 2: groups+tags + AI summary left, access+status right */}
                <ArticleMetadataSection editor={editor} />
              </div>

              {/* Content editor — монтируется только когда контент загружен, чтобы избежать двойного рендера */}
              {editor.isContentReady && (
                <TiptapEditor
                  content={editor.content}
                  onChange={editor.handleContentChange}
                  placeholder="Начните писать содержание статьи..."
                  className="flex-1 min-h-0"
                  imageUpload={
                    editor.workspaceId && editor.articleId
                      ? { workspaceId: editor.workspaceId, articleId: editor.articleId }
                      : undefined
                  }
                />
              )}
            </>
          )}
        </div>
      </div>

      {editor.articleId && (
        <ArticleVersionHistoryDialog
          open={editor.isVersionDialogOpen}
          onOpenChange={editor.setIsVersionDialogOpen}
          articleId={editor.articleId}
          onRestore={editor.handleRestoreVersion}
          isRestoring={editor.isRestoring}
        />
      )}
    </WorkspaceLayout>
  )
}
