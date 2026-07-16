"use client"

/**
 * Вкладка «Внешние»: ссылки наружу (Google Диск, анкеты, брифы, папки наборов).
 * Иерархия одна: папка набора (kit_folder) → её подпапки (doc_folder по kit_id).
 * Осиротевшая подпапка (набор скрыт поиском или без drive_folder_id) не теряется —
 * всплывает на верхний уровень.
 */

import { Copy, FileText, FolderOpen, Link2, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectBadge } from '@/components/share/shareRowParts'
import type { ShareableExternal } from '@/services/api/shareLinks'

const EXTERNAL_ICON: Record<string, typeof Link2> = {
  drive_folder: FolderOpen,
  kit_folder: FolderOpen,
  doc_folder: FolderOpen,
  form: Table2,
  brief: Table2,
  source_doc: FileText,
}

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
  const kitFolders = items.filter((e) => e.kind === 'kit_folder')
  const kitIdsShown = new Set(kitFolders.map((k) => k.kit_id))
  const subByKit = new Map<string, ShareableExternal[]>()
  const top: ShareableExternal[] = []
  for (const e of items) {
    if (e.kind === 'kit_folder') continue
    if (e.kind === 'doc_folder' && e.kit_id && kitIdsShown.has(e.kit_id)) {
      const arr = subByKit.get(e.kit_id)
      if (arr) arr.push(e)
      else subByKit.set(e.kit_id, [e])
    } else {
      top.push(e)
    }
  }

  const renderRow = (e: ShareableExternal, indent = false) => {
    const key = `ext:${all.indexOf(e)}`
    const Icon = EXTERNAL_ICON[e.kind] ?? Link2
    return (
      <div
        key={key}
        className={cn(
          'group/row flex items-center gap-2.5 rounded-md py-0.5 pr-2 hover:bg-accent',
          indent ? 'pl-9' : 'pl-2',
        )}
      >
        <SelectBadge n={numberOf(key)} onClick={() => onToggle(key)} />
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <button
          type="button"
          onClick={() => onInsertOne(e.label, e.url)}
          className="min-w-0 flex-1 truncate text-left text-sm"
          title="Вставить ссылку в сообщение"
        >
          {e.label}
        </button>
        <button
          type="button"
          onClick={() => onCopyOne(e.label, e.url)}
          title="Скопировать ссылку"
          className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/row:opacity-100 focus-within:opacity-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {top.map((e) => renderRow(e))}
      {kitFolders.map((kit) => (
        <div key={`kit:${kit.kit_id}`}>
          {renderRow(kit)}
          {(subByKit.get(kit.kit_id ?? '') ?? []).map((sub) => renderRow(sub, true))}
        </div>
      ))}
    </div>
  )
}
