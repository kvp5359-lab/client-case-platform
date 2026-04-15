/**
 * Компонент ввода для AI-ассистента проекта.
 * Верхний ряд: скрепка | бейджи документов | чекбоксы источников | кнопка отправки/стоп
 * Ниже: Tiptap-редактор
 */

import { useRef, useCallback, useEffect, useState, type DragEvent } from 'react'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Send, Square, FileText, X, BookOpen, MessageSquare, Check, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { MinimalTiptapEditor } from '@/components/messenger/MinimalTiptapEditor'
import { AttachmentButton } from '@/components/messenger/AttachmentButton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AiSources, ChatScope } from '@/services/api/messenger/messengerAiService'
import type { AttachedDocument } from '@/hooks/messenger/useMessengerAi'

interface ProjectThreadOption {
  id: string
  name: string
  type: 'chat' | 'task'
}

const MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

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
  const [scopeOpen, setScopeOpen] = useState(false)
  const chatScope = sources.chats
  const isAllChats = chatScope.mode === 'all'
  const selectedCount = chatScope.threadIds.length

  const chatScopeLabel = isAllChats
    ? 'Все чаты'
    : selectedCount === 0
      ? 'Выбрать чаты'
      : selectedCount === 1
        ? projectThreads.find((t) => t.id === chatScope.threadIds[0])?.name ?? '1 чат'
        : `${selectedCount} чата`

  const toggleThreadInScope = (threadId: string) => {
    if (isAllChats) {
      setChatScope({ mode: 'selected', threadIds: [threadId] })
      return
    }
    const next = chatScope.threadIds.includes(threadId)
      ? chatScope.threadIds.filter((id) => id !== threadId)
      : [...chatScope.threadIds, threadId]
    setChatScope({ mode: 'selected', threadIds: next })
  }

  const editorRef = useRef<Editor | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleSend = useCallback(() => {
    const text = editorRef.current?.getText().trim() ?? ''
    if ((!text && attachedDocuments.length === 0) || isStreaming) return
    onSend(text)
    editorRef.current?.commands.clearContent()
  }, [isStreaming, onSend, attachedDocuments])

  // Автофокус в редактор при монтировании
  useEffect(() => {
    // Небольшая задержка, чтобы Sheet успел анимироваться
    const timer = setTimeout(() => {
      editorRef.current?.commands.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleFilesSelected = useCallback(
    (fileList: File[] | FileList) => {
      const file = fileList[0]
      if (!file) return

      const isPdf = file.type === 'application/pdf'
      const isImage = file.type.startsWith('image/')

      if (!isPdf && !isImage) {
        toast.error('Поддерживаются только PDF и изображения (JPG, PNG)')
        return
      }

      if (file.size > MAX_CHAT_FILE_SIZE) {
        toast.error('Файл слишком большой. Максимальный размер: 20 МБ')
        return
      }

      addAttachedDocument({
        id: `temp-${Date.now()}`,
        name: file.name,
        isUploadedFile: true,
        file,
      })
    },
    [addAttachedDocument],
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const docId = e.dataTransfer.getData('application/x-document-id')
      if (docId && onDocumentDrop) {
        onDocumentDrop(docId)
        setTimeout(() => editorRef.current?.commands.focus(), 0)
        return
      }
      // Файлы с рабочего стола
      if (e.dataTransfer.files.length > 0) {
        handleFilesSelected(e.dataTransfer.files)
        setTimeout(() => editorRef.current?.commands.focus(), 0)
      }
    },
    [onDocumentDrop, handleFilesSelected],
  )

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-purple-50/80 border-2 border-dashed border-purple-300 rounded-lg z-10 flex items-center justify-center">
          <p className="text-sm text-purple-600 font-medium">Перетащите документ сюда</p>
        </div>
      )}

      {/* Теги источников — над разделительной линией */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-2">
        {hasProject && (
          <>
            {/* Picker скоупа чатов: все / выбрать треды */}
            <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                    isAllChats || selectedCount > 0
                      ? 'bg-blue-100 border-blue-300 text-blue-800'
                      : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                  }`}
                  title="Где искать в переписке"
                >
                  <MessageSquare className="h-3 w-3" />
                  {chatScopeLabel}
                  {(isAllChats || selectedCount > 0) && chatMessagesCount > 0 && (
                    <span className="opacity-70">{chatMessagesCount}</span>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1" align="start" sideOffset={4}>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                  onClick={() => {
                    setChatScope({ mode: 'all', threadIds: [] })
                    setScopeOpen(false)
                  }}
                >
                  <span className="w-4 inline-flex justify-center">
                    {isAllChats && <Check className="h-3.5 w-3.5" />}
                  </span>
                  Все чаты проекта
                </button>
                <div className="border-t my-1" />
                <p className="text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
                  Выбрать треды
                </p>
                <div className="max-h-64 overflow-y-auto">
                  {projectThreads.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-2">Нет тредов в проекте</p>
                  ) : (
                    projectThreads.map((t) => {
                      const checked = !isAllChats && chatScope.threadIds.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                          onClick={() => toggleThreadInScope(t.id)}
                        >
                          <span className="w-4 inline-flex justify-center">
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="truncate">{t.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {t.type === 'task' ? 'задача' : 'чат'}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
                {!isAllChats && selectedCount > 0 && (
                  <>
                    <div className="border-t my-1" />
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                      onClick={() => setChatScope({ mode: 'selected', threadIds: [] })}
                    >
                      Очистить выбор
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>
            {/* Сегментированная группа: Анкеты + Документы */}
            <div className="inline-flex items-center">
              <button
                type="button"
                onClick={() => formKitCount > 0 && toggleSource('formData')}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-l-full border transition-colors ${
                  formKitCount === 0
                    ? 'opacity-40 cursor-default'
                    : sources.formData
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800 cursor-pointer'
                      : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted cursor-pointer'
                }`}
              >
                Анкеты <span className="opacity-70">{formKitCount}</span>
              </button>
              <button
                type="button"
                onClick={() => documentCount > 0 && toggleSource('documents')}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-r-full border border-l-0 transition-colors ${
                  documentCount === 0
                    ? 'opacity-40 cursor-default'
                    : sources.documents
                      ? 'bg-amber-100 border-amber-300 text-amber-800 cursor-pointer'
                      : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted cursor-pointer'
                }`}
              >
                Документы <span className="opacity-70">{documentCount}</span>
              </button>
            </div>
          </>
        )}

        {/* Сегментированный переключатель базы знаний */}
        {(hasKnowledgeProjectAccess || hasKnowledgeAllAccess) && (
          <div
            className={`inline-flex items-center rounded-full border overflow-hidden ${
              sources.knowledge === 'project'
                ? 'border-violet-300'
                : sources.knowledge === 'all'
                  ? 'border-pink-300'
                  : 'border-border'
            }`}
          >
            {hasKnowledgeProjectAccess && (
              <button
                type="button"
                onClick={() => setKnowledge(sources.knowledge === 'project' ? null : 'project')}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 transition-colors cursor-pointer ${
                  sources.knowledge === 'project'
                    ? 'bg-violet-100 text-violet-800'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <BookOpen className="h-3 w-3" />
                БЗ проекта
              </button>
            )}
            {hasKnowledgeAllAccess && (
              <button
                type="button"
                onClick={() => setKnowledge(sources.knowledge === 'all' ? null : 'all')}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 transition-colors cursor-pointer ${
                  hasKnowledgeProjectAccess ? 'border-l border-border' : ''
                } ${
                  sources.knowledge === 'all'
                    ? 'bg-pink-100 text-pink-800'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <BookOpen className="h-3 w-3" />
                Вся база знаний
              </button>
            )}
          </div>
        )}
      </div>

      {/* Под линией: скрепка + файлы / редактор + отправить */}
      <div className="border-t px-2 pt-2 pb-2">
        {/* Ряд: скрепка + (файлы или редактор) + кнопка отправки */}
        <div className="flex items-start gap-1.5">
          {/* Скрепка — всегда слева, выравнивается по первому ряду контента */}
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

          {/* Центральная часть */}
          <div className="flex-1 min-w-0">
            {/* Бейджи прикреплённых файлов (если есть) */}
            {attachedDocuments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mb-1">
                {attachedDocuments.map((doc) => (
                  <Badge
                    key={doc.id}
                    variant="secondary"
                    className="pl-1.5 pr-0.5 py-0 gap-1 text-[11px] h-6 shrink-0 bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[120px]">{doc.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachedDocument(doc.id)}
                      className="ml-0.5 hover:bg-purple-300/50 rounded p-0.5"
                      disabled={isStreaming}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Tiptap-редактор */}
            <MinimalTiptapEditor
              editorRef={editorRef}
              onSend={handleSend}
              placeholder={
                hasProject ? 'Задайте вопрос по проекту...' : 'Задайте вопрос по базе знаний...'
              }
              disabled={isStreaming}
            />
          </div>

          {/* Кнопка отправки / стоп — справа */}
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
