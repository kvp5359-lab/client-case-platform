import { useMemo } from 'react'
import { Mail } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { formatTime } from './bubbleUtils'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'

interface EmailFullViewDialogProps {
  message: ProjectMessage | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Показ полного содержимого email-письма.
 *
 * HTML рендерим в **iframe с sandbox**, а не в обычный <div>, потому что:
 *   - письма используют inline-стили и табличную вёрстку, рассчитанную на
 *     изолированный документ. Глобальные стили приложения (Tailwind reset,
 *     prose) их ломают — текст слипается, картинки растягиваются, таблицы
 *     плывут.
 *   - sandbox дополнительно изолирует поведение (нет доступа к нашему DOM).
 *
 * Iframe растягивается на всю высоту контейнера (h-full). Внутренняя
 * прокрутка контента — нативная у iframe, чтобы не было пустого
 * пространства внизу модалки при коротких письмах и не нужно было
 * измерять scrollHeight через JS (раньше делали через ResizeObserver,
 * получали зазор внизу когда контент короче контейнера).
 *
 * Безопасность: HTML предварительно очищается через DOMPurify (sanitizeHtml).
 * `<base target="_blank">` гарантирует, что клики по ссылкам открываются в
 * новой вкладке, а не пытаются перейти внутри iframe.
 */
export function EmailFullViewDialog({ message, open, onOpenChange }: EmailFullViewDialogProps) {
  const meta = message?.email_metadata
  const bodyHtml = meta?.body_html

  const srcDoc = useMemo(() => {
    if (!bodyHtml) return null
    const safe = sanitizeHtml(bodyHtml)
    return buildEmailIframeDocument(safe)
  }, [bodyHtml])

  if (!message || !meta) return null

  const date = new Date(message.created_at)
  const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = formatTime(message.created_at)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b space-y-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-red-500 shrink-0" />
            <span className="truncate">{meta.subject || 'Без темы'}</span>
          </DialogTitle>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <span className="text-muted-foreground/60 w-10 shrink-0">От:</span>
              <span className="font-medium text-foreground">{meta.from_email}</span>
            </div>
            {meta.to_emails?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground/60 w-10 shrink-0">Кому:</span>
                <span>{meta.to_emails.join(', ')}</span>
              </div>
            )}
            {meta.cc_emails?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground/60 w-10 shrink-0">Копия:</span>
                <span>{meta.cc_emails.join(', ')}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-muted-foreground/60 w-10 shrink-0">Дата:</span>
              <span>{dateStr}, {timeStr}</span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-white">
          {srcDoc ? (
            <iframe
              srcDoc={srcDoc}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              title="Содержимое письма"
              className="w-full h-full block border-0"
            />
          ) : (
            <div className="px-6 py-4 text-sm text-muted-foreground">
              Содержимое письма пустое.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Полный HTML-документ для iframe, в который вставлен sanitized email-HTML.
 *
 * Базовый CSS (font, цвета, max-width картинок) — чтобы криво свёрстанные
 * письма всё равно выглядели читаемо. Однако никаких CSS-resets или prose-
 * стилей не добавляем — это бы испортило ту вёрстку, которую отправитель
 * аккуратно сделал inline-стилями.
 *
 * `<base target="_blank">` направляет все ссылки в новое окно. `rel` для
 * безопасности добавляется в виде атрибутов на отдельные `<a>` через DOMPurify.
 */
function buildEmailIframeDocument(safeHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_blank">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    body {
      padding: 16px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    img { max-width: 100%; height: auto; border: 0; }
    table { max-width: 100%; }
    a { color: #2563eb; }
    blockquote {
      margin: 0 0 0.5em;
      padding-left: 12px;
      border-left: 3px solid #d1d5db;
      color: #6b7280;
    }
    pre, code {
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>${safeHtml}</body>
</html>`
}
