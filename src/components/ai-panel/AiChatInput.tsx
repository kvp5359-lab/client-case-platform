/**
 * Компонент ввода для AI-ассистента проекта.
 * Верхний ряд: скрепка | бейджи документов | чекбоксы источников | кнопка отправки/стоп
 * Ниже: Tiptap-редактор
 */

import { useRef, useCallback, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Send, Square } from 'lucide-react'
import { MinimalTiptapEditor } from '@/components/messenger/MinimalTiptapEditor'
import { AttachmentButton } from '@/components/messenger/AttachmentButton'
import type { AiSources, ChatScope } from '@/services/api/messenger/messengerAiService'
import type { AttachedDocument } from '@/hooks/messenger/useMessengerAi'
import { useChatFileDrop } from './hooks/useChatFileDrop'
import { ChatScopePicker, type ProjectThreadOption } from './components/ChatScopePicker'
import { SourceToggles } from './components/SourceToggles'
import { AttachedDocumentsBadges } from './components/AttachedDocumentsBadges'

interface AiChatInputProps {
  sources: AiSources
  toggleSource: (key: 'formData' | 'documents') => void
  setKnowledge: (value: 'project' | 'all' | null) => void
  setChatScope: (scope: ChatScope) => void
  /** Список тредов проекта для picker-а скоупа чатов. */
  projectThreads: ProjectThreadOption[]
  /** Сколько сообщений сейчас в активном скоупе (для подписи на чипе). */
  chatMessagesCount: number
  formKitCount: number
  documentCount: number
  isStreaming: boolean
  attachedDocuments: AttachedDocument[]
  addAttachedDocument: (doc: AttachedDocument) => void
  removeAttachedDocument: (id: string) => void
  projectDocumentsCount: number
  onSend: (text: string) => void
  onStop: () => void
  onOpenDocPicker: () => void
  /** Обработчик drop документа из панели документов */
  onDocumentDrop?: (documentId: string) => void
  /** Доступ к БЗ проекта */
  hasKnowledgeProjectAccess?: boolean
  /** Доступ ко всей БЗ */
  hasKnowledgeAllAccess?: boolean
  /** Есть ли контекст проекта */
  hasProject?: boolean
}

export function AiChatInput({
  sources,
  toggleSource,
  setKnowledge,
  setChatScope,
  projectThreads,
  chatMessagesCount,
  formKitCount,
  documentCount,
  isStreaming,
  attachedDocuments,
  addAttachedDocument,
  removeAttachedDocument,
  projectDocumentsCount,
  onSend,
  onStop,
  onOpenDocPicker,
  onDocumentDrop,
  hasKnowledgeProjectAccess,
  hasKnowledgeAllAccess,
  hasProject = true,
}: AiChatInputProps) {
  const editorRef = useRef<Editor | null>(null)

  const {
    isDragging,
    handleFilesSelected,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useChatFileDrop({
    addAttachedDocument,
    onDocumentDrop,
    onAfterDrop: () => setTimeout(() => editorRef.current?.commands.focus(), 0),
  })

  const handleSend = useCallback(() => {
    const text = editorRef.current?.getText().trim() ?? ''
    if ((!text && attachedDocuments.length === 0) || isStreaming) return
    onSend(text)
    editorRef.current?.commands.clearContent()
  }, [isStreaming, onSend, attachedDocuments])

  // Автофокус в редактор при монтировании (задержка — чтобы Sheet успел анимироваться)
  useEffect(() => {
    const timer = setTimeout(() => {
      editorRef.current?.commands.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-purple-50/80 border-2 border-dashed border-purple-300 rounded-lg z-10 flex items-center justify-center">
          <p className="text-sm text-purple-600 font-medium">Перетащите документ сюда</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-2">
        {hasProject && (
          <ChatScopePicker
            chatScope={sources.chats}
            projectThreads={projectThreads}
            chatMessagesCount={chatMessagesCount}
            setChatScope={setChatScope}
          />
        )}
        <SourceToggles
          sources={sources}
          toggleSource={toggleSource}
          setKnowledge={setKnowledge}
          formKitCount={formKitCount}
          documentCount={documentCount}
          hasProject={hasProject}
          hasKnowledgeProjectAccess={hasKnowledgeProjectAccess}
          hasKnowledgeAllAccess={hasKnowledgeAllAccess}
        />
      </div>

      <div className="border-t px-2 pt-2 pb-2">
        <div className="flex items-start gap-1.5">
          <div className={attachedDocuments.length > 0 ? '' : 'mt-1.5'}>
            <AttachmentButton
              onFilesSelected={handleFilesSelected}
              onOpenDocPicker={onOpenDocPicker}
              projectDocumentsCount={projectDocumentsCount}
              disabled={isStreaming}
              accept=".pdf,image/*"
              buttonClassName="h-6 w-6"
              iconClassName="h-3.5 w-3.5"
            />
          </div>

          <div className="flex-1 min-w-0">
            <AttachedDocumentsBadges
              attachedDocuments={attachedDocuments}
              removeAttachedDocument={removeAttachedDocument}
              disabled={isStreaming}
            />
            <MinimalTiptapEditor
              editorRef={editorRef}
              onSend={handleSend}
              placeholder={
                hasProject ? 'Задайте вопрос по проекту...' : 'Задайте вопрос по базе знаний...'
              }
              disabled={isStreaming}
            />
          </div>

          {isStreaming ? (
            <Button
              onClick={onStop}
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0 mt-0.5"
              title="Остановить"
              aria-label="Остановить генерацию"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              size="icon"
              className="h-8 w-8 shrink-0 mt-0.5 bg-purple-600 hover:bg-purple-700 text-white"
              aria-label="Отправить вопрос"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
