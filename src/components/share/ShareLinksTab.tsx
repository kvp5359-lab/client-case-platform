"use client"

/**
 * Вкладка «Ссылки» внутри пикера быстрых ответов (QuickReplyPicker).
 * Собирает публичные ссылки на статьи проекта + внешние ссылки, мультивыбор,
 * и ВСТАВЛЯЕТ выбранное прямо в редактор сообщения (editor.insertContent).
 * Поиск управляется извне (единое поле пикера).
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  Copy,
  RefreshCw,
  FileText,
  Link2,
  Loader2,
  FolderOpen,
  Table2,
  ChevronRight,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { escapeHtml } from '@/lib/html'
import {
  getProjectShareableResources,
  ensureArticleShareLink,
  regenerateArticleShareLink,
  buildShareUrl,
  type ProjectShareables,
  type ShareableArticle,
  type ShareableExternal,
} from '@/services/api/shareLinks'

type Props = {
  editor: Editor
  projectId: string
  /** Поисковый запрос из общего поля пикера. */
  search: string
  /** Грузить ресурсы (попап открыт). */
  enabled: boolean
  /** Какой раздел показывать (вкладки пикера). */
  view: 'articles' | 'descriptions' | 'external'
  /** Закрыть попап после вставки. */
  onInserted: () => void
}

/** Группа статей-описаний папок/слотов (см. get_project_shareable_resources). */
const DESCRIPTION_GROUP = 'Описания разделов документов'

/** Настройки формата (прятать ссылку / нумеровать) — на уровне пользователя. */
type SharePrefs = { hideUnderText: boolean; numbered: boolean }
const SHARE_PREFS_KEY = 'cc_share_link_prefs'

function readSharePrefs(userId: string | undefined): SharePrefs {
  const fallback: SharePrefs = { hideUnderText: false, numbered: false }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(`${SHARE_PREFS_KEY}:${userId ?? 'anon'}`)
    if (!raw) return fallback
    const p = JSON.parse(raw)
    return { hideUnderText: !!p.hideUnderText, numbered: !!p.numbered }
  } catch {
    return fallback
  }
}

function writeSharePrefs(userId: string | undefined, prefs: SharePrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${SHARE_PREFS_KEY}:${userId ?? 'anon'}`, JSON.stringify(prefs))
  } catch {
    /* localStorage недоступен — игнорируем */
  }
}

const EXTERNAL_ICON: Record<string, typeof Link2> = {
  drive_folder: FolderOpen,
  kit_folder: FolderOpen,
  doc_folder: FolderOpen,
  form: Table2,
  brief: Table2,
  source_doc: FileText,
}

/** Квадрат-чекбокс: пустой, когда не выбран; с НОМЕРОМ по порядку отметки, когда выбран. */
function SelectBadge({ n, onClick }: { n: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={n ? 'Убрать из выбора' : 'Добавить в выбор'}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-semibold leading-none tabular-nums transition-colors',
        n
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input hover:border-primary/60',
      )}
    >
      {n ?? ''}
    </button>
  )
}

export function ShareLinksTab({ editor, projectId, search, enabled, view, onInserted }: Props) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id
  const queryKey = ['project-shareables', projectId] as const

  const { data, isLoading, error } = useQuery<ProjectShareables>({
    queryKey,
    enabled: enabled && !!projectId,
    queryFn: () => getProjectShareableResources(projectId),
  })

  const [tokenOverride, setTokenOverride] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // Формат вставки — на уровне пользователя (localStorage, не по проектам).
  const [hideUnderText, setHideUnderText] = useState(() => readSharePrefs(userId).hideUnderText)
  // Нумеровать вставляемый список (1. …, 2. …) — только для «Вставить выбранное».
  const [numbered, setNumbered] = useState(() => readSharePrefs(userId).numbered)
  useEffect(() => {
    writeSharePrefs(userId, { hideUnderText, numbered })
  }, [userId, hideUnderText, numbered])

  const tokenFor = (articleId: string, base: string | null): string | null =>
    tokenOverride[articleId] ?? base

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const setGroupSelected = (keys: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (select) next.add(k)
        else next.delete(k)
      }
      return next
    })

  const ensureToken = async (articleId: string): Promise<string> => {
    const existing =
      tokenOverride[articleId] ?? data?.articles.find((a) => a.article_id === articleId)?.token
    if (existing) return existing
    setBusy((b) => ({ ...b, [articleId]: true }))
    try {
      const token = await ensureArticleShareLink(articleId, projectId)
      setTokenOverride((m) => ({ ...m, [articleId]: token }))
      return token
    } finally {
      setBusy((b) => ({ ...b, [articleId]: false }))
    }
  }

  const regenerate = async (articleId: string) => {
    setBusy((b) => ({ ...b, [articleId]: true }))
    try {
      const token = await regenerateArticleShareLink(articleId, projectId)
      setTokenOverride((m) => ({ ...m, [articleId]: token }))
      void qc.invalidateQueries({ queryKey })
      toast.success('Ссылка пересоздана — старая больше не работает')
    } catch {
      toast.error('Не удалось пересоздать ссылку')
    } finally {
      setBusy((b) => ({ ...b, [articleId]: false }))
    }
  }

  // numberedFlag — префикс «1. », «2. » (только для «Вставить/Скопировать выбранное»).
  const buildHtml = (items: { label: string; url: string }[], numberedFlag = false): string =>
    items
      .map((i, idx) => {
        const num = numberedFlag ? `${idx + 1}. ` : ''
        return hideUnderText
          ? `${num}<a href="${escapeHtml(i.url)}">${escapeHtml(i.label)}</a>`
          : `${num}${escapeHtml(i.label)}<br><a href="${escapeHtml(i.url)}">${escapeHtml(i.url)}</a>`
      })
      .join(hideUnderText ? '<br>' : '<br><br>')

  const insertItems = (items: { label: string; url: string }[], numberedFlag = false) => {
    if (items.length === 0) return
    editor.chain().focus().insertContent(buildHtml(items, numberedFlag)).run()
    onInserted()
  }

  const copyItems = async (items: { label: string; url: string }[], numberedFlag = false) => {
    if (items.length === 0) return
    const numPrefix = (idx: number) => (numberedFlag ? `${idx + 1}. ` : '')
    try {
      if (hideUnderText && typeof ClipboardItem !== 'undefined') {
        const plain = items.map((i, idx) => `${numPrefix(idx)}${i.label}`).join('\n')
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([buildHtml(items, numberedFlag)], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(
          items.map((i, idx) => `${numPrefix(idx)}${i.label}\n${i.url}`).join('\n\n'),
        )
      }
      toast.success('Скопировано')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  // Собираем В ПОРЯДКЕ ОТМЕТКИ (Set хранит порядок вставки ключей).
  const gatherSelected = async (): Promise<{ label: string; url: string }[]> => {
    if (!data) return []
    const items: { label: string; url: string }[] = []
    for (const key of selected) {
      if (key.startsWith('art:')) {
        const id = key.slice(4)
        const a = data.articles.find((x) => x.article_id === id)
        if (!a) continue
        const token = await ensureToken(id)
        items.push({ label: a.title, url: buildShareUrl(token) })
      } else if (key.startsWith('ext:')) {
        const e = data.external[Number(key.slice(4))]
        if (e) items.push({ label: e.label, url: e.url })
      }
    }
    return items
  }

  const insertSelected = async () => {
    try {
      insertItems(await gatherSelected(), numbered)
    } catch {
      toast.error('Не удалось получить ссылки')
    }
  }

  const copySelected = async () => {
    try {
      await copyItems(await gatherSelected(), numbered)
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  const insertArticle = async (a: ShareableArticle) => {
    try {
      const token = await ensureToken(a.article_id)
      insertItems([{ label: a.title, url: buildShareUrl(token) }])
    } catch {
      toast.error('Не удалось получить ссылку')
    }
  }

  const articles = useMemo(() => data?.articles ?? [], [data])
  const external = data?.external ?? []
  const selectedCount = selected.size
  // Порядок отметки (Set сохраняет порядок вставки) → номер в квадратике.
  const orderList = useMemo(() => Array.from(selected), [selected])
  const orderOf = (key: string): number | null => {
    const i = orderList.indexOf(key)
    return i < 0 ? null : i + 1
  }

  const q = search.trim().toLowerCase()
  const forceExpand = q.length > 0

  const articleGroups = useMemo(() => {
    const map = new Map<string, ShareableArticle[]>()
    for (const a of articles) {
      const g = a.group_name ?? 'Без группы'
      const arr = map.get(g)
      if (arr) arr.push(a)
      else map.set(g, [a])
    }
    return Array.from(map, ([group, items]) => ({ group, items }))
  }, [articles])

  const filteredGroups = useMemo(
    () =>
      articleGroups
        .map(({ group, items }) => ({
          group,
          items: q
            ? items.filter(
                (a) => a.title.toLowerCase().includes(q) || group.toLowerCase().includes(q),
              )
            : items,
        }))
        .filter(({ items }) => items.length > 0),
    [articleGroups, q],
  )

  const filteredExternal = q ? external.filter((e) => e.label.toLowerCase().includes(q)) : external

  // Иерархия внешних: папки наборов (kit_folder) + их подпапки (doc_folder по kit_id).
  const externalKitFolders = filteredExternal.filter((e) => e.kind === 'kit_folder')
  const kitIdsShown = new Set(externalKitFolders.map((k) => k.kit_id))
  const externalSubByKit = new Map<string, ShareableExternal[]>()
  const externalTop: ShareableExternal[] = []
  for (const e of filteredExternal) {
    if (e.kind === 'kit_folder') continue
    if (e.kind === 'doc_folder' && e.kit_id && kitIdsShown.has(e.kit_id)) {
      const arr = externalSubByKit.get(e.kit_id)
      if (arr) arr.push(e)
      else externalSubByKit.set(e.kit_id, [e])
    } else {
      externalTop.push(e)
    }
  }

  // Реальные группы БЗ vs статьи-описания разделов (отдельная вкладка).
  const realGroups = filteredGroups.filter((g) => g.group !== DESCRIPTION_GROUP)
  const descriptionItems = filteredGroups.find((g) => g.group === DESCRIPTION_GROUP)?.items ?? []
  const descriptionKeys = descriptionItems.map((a) => `art:${a.article_id}`)
  const descriptionAllSelected =
    descriptionKeys.length > 0 && descriptionKeys.every((k) => selected.has(k))

  const allGroupNames = realGroups.map((g) => g.group)
  const allGroupsExpanded =
    allGroupNames.length > 0 && allGroupNames.every((g) => forceExpand || expandedGroups.has(g))

  const toggleGroupCollapse = (group: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

  const toggleAllGroups = () =>
    setExpandedGroups(allGroupsExpanded ? new Set() : new Set(allGroupNames))

  const viewEmpty =
    view === 'articles'
      ? realGroups.length === 0
      : view === 'descriptions'
        ? descriptionItems.length === 0
        : filteredExternal.length === 0

  const renderArticleRow = (a: ShareableArticle, indent = true) => {
    const token = tokenFor(a.article_id, a.token)
    const key = `art:${a.article_id}`
    const isBusy = busy[a.article_id]
    return (
      <div
        key={key}
        className={cn(
          'group/row flex items-center gap-2.5 rounded-md pr-2 py-0.5 hover:bg-accent',
          indent ? 'pl-9' : 'pl-2',
        )}
      >
        <SelectBadge n={orderOf(key)} onClick={() => toggle(key)} />
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <button
          type="button"
          onClick={() => insertArticle(a)}
          className="flex-1 min-w-0 truncate text-left text-sm"
          title="Вставить ссылку в сообщение"
        >
          {a.title}
        </button>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
          {token && (
            <button
              type="button"
              onClick={() => regenerate(a.article_id)}
              disabled={isBusy}
              title="Пересоздать ссылку (старая перестанет работать)"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isBusy && 'animate-spin')} />
            </button>
          )}
          <button
            type="button"
            onClick={() => ensureToken(a.article_id).then((t) => copyItems([{ label: a.title, url: buildShareUrl(t) }]))}
            disabled={isBusy}
            title="Скопировать ссылку"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    )
  }

  const renderExternalRow = (e: ShareableExternal, indent = false) => {
    const key = `ext:${external.indexOf(e)}`
    const Icon = EXTERNAL_ICON[e.kind] ?? Link2
    return (
      <div
        key={key}
        className={cn(
          'group/row flex items-center gap-2.5 rounded-md pr-2 py-0.5 hover:bg-accent',
          indent ? 'pl-9' : 'pl-2',
        )}
      >
        <SelectBadge n={orderOf(key)} onClick={() => toggle(key)} />
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <button
          type="button"
          onClick={() => insertItems([{ label: e.label, url: e.url }])}
          className="flex-1 min-w-0 truncate text-left text-sm"
          title="Вставить ссылку в сообщение"
        >
          {e.label}
        </button>
        <button
          type="button"
          onClick={() => copyItems([{ label: e.label, url: e.url }])}
          title="Скопировать ссылку"
          className="p-1.5 rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:bg-muted group-hover/row:opacity-100 focus-within:opacity-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-[400px] flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-1">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
          </div>
        )}
        {error && (
          <div className="py-8 text-center text-sm text-destructive">
            Не удалось загрузить ресурсы.
          </div>
        )}
        {viewEmpty && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {q
              ? 'Ничего не найдено'
              : view === 'articles'
                ? 'Нет статей.'
                : view === 'descriptions'
                  ? 'Нет описаний разделов.'
                  : 'Нет внешних ссылок.'}
          </div>
        )}

        {/* Статьи базы знаний (по группам) */}
        {view === 'articles' && realGroups.length > 0 && (
          <div className="mb-1">
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="text-[11px] text-muted-foreground/70">
                закроются при завершении проекта
              </span>
              {!forceExpand && (
                <button
                  type="button"
                  onClick={toggleAllGroups}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  {allGroupsExpanded ? 'Свернуть всё' : 'Развернуть всё'}
                </button>
              )}
            </div>
            <div className="space-y-0">
              {realGroups.map(({ group, items }) => {
                const expanded = forceExpand || expandedGroups.has(group)
                const groupKeys = items.map((a) => `art:${a.article_id}`)
                const selCount = groupKeys.filter((k) => selected.has(k)).length
                const groupState: boolean | 'indeterminate' =
                  selCount === 0 ? false : selCount === groupKeys.length ? true : 'indeterminate'
                return (
                  <div key={group}>
                    <div className="group/gh flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-accent/60">
                      <Checkbox
                        checked={groupState}
                        onCheckedChange={() => setGroupSelected(groupKeys, selCount !== groupKeys.length)}
                        aria-label="Выбрать все статьи группы"
                      />
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <ChevronRight
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform',
                            expanded && 'rotate-90',
                          )}
                        />
                        <span className="truncate text-[15px] font-medium">{group}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
                          {items.length}
                        </span>
                      </button>
                    </div>
                    {expanded && (
                      <div className="space-y-0">{items.map((a) => renderArticleRow(a))}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Описания разделов документов (плоский список) */}
        {view === 'descriptions' && descriptionItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="text-[11px] text-muted-foreground/70">
                закроются при завершении проекта
              </span>
              <button
                type="button"
                onClick={() => setGroupSelected(descriptionKeys, !descriptionAllSelected)}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                {descriptionAllSelected ? 'Снять всё' : 'Выбрать всё'}
              </button>
            </div>
            <div className="space-y-0">{descriptionItems.map((a) => renderArticleRow(a, false))}</div>
          </div>
        )}

        {/* Внешние ссылки (папки наборов — с вложенными подпапками) */}
        {view === 'external' && filteredExternal.length > 0 && (
          <div className="space-y-0">
            {externalTop.map((e) => renderExternalRow(e))}
            {externalKitFolders.map((kit) => (
              <div key={`kit:${kit.kit_id}`}>
                {renderExternalRow(kit)}
                {(externalSubByKit.get(kit.kit_id ?? '') ?? []).map((sub) =>
                  renderExternalRow(sub, true),
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <Switch checked={hideUnderText} onCheckedChange={setHideUnderText} />
            Прятать под названием
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <Switch checked={numbered} onCheckedChange={setNumbered} />
            Нумеровать
          </label>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={copySelected}
              title="Скопировать выбранное"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          <Button size="sm" onClick={insertSelected} disabled={selectedCount === 0}>
            Вставить{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
