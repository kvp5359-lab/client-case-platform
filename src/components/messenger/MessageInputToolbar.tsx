import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Send, Save, Type, ChevronDown } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import type { MessengerAccent } from './MessageBubble'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'
import { MessengerToolbar } from './MinimalTiptapEditor'
import { AttachmentButton } from './AttachmentButton'
import { QuickReplyPicker } from './QuickReplyPicker'
import { TranslateActionButton } from './TranslateActionButton'
import { ScheduleSendButton } from './ScheduleSendButton'
import { TaskStatusPicker } from './TaskStatusPicker'
import type { TaskStatus } from '@/hooks/useStatuses'

export const sendButtonStyles: Record<MessengerAccent, string> = {
  ...(Object.fromEntries(
    ACCENT_SLUGS.map((s) => [s, `${acc.bgMain(s)} ${acc.textOn(s)} hover:opacity-90`]),
  ) as Record<MessengerAccent, string>),
  // Legacy
  dark: 'bg-stone-600 hover:bg-stone-700 text-white',
}

type MessageInputToolbarProps = {
  editor: Editor | null
  projectId: string
  workspaceId: string
  totalFiles: number
  hasContent: boolean
  isPending: boolean
  isSavingDraft?: boolean
  showSaveDraft: boolean
  openQuickReplyPicker: boolean
  accent: MessengerAccent
  onFilesSelected: (files: File[]) => void
  onOpenDocPicker?: () => void
  projectDocumentsCount: number
  onQuickReplyPickerHandled: () => void
  onSend: () => void
  onSaveDraft: () => void
  /** Цвет кнопки отправки (под выбранный режим). По умолчанию — акцент треда. */
  sendButtonClassName?: string
  /** Если задан — отправка заблокирована, текст показывается тултипом
   *  (напр. у email-черновика без темы/получателя). */
  sendBlockedReason?: string | null
  /** Pending-пикер статуса задачи справа от форматирования (task-треды). */
  taskStatusPicker?: {
    statuses: TaskStatus[]
    currentStatusId: string | null
    pendingStatusId: string | null
    onPick: (statusId: string | null) => void
  }
  /** Если задан — рендерим кнопку «Отправить позже». */
  onSchedule?: (sendAt: Date) => void
  /** Если задан — рендерим иконку «Перевести» в тулбаре. */
  translate?: {
    threadId?: string
    getCurrentContent: () => string
    onTranslated: (input: {
      originalContent: string
      translatedContent: string
      targetLanguage: string
      sourceLanguage: string | null
    }) => void
  }
}

export function MessageInputToolbar({
  editor,
  projectId,
  workspaceId,
  totalFiles,
  hasContent,
  isPending,
  isSavingDraft,
  showSaveDraft,
  openQuickReplyPicker,
  accent,
  onFilesSelected,
  onOpenDocPicker,
  projectDocumentsCount,
  onQuickReplyPickerHandled,
  onSend,
  onSaveDraft,
  sendButtonClassName,
  sendBlockedReason,
  taskStatusPicker,
  translate,
  onSchedule,
}: MessageInputToolbarProps) {
  const sendBlocked = !!sendBlockedReason
  return (
    <div className="flex items-center pb-2 pt-0">
      {/* Left: attach + separator + quick reply + separator + formatting toolbar.
          ⚠️ НЕ оборачивать в overflow-x-auto/mask: CSS overflow-x:auto делает
          overflow-y:auto, что обрезает инлайновые всплывашки вверх
          (QuickReplyPicker `absolute bottom-full` и др. — они не в портале).
          Регрессия 2026-06-25: список быстрых ответов переставал показываться
          (видна только тень). Для «кнопки не влезают» нужен другой подход
          (портал-меню «⋯»), не клиппинг-контейнер. */}
      <div className="composer-tools-cq flex items-center gap-0 px-1.5 flex-1 min-w-0">
        <AttachmentButton
          onFilesSelected={onFilesSelected}
          onOpenDocPicker={onOpenDocPicker}
          projectDocumentsCount={projectDocumentsCount}
          disabled={isPending}
          multiple
          buttonClassName="h-8 w-8 text-muted-foreground hover:text-foreground"
          iconClassName="h-4 w-4"
          badge={totalFiles}
        />
        <div className="w-px h-5 bg-border/60 mx-0 shrink-0" />
        {editor && (
          <QuickReplyPicker
            editor={editor}
            projectId={projectId}
            workspaceId={workspaceId}
            externalOpen={openQuickReplyPicker}
            onExternalOpenHandled={onQuickReplyPickerHandled}
          />
        )}
        {editor && <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />}
        {/* Панель форматирования inline. Кнопки прячутся ПО ОДНОЙ по мере
            нехватки ширины ряда (container query в globals.css, не md:-вьюпорт —
            работает и в узкой десктоп-панели). Непоместившиеся доступны в кнопке
            «Aa» (всплывающая панель-портал, не клиппит). MessengerToolbar
            stateless → две копии безопасны. */}
        {editor && (
          <div className="composer-fmt-inline flex items-center shrink-0">
            <MessengerToolbar editor={editor} />
          </div>
        )}
        {editor && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Форматирование"
                aria-label="Форматирование"
                className="composer-fmt-toggle shrink-0 h-8 px-1.5 gap-0.5 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Type className="h-4 w-4" />
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={6} className="w-auto p-1">
              <MessengerToolbar editor={editor} />
            </PopoverContent>
          </Popover>
        )}
        {translate && (
          <>
            <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />
            <TranslateActionButton
              workspaceId={workspaceId}
              threadId={translate.threadId}
              getCurrentContent={translate.getCurrentContent}
              onTranslated={translate.onTranslated}
              disabled={isPending}
            />
          </>
        )}
        {taskStatusPicker && (
          // Кнопка статуса задачи — прячется при нехватке ширины ряда (container
          // query), не только на мобиле. Статус доступен в шапке/меню «⋮».
          <div className="composer-status-hide flex items-center ml-2 shrink-0">
            <TaskStatusPicker
              statuses={taskStatusPicker.statuses}
              currentStatusId={taskStatusPicker.currentStatusId}
              pendingStatusId={taskStatusPicker.pendingStatusId}
              onPick={taskStatusPicker.onPick}
              disabled={isPending}
            />
          </div>
        )}
      </div>
      {/* Right: save + send */}
      <div className="flex items-center gap-1 pr-1.5">
        {showSaveDraft && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={!hasContent || isPending || isSavingDraft}
            onClick={onSaveDraft}
            title="Сохранить черновик"
            aria-label="Сохранить черновик"
          >
            <Save className="h-4 w-4" />
          </Button>
        )}
        {onSchedule && (
          <ScheduleSendButton
            disabled={!hasContent || isPending || sendBlocked}
            onSchedule={onSchedule}
          />
        )}
        {/* span-обёртка с title: у disabled-кнопки нативный тултип не всплывает */}
        <span title={sendBlockedReason ?? undefined} className="inline-flex">
          <Button
            size="icon"
            className={cn('h-8 w-8', sendButtonClassName ?? sendButtonStyles[accent] ?? sendButtonStyles.blue)}
            disabled={!hasContent || isPending || sendBlocked}
            onClick={onSend}
            aria-label="Отправить"
          >
            <Send className="h-4 w-4" />
          </Button>
        </span>
      </div>
    </div>
  )
}
