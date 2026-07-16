"use client"

/**
 * Общие части строки пикера ссылок: квадратик выбора и действия по ссылке.
 * Используются всеми тремя вкладками (статьи, документы, внешние) — иначе набор
 * кнопок разъезжается между ними при первой же правке.
 */

import { Copy, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Квадрат-чекбокс: пустой, когда не выбран; когда выбран — с НОМЕРОМ, который
 * узел получит в сообщении («1», «1.1»). Ширина плавающая: «1.1» в 16px не влез бы.
 */
export function SelectBadge({ n, onClick }: { n: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={n ? 'Убрать из выбора' : 'Добавить в выбор'}
      className={cn(
        'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[4px] border px-[3px] text-[10px] font-semibold leading-none tabular-nums transition-colors',
        n
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input hover:border-primary/60',
      )}
    >
      {n ?? ''}
    </button>
  )
}

/**
 * Пересоздать / скопировать. Появляются при наведении на строку (group/row).
 * articleId=null — узел без статьи: пересоздавать нечего, копируется название.
 */
export function ShareRowActions({
  label,
  articleId,
  token,
  busy,
  onRegenerate,
  onCopy,
}: {
  label: string
  articleId: string | null
  /** Активный токен статьи (уже с учётом локальных пересозданий). */
  token: string | null
  busy: boolean
  onRegenerate: (articleId: string) => void
  onCopy: (label: string, articleId: string | null, token: string | null) => void
}) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
      {articleId && token && (
        <button
          type="button"
          onClick={() => onRegenerate(articleId)}
          disabled={busy}
          title="Пересоздать ссылку (старая перестанет работать)"
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onCopy(label, articleId, token)}
        disabled={busy}
        title={articleId ? 'Скопировать ссылку' : 'Скопировать название'}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
