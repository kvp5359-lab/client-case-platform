"use client"

/**
 * Вкладка «Внешние»: ссылки наружу (Google Диск, бриф) — деревом, как на
 * Google Диске. Узлы приходят с id/parent_id (живое дерево читается прямо у
 * Drive в google-drive-shareable-tree; при отсутствии подключённого Диска —
 * логическое дерево из БД, нормализованное к тому же виду в ShareLinksTab).
 * Дерево строим по parent_id: корень — узел с parent_id = null. Узел, чей
 * родитель отфильтрован поиском, не теряется — встаёт на верхний уровень.
 *
 * Линии структуры — метод дерева базы знаний (константы TreeConstants:
 * getLineX/INDENT/ICON_CENTER, тот же border-стиль). Непрерывность даёт связка:
 * «сквозная» вертикаль незакрытых предков + «стык» родителя вниз к детям +
 * элбоу текущего узла. Так линии не рвутся при рядах с чекбоксом слева.
 */

import type { ReactNode } from 'react'
import { Copy, FileText, FolderOpen, Link2, Table2 } from 'lucide-react'
import { SelectBadge } from '@/components/share/shareRowParts'
import { BASE_PAD, INDENT, ICON_CENTER, getLineX } from '@/components/shared/tree/TreeConstants'
import type { ShareableExternal } from '@/services/api/shareLinks'

const EXTERNAL_ICON: Record<string, typeof Link2> = {
  drive_folder: FolderOpen,
  kit_folder: FolderOpen,
  doc_folder: FolderOpen,
  form: Table2,
  brief: Table2,
  source_doc: FileText,
}

const LINE = 'absolute border-border/50'
const BRANCH_WIDTH = INDENT - ICON_CENTER + 2

type Props = {
  /** Отфильтрованные поиском ссылки. */
  items: ShareableExternal[]
  /** Полный список — по нему считается ключ ext:<index>. */
  all: ShareableExternal[]
  numberOf: (key: string) => string | null
  onToggle: (key: string) => void
  onInsertOne: (label: string, url: string) => void
  onCopyOne: (label: string, url: string) => void
}

export function ExternalLinksView({ items, all, numberOf, onToggle, onInsertOne, onCopyOne }: Props) {
  // Дети по родителю (в исходном порядке). Родитель, отфильтрованный поиском,
  // не в наборе видимых id → его дети считаются верхним уровнем.
  const visibleIds = new Set(items.map((e) => e.id).filter(Boolean) as string[])
  const childrenOf = new Map<string, ShareableExternal[]>()
  const roots: ShareableExternal[] = []
  for (const e of items) {
    const parent = e.parent_id ?? null
    if (parent === null || !visibleIds.has(parent)) {
      roots.push(e)
    } else {
      const arr = childrenOf.get(parent)
      if (arr) arr.push(e)
      else childrenOf.set(parent, [e])
    }
  }

  /**
   * Линии-гайды для ряда на глубине depth.
   * flags[i] — является ли предок (или сам узел при i=depth-1) последним среди
   * соседей: незакрытый предок (не последний) даёт сплошную вертикаль на всю
   * высоту ряда, закрытый — ничего.
   */
  const guides = (depth: number, flags: boolean[], hasKids: boolean): ReactNode[] => {
    const out: ReactNode[] = []
    // Сквозные вертикали незакрытых предков (уровни 1..depth-1).
    for (let L = 1; L < depth; L++) {
      if (!flags[L - 1]) {
        out.push(
          <span key={`v${L}`} className={`${LINE} top-0 bottom-0 border-l`} style={{ left: getLineX(L) }} />,
        )
      }
    }
    if (depth > 0) {
      const x = getLineX(depth)
      const selfLast = flags[depth - 1]
      // Элбоу текущего узла: вертикаль сверху до центра + ветка вправо.
      out.push(<span key="ev" className={`${LINE} top-0 border-l`} style={{ left: x, height: '50%' }} />)
      out.push(<span key="eh" className={`${LINE} border-t`} style={{ left: x, top: '50%', width: BRANCH_WIDTH }} />)
      // Не последний среди соседей — вертикаль продолжается вниз к следующему.
      if (!selfLast) {
        out.push(<span key="ec" className={`${LINE} bottom-0 border-l`} style={{ left: x, top: '50%' }} />)
      }
    }
    // «Стык» родителя вниз к детям: вертикаль от центра ряда до низа в колонке
    // детей — соединяет центр родителя с вертикалью первого ребёнка.
    if (hasKids) {
      out.push(
        <span key="down" className={`${LINE} bottom-0 border-l`} style={{ left: getLineX(depth + 1), top: '50%' }} />,
      )
    }
    return out
  }

  const rows: ReactNode[] = []
  const walk = (e: ShareableExternal, depth: number, flags: boolean[]) => {
    const kids = e.id ? (childrenOf.get(e.id) ?? []) : []
    const key = `ext:${all.indexOf(e)}`
    const Icon = EXTERNAL_ICON[e.kind] ?? Link2
    rows.push(
      <div
        key={key}
        className="group/row relative flex items-center gap-2.5 rounded-md py-0.5 pr-2 hover:bg-accent"
        style={{ paddingLeft: `${BASE_PAD + depth * INDENT}px` }}
      >
        {guides(depth, flags, kids.length > 0)}
        <SelectBadge n={numberOf(key)} onClick={() => onToggle(key)} />
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <button
          type="button"
          onClick={() => onInsertOne(e.label, e.url)}
          className="min-w-0 flex-1 truncate text-left text-sm"
          title="Вставить ссылку в сообщение"
        >
          {e.label}
          {e.sub_label && <span className="text-muted-foreground/70">: {e.sub_label}</span>}
        </button>
        <button
          type="button"
          onClick={() => onCopyOne(e.label, e.url)}
          title="Скопировать ссылку"
          className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/row:opacity-100 focus-within:opacity-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>,
    )
    kids.forEach((child, i) => walk(child, depth + 1, [...flags, i === kids.length - 1]))
  }
  roots.forEach((e) => walk(e, 0, []))

  return <div className="space-y-0">{rows}</div>
}
