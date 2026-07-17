/**
 * Сборка вставки для вкладки «Описания документов» (пикер «молнии»).
 *
 * Два шага, разделённые намеренно: план строится синхронно на дереве, а токены
 * ссылок резолвятся вызывающим (ensureToken — сеть) уже поверх готового плана.
 *
 * Правила вставки (согласованы с владельцем):
 * - Порядок = как во вкладке «Документы». Клик по чекбоксу НЕ влияет на порядок
 *   (раньше влиял) — иначе номер зависел бы от скрытой истории кликов.
 *   Переставить можно перетаскиванием: folderOrder/slotOrder.
 * - Папка отмечена → она жирный заголовок БЕЗ номера, её отмеченные слоты
 *   вложены (1.1, 1.2). Первая цифра — позиция папки, даже когда не напечатана.
 * - Папка НЕ отмечена → её слоты сами становятся верхним уровнем (1., 2.) на
 *   месте своей папки.
 * - Нумеруется только отмеченное, подряд и без дыр.
 * - Номер можно переопределить (docInsertNumbers overrides): «начни с 3» сдвигает
 *   этот пункт и все следующие. Нужно, чтобы дописывать в уже набранное сообщение.
 * - Есть статья → кликабельная ссылка, нет → просто название.
 *
 * Типы входа описаны структурно (а не импортом из services), чтобы слой lib не
 * зависел от слоя сервисов; ShareableDocKit подходит по форме.
 */

import { escapeHtml } from '@/lib/html'

type SlotLike = {
  slot_id: string
  name: string
  article_id: string | null
  token: string | null
  /** Документ уже загружен в слот (см. режимы uploadedDisplay). */
  has_document?: boolean
}
type FolderLike = {
  folder_id: string
  name: string
  article_id: string | null
  token: string | null
  slots: SlotLike[]
}
type KitLike = { kit_id: string; folders: FolderLike[] }

/** Ключи выбора (общий Set пикера, рядом с art:/ext: других вкладок). */
export const docFolderKey = (folderId: string) => `fold:${folderId}`
export const docSlotKey = (slotId: string) => `slot:${slotId}`

/** Узел плана: ссылка ещё не построена — известны только статья и её токен. */
export type DocPlanNode = {
  key: string
  label: string
  articleId: string | null
  token: string | null
  /** Готовый адрес (внешние ссылки) — тогда статья не нужна. */
  url?: string | null
  /** Папка: в сообщении идёт жирным заголовком и без номера. */
  isFolder?: boolean
  /** Слот с загруженным документом (кандидат на зачёркивание). */
  hasDocument?: boolean
  children: DocPlanNode[]
}

/** Узел готовой вставки: url резолвлен (null — вставляем просто название). */
export type DocInsertNode = {
  label: string
  url: string | null
  /** Номер из docInsertNumbers («1», «1.1»). У папки не печатается. */
  number?: string | null
  isFolder?: boolean
  /** Зачеркнуть в сообщении (режим «Зачёркивать» для загруженных документов). */
  struck?: boolean
  children: DocInsertNode[]
}

/**
 * Резолвер ключей чужих вкладок (art:/ext:) — они не в дереве, поэтому идут
 * после него, в порядке отметки.
 */
export type DocPlanExtra = (key: string) => Omit<DocPlanNode, 'key' | 'children'> | null

/** Пользовательские перестановки (перетаскивание). Ключ → список id в нужном порядке. */
export type DocOrder = {
  /** kit_id → folder_id[] */
  folders?: Record<string, string[]>
  /** folder_id → slot_id[] */
  slots?: Record<string, string[]>
}

export type DocPlanOptions = {
  resolveExtra?: DocPlanExtra
}

/**
 * Что делать с пунктами, где документ уже загружен:
 * keep — как обычно, strike — зачёркивать, hide — не показывать вовсе
 * (остаётся «что осталось прислать»).
 */
export type UploadedDisplay = 'keep' | 'strike' | 'hide'

/**
 * Режим hide: выкинуть из дерева слоты с загруженным документом. Применяется и
 * к списку, и к плану вставки — список остаётся точным превью сообщения.
 */
export function hideUploadedSlots<K extends KitLike>(kits: K[]): K[] {
  return kits.map((kit) => ({
    ...kit,
    folders: kit.folders.map((f) => ({
      ...f,
      slots: f.slots.filter((s) => !s.has_document),
    })),
  }))
}

export type DocInsertFormat = { hideUnderText: boolean; numbered: boolean }

/**
 * Применить перестановки ко всему дереву — тем же кодом, что и план вставки.
 * Список в попапе рисуется из результата, поэтому порядок на экране и порядок в
 * сообщении не могут разойтись.
 */
export function applyDocOrder<K extends KitLike>(kits: K[], order: DocOrder | undefined): K[] {
  if (!order) return kits
  return kits.map((kit) => ({
    ...kit,
    folders: applyOrder(kit.folders, (f) => f.folder_id, order.folders?.[kit.kit_id]).map((f) => ({
      ...f,
      slots: applyOrder(f.slots, (s) => s.slot_id, order.slots?.[f.folder_id]),
    })),
  }))
}

/** Переставить по заданному порядку; чего нет в порядке — остаётся в хвосте. */
function applyOrder<T>(items: T[], idOf: (item: T) => string, order: string[] | undefined): T[] {
  if (!order || order.length === 0) return items
  const rank = new Map(order.map((id, i) => [id, i]))
  return items
    .map((item, i) => ({ item, i, r: rank.get(idOf(item)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item)
}

const planNode = (
  key: string,
  label: string,
  articleId: string | null,
  token: string | null,
): DocPlanNode => ({ key, label, articleId, token, children: [] })

/**
 * Разложить отмеченное в блоки верхнего уровня — В ПОРЯДКЕ ПЕРЕДАННОГО ДЕРЕВА.
 * Перестановки применяет applyDocOrder ДО вызова: так порядок на экране и в
 * сообщении заведомо один и тот же (список рисуется из того же дерева).
 * Ключи вне дерева (art:/ext:) разбирает resolveExtra и они идут следом, в
 * порядке отметки (selectedKeys); без резолвера — пропускаются.
 */
export function planDocInsert(
  kits: KitLike[],
  selectedKeys: string[],
  { resolveExtra }: DocPlanOptions = {},
): DocPlanNode[] {
  const selected = new Set(selectedKeys)
  const out: DocPlanNode[] = []

  for (const kit of kits) {
    for (const folder of kit.folders) {
      const picked = folder.slots.filter((s) => selected.has(docSlotKey(s.slot_id)))
      const slotNodes = picked.map((s) => ({
        ...planNode(docSlotKey(s.slot_id), s.name, s.article_id, s.token),
        hasDocument: !!s.has_document,
      }))

      if (selected.has(docFolderKey(folder.folder_id))) {
        out.push({
          ...planNode(docFolderKey(folder.folder_id), folder.name, folder.article_id, folder.token),
          isFolder: true,
          children: slotNodes,
        })
      } else {
        // Заголовка не будет — слоты идут сами по себе, на месте своей папки.
        out.push(...slotNodes)
      }
    }
  }

  if (resolveExtra) {
    for (const key of selectedKeys) {
      if (key.startsWith('fold:') || key.startsWith('slot:')) continue
      const extra = resolveExtra(key)
      if (extra) out.push({ key, ...extra, children: [] })
    }
  }

  return out
}

/**
 * Номера, которые узлы получат В СООБЩЕНИИ: ключ → «1» / «1.1».
 * Единый источник со списком и вставкой, иначе номер в квадратике разъедется с
 * номером в тексте.
 *
 * overrides — ручная правка («начни с 3»): сдвигает узел и всех следующих на
 * своём уровне. Номер папки в сообщение не попадает (она жирный заголовок), но
 * задаёт первую цифру своих слотов — поэтому править его осмысленно.
 */
export function docInsertNumbers(
  nodes: DocPlanNode[],
  overrides: Record<string, number> = {},
): Map<string, string> {
  const map = new Map<string, string>()
  let top = 1
  for (const node of nodes) {
    const ov = overrides[node.key]
    if (ov && ov > 0) top = ov
    map.set(node.key, `${top}`)

    let child = 1
    for (const c of node.children) {
      const cov = overrides[c.key]
      if (cov && cov > 0) child = cov
      map.set(c.key, `${top}.${child}`)
      child++
    }
    top++
  }
  return map
}

const htmlLine = (node: DocInsertNode, prefix: string, hideUnderText: boolean): string => {
  const text = escapeHtml(node.label)
  const label = node.isFolder ? `<strong>${text}</strong>` : text
  // Зачёркивается вся строка (вместе со ссылкой) — целиком «сделано».
  const wrap = (s: string) => (node.struck ? `<s>${s}</s>` : s)
  if (!node.url) return `${prefix}${wrap(label)}`
  const url = escapeHtml(node.url)
  return hideUnderText
    ? `${prefix}${wrap(`<a href="${url}">${label}</a>`)}`
    : `${prefix}${wrap(label)}<br>${wrap(`<a href="${url}">${url}</a>`)}`
}

const plainLine = (node: DocInsertNode, prefix: string, hideUnderText: boolean): string => {
  if (!node.url || hideUnderText) return `${prefix}${node.label}`
  return `${prefix}${node.label}\n${node.url}`
}

/** Папка — заголовок: номер не печатается (он живёт в номерах её слотов). */
const prefixOf = (node: DocInsertNode, numbered: boolean): string =>
  numbered && node.number && !node.isFolder ? `${node.number}. ` : ''

/**
 * Общий обход: соединяет блоки и их детей.
 * Пустая строка между соседями верхнего уровня — только если хотя бы у одного
 * есть дети (иначе плоский список слотов раздувался бы пустыми строками).
 */
function render(
  nodes: DocInsertNode[],
  { hideUnderText, numbered }: DocInsertFormat,
  line: (node: DocInsertNode, prefix: string, hideUnderText: boolean) => string,
  br: string,
  blank: string,
): string {
  const blocks = nodes.map((node) => {
    const head = line(node, prefixOf(node, numbered), hideUnderText)
    if (node.children.length === 0) return head
    const kids = node.children.map((child) => line(child, prefixOf(child, numbered), hideUnderText))
    return [head, ...kids].join(hideUnderText ? br : blank)
  })

  return blocks.reduce((acc, block, i) => {
    if (i === 0) return block
    const gap = nodes[i - 1].children.length > 0 || nodes[i].children.length > 0 || !hideUnderText
    return acc + (gap ? blank : br) + block
  }, '')
}

export const buildDocTreeHtml = (nodes: DocInsertNode[], format: DocInsertFormat): string =>
  render(nodes, format, htmlLine, '<br>', '<br><br>')

export const buildDocTreePlain = (nodes: DocInsertNode[], format: DocInsertFormat): string =>
  render(nodes, format, plainLine, '\n', '\n\n')
