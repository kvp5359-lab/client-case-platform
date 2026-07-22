"use client"

/**
 * Вкладка «Описания документов»: дерево вкладки «Документы» проекта
 * (набор → папки → слоты) с выбором, нумерацией и перетаскиванием.
 *
 * Три вещи разведены намеренно (решение владельца):
 * - чекбокс — что вставить;
 * - номер — какой он будет в сообщении (правится вручную: «начни с 3»);
 * - перетаскивание — порядок. Порядок кликов НИ НА ЧТО не влияет.
 *
 * Перетаскивание меняет порядок только В СООБЩЕНИИ и живёт до закрытия попапа —
 * сами документы проекта не трогаются. Поэтому слот ходит лишь внутри своей
 * папки, а папка — среди папок своего набора: иначе это читалось бы как перенос
 * документа между папками.
 */

import { useState, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, FileText, GripVertical } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { docFolderKey, docSlotKey } from '@/lib/share/docTreeInsert'
import type { ShareableDocKit, ShareableDocFolder, ShareableDocSlot } from '@/services/api/shareLinks'

type RowActions = (label: string, articleId: string | null, token: string | null) => ReactNode

type Props = {
  /** Дерево, к которому УЖЕ применён порядок (applyDocOrder). */
  tree: ShareableDocKit[]
  selected: Set<string>
  numberOf: (key: string) => string | null
  onToggle: (key: string) => void
  onSetSelected: (keys: string[], select: boolean) => void
  /** null — вернуть автоматический номер. */
  onSetNumber: (key: string, value: number | null) => void
  onReorderFolders: (kitId: string, folderIds: string[]) => void
  onReorderSlots: (folderId: string, slotIds: string[]) => void
  expandedFolders: Set<string>
  collapsedKits: Set<string>
  onToggleFolder: (folderId: string) => void
  onToggleKit: (kitId: string) => void
  /** Поиск активен — раскрываем всё и не даём таскать (список отфильтрован). */
  forceExpand: boolean
  /** Тумблер «Нумеровать»: выключен — номеров в сообщении нет, в списке тоже. */
  numbered: boolean
  /** Режим «Зачёркивать»: загруженные слоты зачёркнуты и в списке (превью). */
  strikeUploaded: boolean
  /** struck — вставить зачёркнутым (одиночная вставка обязана совпадать со списком). */
  onInsertOne: (
    label: string,
    articleId: string | null,
    token: string | null,
    struck?: boolean,
  ) => void
  renderActions: RowActions
}

/** Ручка перетаскивания — появляется при наведении, чтобы не мешать кликам. */
function DragHandle({
  attributes,
  listeners,
  disabled,
}: {
  attributes: DraggableAttributes
  listeners: SyntheticListenerMap | undefined
  disabled?: boolean
}) {
  if (disabled) return <span className="w-3 shrink-0" aria-hidden />
  return (
    <button
      type="button"
      className="w-3 shrink-0 cursor-grab touch-none text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-hover/row:opacity-100"
      aria-label="Перетащить"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  )
}

/**
 * Номер, который пункт получит в сообщении. Клик — правка: вводится ПОСЛЕДНЯЯ
 * часть («1.1» → правим «1»), потому что первая принадлежит родительской папке.
 *
 * Не выбран → пустой серый прямоугольник (место под номер), нумерация выключена
 * → номеров нет вовсе: показывать их было бы враньём, в сообщение они не идут.
 */
function NumberBadge({
  value,
  onCommit,
}: {
  value: string | null
  onCommit: (value: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!value) {
    return (
      <span
        className="h-4 w-7 shrink-0 rounded-[4px] border border-border/50 bg-muted/30"
        aria-hidden
      />
    )
  }

  const own = value.split('.').pop() ?? ''

  if (editing) {
    const commit = () => {
      setEditing(false)
      const trimmed = draft.trim()
      if (trimmed === '') return onCommit(null)
      const n = Number.parseInt(trimmed, 10)
      onCommit(Number.isFinite(n) && n > 0 ? n : null)
    }
    return (
      <input
        autoFocus
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="h-4 w-7 shrink-0 rounded-[4px] border border-foreground/40 bg-background px-0.5 text-center text-[10px] font-semibold tabular-nums text-foreground outline-none"
        aria-label="Номер в сообщении"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(own)
        setEditing(true)
      }}
      title="Изменить номер — следующие пункты сдвинутся"
      className="h-4 w-7 shrink-0 rounded-[4px] border border-border bg-muted px-0.5 text-center text-[10px] font-semibold leading-none tabular-nums text-foreground hover:border-foreground/40"
    >
      {value}
    </button>
  )
}

function SortableSlotRow({
  slot,
  selected,
  number,
  numbered,
  struck,
  disabled,
  onToggle,
  onSetNumber,
  onInsertOne,
  renderActions,
}: {
  slot: ShareableDocSlot
  selected: boolean
  number: string | null
  numbered: boolean
  /** Зачеркнуть в списке — так же уйдёт и в сообщение. */
  struck: boolean
  disabled: boolean
  onToggle: () => void
  onSetNumber: (value: number | null) => void
  onInsertOne: () => void
  renderActions: RowActions
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: docSlotKey(slot.slot_id),
    disabled,
  })
  const hasArticle = !!slot.article_id
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group/row flex items-center gap-1.5 rounded-md py-0.5 pl-6 pr-2 hover:bg-accent',
        isDragging && 'opacity-50',
      )}
    >
      <DragHandle attributes={attributes} listeners={listeners} disabled={disabled} />
      <Checkbox checked={selected} onCheckedChange={onToggle} aria-label="Выбрать документ" />
      {numbered && <NumberBadge value={number} onCommit={onSetNumber} />}
      <FileText
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          hasArticle ? 'text-muted-foreground/70' : 'text-muted-foreground/30',
        )}
      />
      <button
        type="button"
        onClick={onInsertOne}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-sm',
          struck && 'text-muted-foreground line-through',
        )}
        title={hasArticle ? 'Вставить ссылку в сообщение' : 'Нет статьи — вставится названием'}
      >
        {slot.name}
      </button>
      {renderActions(slot.name, slot.article_id, slot.token)}
    </div>
  )
}

function SortableFolder({
  folder,
  expanded,
  disabled,
  selected,
  numberOf,
  numbered,
  strikeUploaded,
  onToggle,
  onSetSelected,
  onSetNumber,
  onToggleExpand,
  onInsertOne,
  renderActions,
}: {
  folder: ShareableDocFolder
  expanded: boolean
  disabled: boolean
  selected: Set<string>
  numberOf: (key: string) => string | null
  numbered: boolean
  strikeUploaded: boolean
  onToggle: (key: string) => void
  onSetSelected: (keys: string[], select: boolean) => void
  onSetNumber: (key: string, value: number | null) => void
  onToggleExpand: () => void
  onInsertOne: (
    label: string,
    articleId: string | null,
    token: string | null,
    struck?: boolean,
  ) => void
  renderActions: RowActions
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: docFolderKey(folder.folder_id),
    disabled,
  })

  // Галочка папки берёт саму папку И все её слоты (решение владельца).
  const keys = [docFolderKey(folder.folder_id), ...folder.slots.map((s) => docSlotKey(s.slot_id))]
  const selCount = keys.filter((k) => selected.has(k)).length
  const state: boolean | 'indeterminate' =
    selCount === 0 ? false : selCount === keys.length ? true : 'indeterminate'
  const slotIds = folder.slots.map((s) => docSlotKey(s.slot_id))
  // «Выбрать все» (hover) — только СЛОТЫ, сама папка не трогается: жирный
  // заголовок в сообщении не нужен, когда хочется просто перечислить документы.
  const allSlotsSelected = slotIds.length > 0 && slotIds.every((k) => selected.has(k))

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-50')}
    >
      <div className="group/row flex items-center gap-1.5 rounded-md py-1 pl-3 pr-2 hover:bg-accent/60">
        <DragHandle attributes={attributes} listeners={listeners} disabled={disabled} />
        <Checkbox
          checked={state}
          onCheckedChange={() => onSetSelected(keys, selCount !== keys.length)}
          aria-label="Выбрать папку и все документы внутри"
        />
        {/* Номер папки в сообщение не идёт (она жирный заголовок), но задаёт
            первую цифру своих слотов — поэтому правится. */}
        {numbered && (
          <NumberBadge
            value={numberOf(docFolderKey(folder.folder_id))}
            onCommit={(v) => onSetNumber(docFolderKey(folder.folder_id), v)}
          />
        )}
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform',
              expanded && 'rotate-90',
            )}
          />
          <span className="truncate text-sm font-medium">{folder.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
            {folder.slots.length}
          </span>
        </button>
        {slotIds.length > 0 && (
          <button
            type="button"
            onClick={() => onSetSelected(slotIds, !allSlotsSelected)}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-100 transition-opacity hover:bg-accent hover:text-foreground md:opacity-0 md:group-hover/row:opacity-100"
          >
            {allSlotsSelected ? 'Снять все' : 'Выбрать все'}
          </button>
        )}
        {renderActions(folder.name, folder.article_id, folder.token)}
      </div>

      {expanded && (
        <SortableContext items={slotIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {folder.slots.map((slot) => (
              <SortableSlotRow
                key={slot.slot_id}
                slot={slot}
                disabled={disabled}
                selected={selected.has(docSlotKey(slot.slot_id))}
                number={numberOf(docSlotKey(slot.slot_id))}
                numbered={numbered}
                struck={strikeUploaded && slot.has_document}
                onToggle={() => onToggle(docSlotKey(slot.slot_id))}
                onSetNumber={(v) => onSetNumber(docSlotKey(slot.slot_id), v)}
                onInsertOne={() =>
                  onInsertOne(
                    slot.name,
                    slot.article_id,
                    slot.token,
                    strikeUploaded && slot.has_document,
                  )
                }
                renderActions={renderActions}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  )
}

export function DocTreeView({
  tree,
  selected,
  numberOf,
  onToggle,
  onSetSelected,
  onSetNumber,
  onReorderFolders,
  onReorderSlots,
  expandedFolders,
  collapsedKits,
  onToggleFolder,
  onToggleKit,
  forceExpand,
  numbered,
  strikeUploaded,
  onInsertOne,
  renderActions,
}: Props) {
  // distance 5 — иначе обычный клик по строке считался бы началом перетаскивания.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  /** Папка, которой принадлежит слот — чтобы бросок папки на слот не пропадал. */
  const folderKeyOwning = (slotKey: string): string | null => {
    const folder = tree
      .flatMap((k) => k.folders)
      .find((f) => f.slots.some((s) => docSlotKey(s.slot_id) === slotKey))
    return folder ? docFolderKey(folder.folder_id) : null
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    let overId = String(over.id)

    // Тащим папку, а под курсором слот развёрнутой папки — целимся в его папку.
    if (activeId.startsWith('fold:') && overId.startsWith('slot:')) {
      overId = folderKeyOwning(overId) ?? overId
      if (overId === activeId) return
    }

    if (activeId.startsWith('fold:') && overId.startsWith('fold:')) {
      const kit = tree.find((k) => k.folders.some((f) => docFolderKey(f.folder_id) === activeId))
      if (!kit) return
      const ids = kit.folders.map((f) => docFolderKey(f.folder_id))
      const from = ids.indexOf(activeId)
      const to = ids.indexOf(overId)
      // Папка из другого набора — не наше дело.
      if (from < 0 || to < 0) return
      onReorderFolders(
        kit.kit_id,
        arrayMove(ids, from, to).map((id) => id.slice(5)),
      )
      return
    }

    if (activeId.startsWith('slot:') && overId.startsWith('slot:')) {
      const folder = tree
        .flatMap((k) => k.folders)
        .find((f) => f.slots.some((s) => docSlotKey(s.slot_id) === activeId))
      if (!folder) return
      const ids = folder.slots.map((s) => docSlotKey(s.slot_id))
      const from = ids.indexOf(activeId)
      const to = ids.indexOf(overId)
      // Слот другой папки — переносить документы между папками отсюда нельзя.
      if (from < 0 || to < 0) return
      onReorderSlots(
        folder.folder_id,
        arrayMove(ids, from, to).map((id) => id.slice(5)),
      )
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-0">
        {tree.map((kit) => {
          const kitExpanded = forceExpand || !collapsedKits.has(kit.kit_id)
          const folderIds = kit.folders.map((f) => docFolderKey(f.folder_id))
          return (
            <div key={kit.kit_id}>
              <button
                type="button"
                onClick={() => onToggleKit(kit.kit_id)}
                className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent/60"
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform',
                    kitExpanded && 'rotate-90',
                  )}
                />
                <span className="truncate text-[15px] font-semibold uppercase">{kit.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
                  {kit.folders.length}
                </span>
              </button>
              {kitExpanded && (
                <SortableContext items={folderIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0">
                    {kit.folders.map((folder) => (
                      <SortableFolder
                        key={folder.folder_id}
                        folder={folder}
                        // При поиске список отфильтрован — перестановка врала бы.
                        disabled={forceExpand}
                        expanded={forceExpand || expandedFolders.has(folder.folder_id)}
                        selected={selected}
                        numberOf={numberOf}
                        numbered={numbered}
                        strikeUploaded={strikeUploaded}
                        onToggle={onToggle}
                        onSetSelected={onSetSelected}
                        onSetNumber={onSetNumber}
                        onToggleExpand={() => onToggleFolder(folder.folder_id)}
                        onInsertOne={onInsertOne}
                        renderActions={renderActions}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          )
        })}
      </div>
    </DndContext>
  )
}
