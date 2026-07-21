"use client"

/**
 * Вкладки «Статьи» / «Документы» / «Внешние» внутри пикера быстрых ответов
 * (QuickReplyPicker). Оркестратор: грузит ресурсы проекта, держит выбор, номера
 * и порядок, ВСТАВЛЯЕТ выбранное в редактор сообщения. Сами списки рисуют
 * ArticleGroupsView / DocTreeView / ExternalLinksView, сборку вставки делает
 * чистый lib/share/docTreeInsert (там же правила порядка и нумерации).
 *
 * Вкладка «Документы» показывает ВСЁ дерево одноимённой вкладки проекта
 * (набор → папки → слоты), а не только позиции со статьёй: где статья есть —
 * вставляется ссылка, где нет — просто название.
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { Copy, Eye, EyeOff, Loader2, Strikethrough } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  planDocInsert,
  docInsertNumbers,
  applyDocOrder,
  hideUploadedSlots,
  buildDocTreeHtml,
  buildDocTreePlain,
  docSlotKey,
  type DocPlanNode,
  type DocInsertNode,
  type DocOrder,
  type UploadedDisplay,
} from '@/lib/share/docTreeInsert'
import { DocTreeView } from '@/components/share/DocTreeView'
import { ArticleGroupsView } from '@/components/share/ArticleGroupsView'
import { ExternalLinksView } from '@/components/share/ExternalLinksView'
import { ShareRowActions } from '@/components/share/shareRowParts'
import { useSharePrefs } from '@/components/share/useSharePrefs'
import { useShareExpansion } from '@/components/share/useShareExpansion'
import {
  getProjectShareableResources,
  getProjectDriveExternalTree,
  ensureArticleShareLink,
  regenerateArticleShareLink,
  buildShareUrl,
  type ProjectShareables,
  type ShareableArticle,
  type ShareableDocKit,
  type ShareableDocFolder,
  type ShareableExternal,
} from '@/services/api/shareLinks'
import { projectShareableKeys } from '@/hooks/queryKeys'

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

/**
 * Группа статей-описаний папок/слотов в секции articles (см.
 * get_project_shareable_resources). Вкладка «Документы» их больше не рендерит —
 * она работает на doc_tree, — но и во вкладке «Статьи» они не нужны, поэтому
 * группа отсекается. Убрать fold-ветку из articles можно после выката фронта.
 */
const DESCRIPTION_GROUP = 'Описания разделов документов'

/** Кнопка «Загруженные»: клик циклически переключает режим keep → strike → hide. */
const UPLOADED_CYCLE: UploadedDisplay[] = ['keep', 'strike', 'hide']
const UPLOADED_MODE: Record<UploadedDisplay, { icon: typeof Eye; label: string }> = {
  keep: { icon: Eye, label: 'Показывать' },
  strike: { icon: Strikethrough, label: 'Зачёркивать' },
  hide: { icon: EyeOff, label: 'Скрывать' },
}

/**
 * Дерево из БД (get_project_shareable_resources.external) → к единому виду с
 * id/parent_id, как у «живого» Drive-дерева, чтобы ExternalLinksView рисовал их
 * одним алгоритмом. Логическая вложенность: корень проекта → бриф + папки
 * наборов → подпапки (менее точна, чем Диск, — это фолбэк без подключённого Drive).
 */
function normalizeDbExternal(items: ShareableExternal[]): ShareableExternal[] {
  const root = items.find((e) => e.kind === 'drive_folder')
  const rootId = root ? 'root' : null
  const shownKitIds = new Set(items.filter((e) => e.kind === 'kit_folder').map((e) => e.kit_id))
  return items.map((e, i) => {
    if (e.kind === 'drive_folder') return { ...e, id: 'root', parent_id: null }
    if (e.kind === 'kit_folder') return { ...e, id: `kit:${e.kit_id}`, parent_id: rootId }
    if (e.kind === 'doc_folder') {
      const underKit = e.kit_id && shownKitIds.has(e.kit_id)
      return { ...e, id: `doc:${i}`, parent_id: underKit ? `kit:${e.kit_id}` : rootId }
    }
    return { ...e, id: `db:${i}`, parent_id: rootId }
  })
}

export function ShareLinksTab({ editor, projectId, search, enabled, view, onInserted }: Props) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id
  const queryKey = projectShareableKeys.byProject(projectId)

  const { data, isLoading, error } = useQuery<ProjectShareables>({
    queryKey,
    enabled: enabled && !!projectId,
    queryFn: () => getProjectShareableResources(projectId),
  })

  const [tokenOverride, setTokenOverride] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Перестановки (перетаскивание) и ручные номера — настройка ТЕКУЩЕЙ вставки:
  // попап закрывается вместе с выбором, документы проекта не трогаются.
  const [order, setOrder] = useState<DocOrder>({})
  const [numberOverrides, setNumberOverrides] = useState<Record<string, number>>({})
  const {
    hideUnderText,
    setHideUnderText,
    numbered,
    setNumbered,
    uploadedDisplay,
    setUploadedDisplay,
  } = useSharePrefs(userId)

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

  const ensureToken = async (articleId: string, knownToken?: string | null): Promise<string> => {
    const existing =
      tokenOverride[articleId] ??
      knownToken ??
      data?.articles.find((a) => a.article_id === articleId)?.token
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

  /** План → готовые узлы: дотягиваем токены статей (сеть), адреса и номера. */
  const resolvePlan = async (
    plan: DocPlanNode[],
    numbers: Map<string, string>,
  ): Promise<DocInsertNode[]> => {
    const resolveNode = async (n: DocPlanNode): Promise<DocInsertNode> => ({
      label: n.label,
      url: n.url ?? (n.articleId ? buildShareUrl(await ensureToken(n.articleId, n.token)) : null),
      number: numbers.get(n.key) ?? null,
      isFolder: n.isFolder,
      struck: uploadedDisplay === 'strike' && n.hasDocument,
      children: await Promise.all(n.children.map(resolveNode)),
    })
    return Promise.all(plan.map(resolveNode))
  }

  // numberedFlag — префикс «1. » / «1.1. » (только для «Вставить/Скопировать выбранное»).
  const insertNodes = (nodes: DocInsertNode[], numberedFlag = false) => {
    if (nodes.length === 0) return
    editor
      .chain()
      .focus()
      .insertContent(buildDocTreeHtml(nodes, { hideUnderText, numbered: numberedFlag }))
      .run()
    onInserted()
  }

  const copyNodes = async (nodes: DocInsertNode[], numberedFlag = false) => {
    if (nodes.length === 0) return
    const format = { hideUnderText, numbered: numberedFlag }
    try {
      if (hideUnderText && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([buildDocTreeHtml(nodes, format)], { type: 'text/html' }),
            'text/plain': new Blob([buildDocTreePlain(nodes, format)], { type: 'text/plain' }),
          }),
        ])
      } else {
        // Спрятать ссылку под названием тут негде (кладём чистый текст), поэтому
        // hideUnderText игнорируем — иначе адрес потерялся бы молча.
        await navigator.clipboard.writeText(
          buildDocTreePlain(nodes, { ...format, hideUnderText: false }),
        )
      }
      toast.success('Скопировано')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  /** Одиночная строка (клик по названию): статья, внешняя ссылка или узел дерева. */
  const insertOne = async (
    label: string,
    articleId: string | null,
    token: string | null,
    opts?: { url?: string; struck?: boolean },
  ) => {
    try {
      const resolved =
        opts?.url ?? (articleId ? buildShareUrl(await ensureToken(articleId, token)) : null)
      insertNodes([{ label, url: resolved, number: null, struck: opts?.struck, children: [] }])
    } catch {
      toast.error('Не удалось получить ссылку')
    }
  }

  const copyOne = async (
    label: string,
    articleId: string | null,
    token: string | null,
    url?: string,
  ) => {
    try {
      const resolved = url ?? (articleId ? buildShareUrl(await ensureToken(articleId, token)) : null)
      await copyNodes([{ label, url: resolved, number: null, children: [] }])
    } catch {
      toast.error('Не удалось получить ссылку')
    }
  }

  // «Внешние» — живая структура папок с Google Drive (совпадает с Диском,
  // включая реальную папку брифа). Грузим только при открытой вкладке; если Диск
  // не подключён / не прочитался — откатываемся на дерево из БД (data.external).
  const { data: driveTree, isLoading: driveLoading } = useQuery({
    queryKey: projectShareableKeys.driveTree(projectId),
    enabled: enabled && !!projectId && view === 'external',
    queryFn: () => getProjectDriveExternalTree(projectId),
  })

  // Пока живое Drive-дерево грузится — не показываем старое БД-дерево (мигание
  // «неправильная → правильная структура»): отдаём пусто и рисуем лоадер.
  const externalLoading = view === 'external' && driveLoading

  const articles = useMemo(() => data?.articles ?? [], [data])
  const external = useMemo(() => {
    if (externalLoading) return []
    if (driveTree && driveTree.length > 0) return driveTree
    return normalizeDbExternal(data?.external ?? [])
  }, [externalLoading, driveTree, data])
  const docTree = useMemo(() => data?.doc_tree ?? [], [data])
  const selectedCount = selected.size
  // Порядок отметки — Set сохраняет порядок вставки ключей.
  const orderList = useMemo(() => Array.from(selected), [selected])

  /**
   * Дерево с учётом перетаскивания и режима загруженных — им же рисуется список
   * (единый порядок и состав со вставкой). Режим hide убирает загруженные слоты
   * и из списка: список — точное превью сообщения.
   */
  const orderedTree = useMemo(() => {
    const base = uploadedDisplay === 'hide' ? hideUploadedSlots(docTree) : docTree
    return applyDocOrder(base, order)
  }, [docTree, order, uploadedDisplay])

  /**
   * План вставки по ВСЕМ отмеченным ключам сразу (все вкладки): дерево идёт в
   * своём порядке, статьи и внешние ссылки — следом, в порядке отметки.
   *
   * Он же — источник номеров в квадратиках: список и сообщение считают номера
   * одним кодом и разойтись не могут.
   */
  const selectionPlan = useMemo(
    () =>
      planDocInsert(orderedTree, orderList, {
        resolveExtra: (key) => {
          if (key.startsWith('art:')) {
            const a = articles.find((x) => x.article_id === key.slice(4))
            return a ? { label: a.title, articleId: a.article_id, token: a.token } : null
          }
          if (key.startsWith('ext:')) {
            const e = external[Number(key.slice(4))]
            return e ? { label: e.label, articleId: null, token: null, url: e.url } : null
          }
          return null
        },
      }),
    [orderedTree, orderList, articles, external],
  )

  const numberByKey = useMemo(
    () => docInsertNumbers(selectionPlan, numberOverrides),
    [selectionPlan, numberOverrides],
  )
  const numberOf = (key: string): string | null => numberByKey.get(key) ?? null

  const setNumberOverride = (key: string, value: number | null) =>
    setNumberOverrides((prev) => {
      if (value === null) {
        const { [key]: _drop, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: value }
    })

  /**
   * Смена режима загруженных. При «Скрывать» снимаем выбор с загруженных слотов:
   * их нет ни в списке, ни в плане, и счётчик «Вставить (N)» не должен врать.
   */
  const changeUploadedDisplay = (mode: UploadedDisplay) => {
    setUploadedDisplay(mode)
    if (mode !== 'hide') return
    const uploadedKeys = new Set(
      docTree.flatMap((k) =>
        k.folders.flatMap((f) =>
          f.slots.filter((s) => s.has_document).map((s) => docSlotKey(s.slot_id)),
        ),
      ),
    )
    setSelected((prev) => new Set([...prev].filter((key) => !uploadedKeys.has(key))))
  }

  const reorderFolders = (kitId: string, folderIds: string[]) =>
    setOrder((prev) => ({ ...prev, folders: { ...prev.folders, [kitId]: folderIds } }))

  const reorderSlots = (folderId: string, slotIds: string[]) =>
    setOrder((prev) => ({ ...prev, slots: { ...prev.slots, [folderId]: slotIds } }))

  const insertSelected = async () => {
    try {
      insertNodes(await resolvePlan(selectionPlan, numberByKey), numbered)
    } catch {
      toast.error('Не удалось получить ссылки')
    }
  }

  const copySelected = async () => {
    try {
      await copyNodes(await resolvePlan(selectionPlan, numberByKey), numbered)
    } catch {
      toast.error('Не удалось скопировать')
    }
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

  // Реальные группы БЗ (статьи-описания живут во вкладке «Документы» на doc_tree).
  const realGroups = useMemo(
    () =>
      articleGroups
        .filter((g) => g.group !== DESCRIPTION_GROUP)
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

  // Дерево документов под поиск: совпало имя набора/папки → показываем её целиком,
  // иначе оставляем только подходящие слоты.
  const filteredTree = useMemo<ShareableDocKit[]>(() => {
    if (!q) return orderedTree
    const out: ShareableDocKit[] = []
    for (const kit of orderedTree) {
      const kitMatch = kit.name.toLowerCase().includes(q)
      const folders: ShareableDocFolder[] = []
      for (const f of kit.folders) {
        const folderMatch = kitMatch || f.name.toLowerCase().includes(q)
        const slots = folderMatch ? f.slots : f.slots.filter((s) => s.name.toLowerCase().includes(q))
        if (folderMatch || slots.length > 0) folders.push({ ...f, slots })
      }
      if (folders.length > 0) out.push({ ...kit, folders })
    }
    return out
  }, [orderedTree, q])

  const {
    expandedGroups,
    toggleGroup,
    allGroupsExpanded,
    toggleAllGroups,
    expandedFolders,
    collapsedKits,
    toggleFolder,
    toggleKit,
    allFoldersExpanded,
    toggleAllFolders,
  } = useShareExpansion({
    allGroupNames: realGroups.map((g) => g.group),
    allFolderIds: filteredTree.flatMap((k) => k.folders.map((f) => f.folder_id)),
    forceExpand,
  })

  const viewEmpty =
    view === 'articles'
      ? realGroups.length === 0
      : view === 'descriptions'
        ? filteredTree.length === 0
        : !externalLoading && filteredExternal.length === 0

  const renderActions = (label: string, articleId: string | null, token: string | null) => (
    <ShareRowActions
      label={label}
      articleId={articleId}
      token={articleId ? tokenFor(articleId, token) : null}
      busy={articleId ? !!busy[articleId] : false}
      onRegenerate={regenerate}
      onCopy={(l, aId, t) => copyOne(l, aId, t)}
    />
  )

  return (
    <div className="flex h-[min(400px,45vh)] flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-1">
        {(isLoading || externalLoading) && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />{' '}
            {externalLoading ? 'Читаем структуру Google Диска…' : 'Загрузка…'}
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
                  ? 'В проекте нет папок с документами.'
                  : 'Нет внешних ссылок.'}
          </div>
        )}

        {view === 'articles' && realGroups.length > 0 && (
          <ArticleGroupsView
            groups={realGroups}
            selected={selected}
            numberOf={numberOf}
            onToggle={toggle}
            onSetSelected={setGroupSelected}
            expandedGroups={expandedGroups}
            onToggleGroup={toggleGroup}
            forceExpand={forceExpand}
            allExpanded={allGroupsExpanded}
            onToggleAll={toggleAllGroups}
            onInsertOne={insertOne}
            renderActions={renderActions}
          />
        )}

        {view === 'descriptions' && filteredTree.length > 0 && (
          <div className="mb-1">
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="text-[11px] text-muted-foreground/70">
                закроются при завершении проекта
              </span>
              {!forceExpand && (
                <button
                  type="button"
                  onClick={toggleAllFolders}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  {allFoldersExpanded ? 'Свернуть всё' : 'Развернуть всё'}
                </button>
              )}
            </div>
            <DocTreeView
              tree={filteredTree}
              selected={selected}
              numberOf={numberOf}
              onToggle={toggle}
              onSetSelected={setGroupSelected}
              onSetNumber={setNumberOverride}
              onReorderFolders={reorderFolders}
              onReorderSlots={reorderSlots}
              expandedFolders={expandedFolders}
              collapsedKits={collapsedKits}
              onToggleFolder={toggleFolder}
              onToggleKit={toggleKit}
              forceExpand={forceExpand}
              numbered={numbered}
              strikeUploaded={uploadedDisplay === 'strike'}
              onInsertOne={(label, articleId, token, struck) =>
                insertOne(label, articleId, token, { struck })
              }
              renderActions={renderActions}
            />
          </div>
        )}

        {view === 'external' && filteredExternal.length > 0 && (
          <ExternalLinksView
            items={filteredExternal}
            all={external}
            numberOf={numberOf}
            onToggle={toggle}
            onInsertOne={(label, url) => insertOne(label, null, null, { url })}
            onCopyOne={(label, url) => copyOne(label, null, null, url)}
          />
        )}
      </div>

      {/* Настройки — одной неразрывной строкой; кнопки при нехватке места
          переносятся вниз вправо (на вкладке документов настроек три). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t bg-muted/20 px-2.5 py-2">
        <div className="flex shrink-0 items-center gap-x-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
            <Switch checked={hideUnderText} onCheckedChange={setHideUnderText} />
            Под названием
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
            <Switch checked={numbered} onCheckedChange={setNumbered} />
            Нумеровать
          </label>
          {view === 'descriptions' && (() => {
            const { icon: ModeIcon, label } = UPLOADED_MODE[uploadedDisplay]
            const next = UPLOADED_CYCLE[(UPLOADED_CYCLE.indexOf(uploadedDisplay) + 1) % UPLOADED_CYCLE.length]
            return (
              <button
                type="button"
                onClick={() => changeUploadedDisplay(next)}
                title={`Загруженные документы: ${label.toLowerCase()}. Нажмите, чтобы переключить`}
                className="flex items-center gap-1 whitespace-nowrap rounded px-0.5 py-0.5 hover:bg-muted hover:text-foreground"
              >
                Загруженные:
                <ModeIcon className="h-3.5 w-3.5" />
              </button>
            )
          })()}
        </div>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={copySelected}
              title="Скопировать выбранное"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={insertSelected}
            disabled={selectedCount === 0}
          >
            Вставить{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
