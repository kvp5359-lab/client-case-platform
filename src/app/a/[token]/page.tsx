"use client"

/**
 * Публичная страница просмотра статьи базы знаний по шеринг-ссылке.
 *
 * Открывается у любого без авторизации. Резолв — anon-RPC get_shared_article,
 * который отдаёт статью, только если ссылка не отозвана и проект НЕ в финальном
 * статусе (иначе → «ссылка недействительна»). Всегда read-only: копирование,
 * контекстное меню и Ctrl+C/A заблокированы.
 *
 * Роут host-agnostic (токен глобально уникален) — middleware (src/proxy.ts)
 * пропускает /a/* без rewrite в /workspaces/<id> и без auth.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'
import { cn } from '@/lib/utils'

type Article = { title: string; content: string }
type State =
  | { status: 'loading' }
  | { status: 'ok'; article: Article }
  | { status: 'invalid' }

export default function SharedArticlePage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!token) {
        if (!cancelled) setState({ status: 'invalid' })
        return
      }
      const { data, error } = await supabase.rpc('get_shared_article', { p_token: token })
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : null
      if (error || !row) {
        setState({ status: 'invalid' })
        return
      }
      setState({ status: 'ok', article: { title: row.title, content: row.content ?? '' } })
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  // Блокировка Ctrl+C / Ctrl+A на странице (read-only).
  useEffect(() => {
    if (state.status !== 'ok') return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'C', 'a', 'A'].includes(e.key)) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [state.status])

  const safeHtml = useMemo(
    () => (state.status === 'ok' ? sanitizeHtml(state.article.content) : ''),
    [state],
  )

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    )
  }

  if (state.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold">Ссылка недействительна</h1>
          <p className="text-sm text-muted-foreground">
            Возможно, срок её действия истёк или доступ был закрыт. Обратитесь к тому, кто
            поделился ссылкой.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-bold mb-6">{state.article.title}</h1>
        <div
          onCopy={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            'prose max-w-none w-full select-none',
            'prose-p:my-0 prose-li:my-0 prose-ul:my-0 prose-ol:my-0',
            'prose-h1:my-0 prose-h2:my-0 prose-h3:my-0',
            'prose-blockquote:my-0 prose-pre:my-0 prose-table:my-0',
            'prose-hr:my-0 prose-img:my-0',
            '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6',
            '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5',
            '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4',
            '[&_p]:mb-2 [&_p]:leading-relaxed [&_p:empty]:min-h-[1em]',
            '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2',
            '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2',
            '[&_li]:mb-0 [&_li_p]:mb-0',
            '[&_a]:text-primary [&_a]:underline',
            '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
            '[&_code]:bg-[#eeeef1] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono',
            '[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-4 [&_pre]:overflow-x-auto',
            '[&_table]:w-full [&_table]:border-collapse [&_table]:my-4',
            '[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_th]:font-semibold [&_th]:text-left',
            '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
            '[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-3',
            '[&_hr]:my-6 [&_hr]:border-border',
          )}
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      </div>
    </div>
  )
}
