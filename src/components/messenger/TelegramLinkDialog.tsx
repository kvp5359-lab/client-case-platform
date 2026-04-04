import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, Unlink, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface TelegramLinkDialogProps {
  open: boolean
  onClose: () => void
  isLinked: boolean
  chatTitle: string | null
  linkCode: string | null
  isLoadingCode: boolean
  onUnlink: () => void
  isUnlinking: boolean
  channel?: 'client' | 'internal'
}

export function TelegramLinkDialog({
  open,
  onClose,
  isLinked,
  chatTitle,
  linkCode,
  isLoadingCode,
  onUnlink,
  isUnlinking,
  channel = 'client',
}: TelegramLinkDialogProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linkCommand = channel === 'internal' ? `/link ${linkCode} internal` : `/link ${linkCode}`

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    },
    [],
  )

  const handleCopy = async () => {
    if (!linkCode) return
    try {
      await navigator.clipboard.writeText(linkCommand)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API может быть недоступен (HTTP, iframes)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Telegram-интеграция</DialogTitle>
          <DialogDescription>
            {isLinked
              ? `Telegram-группа привязана${channel === 'internal' ? ' к командному чату' : ' к проекту'}`
              : `Привяжите Telegram-группу ${channel === 'internal' ? 'к командному чату' : 'для двусторонней переписки'}`}
          </DialogDescription>
        </DialogHeader>

        {isLinked ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="font-medium text-sm">{chatTitle || 'Telegram-группа'}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Сообщения автоматически пересылаются между ЛК и Telegram
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={onUnlink}
              disabled={isUnlinking}
            >
              {isUnlinking ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4 mr-2" />
              )}
              Отвязать группу
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm">Как привязать:</p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Добавьте бота в Telegram-группу</li>
                <li>Отправьте команду в группу:</li>
              </ol>
            </div>

            {/* Код привязки */}
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border bg-muted/50 px-4 py-3 font-mono text-sm">
                {isLoadingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : linkCode ? (
                  linkCommand
                ) : (
                  '/link ...'
                )}
              </div>
              <Button variant="outline" size="icon" onClick={handleCopy} disabled={!linkCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {copied && <p className="text-xs text-green-600">Скопировано!</p>}

            <p className="text-xs text-muted-foreground">
              После отправки команды бот автоматически привяжет группу к проекту
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
