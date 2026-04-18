// Edge Function: экспорт проекта в Google Doc.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExportTextRun { text: string; bold?: boolean; italic?: boolean }
interface ExportParagraph { type: 'paragraph'; runs: ExportTextRun[] }
interface ExportHeading { type: 'heading'; level: 1 | 2 | 3 | 4 | 5; text: string }
interface ExportTableRowStyle { bold?: boolean; bgColor?: string }
interface ExportTable {
  type: 'table'
  headers: string[]
  rows: string[][]
  rowStyles?: ExportTableRowStyle[]
  zebraStripe?: boolean
}
interface ExportImage { type: 'image'; url: string; caption?: string }
interface ExportTOC { type: 'toc' }
interface ExportPageBreak { type: 'pageBreak' }
type ExportElement = ExportParagraph | ExportHeading | ExportTable | ExportImage | ExportTOC | ExportPageBreak

interface ExportPayload { document_title: string; elements: ExportElement[] }
interface RequestBody { document_id: string; access_token: string; payload: ExportPayload }

type DocsRequest = Record<string, unknown>

const PAGE_USABLE_WIDTH_PT = 468
const BORDER_COLOR_HEX = 'D1D5DB'
const HEADER_BG_HEX = 'E5E7EB'
const CELL_FONT_SIZE_PT = 11
const EMPTY_ROW_FONT_SIZE_PT = 2
const CELL_PADDING_PT = 3
const EMPTY_ROW_PADDING_PT = 0

function makeInsertText(index: number, text: string): DocsRequest {
  return { insertText: { location: { index }, text } }
}
function makeUpdateParagraphStyle(start: number, end: number, namedStyleType: string): DocsRequest {
  return { updateParagraphStyle: { range: { startIndex: start, endIndex: end }, paragraphStyle: { namedStyleType }, fields: 'namedStyleType' } }
}
function makeUpdateTextStyle(start: number, end: number, style: { bold?: boolean; italic?: boolean; fontSize?: number }): DocsRequest {
  const fields: string[] = []
  const textStyle: Record<string, unknown> = {}
  if ('bold' in style) { fields.push('bold'); textStyle.bold = style.bold }
  if ('italic' in style) { fields.push('italic'); textStyle.italic = style.italic }
  if ('fontSize' in style && style.fontSize !== undefined) {
    fields.push('fontSize')
    textStyle.fontSize = { magnitude: style.fontSize, unit: 'PT' }
  }
  return { updateTextStyle: { range: { startIndex: start, endIndex: end }, textStyle, fields: fields.join(',') } }
}
function makeInsertPageBreak(index: number): DocsRequest {
  return { insertPageBreak: { location: { index } } }
}
function makeInsertTable(index: number, rows: number, columns: number): DocsRequest {
  return { insertTable: { location: { index }, rows, columns } }
}
function makeInsertImage(index: number, url: string): DocsRequest {
  return { insertInlineImage: { location: { index }, uri: url } }
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return { red: r, green: g, blue: b }
}

function makeUpdateTableCellStyle(
  tableStartIndex: number,
  rowIndex: number,
  columnIndex: number,
  bgColorHex: string | null,
  withBorders: boolean,
  paddingPt: number
): DocsRequest {
  const tableCellStyle: Record<string, unknown> = {}
  const fieldsList: string[] = []

  if (bgColorHex) {
    tableCellStyle.backgroundColor = { color: { rgbColor: hexToRgb(bgColorHex) } }
    fieldsList.push('backgroundColor')
  }

  if (withBorders) {
    const border = {
      color: { color: { rgbColor: hexToRgb(BORDER_COLOR_HEX) } },
      width: { magnitude: 0.75, unit: 'PT' },
      dashStyle: 'SOLID',
    }
    tableCellStyle.borderTop = border
    tableCellStyle.borderBottom = border
    tableCellStyle.borderLeft = border
    tableCellStyle.borderRight = border
    fieldsList.push('borderTop', 'borderBottom', 'borderLeft', 'borderRight')
  }

  tableCellStyle.paddingTop = { magnitude: paddingPt, unit: 'PT' }
  tableCellStyle.paddingBottom = { magnitude: paddingPt, unit: 'PT' }
  tableCellStyle.paddingLeft = { magnitude: paddingPt + 2, unit: 'PT' }
  tableCellStyle.paddingRight = { magnitude: paddingPt + 2, unit: 'PT' }
  fieldsList.push('paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight')

  return {
    updateTableCellStyle: {
      tableCellStyle,
      fields: fieldsList.join(','),
      tableRange: {
        tableCellLocation: {
          tableStartLocation: { index: tableStartIndex },
          rowIndex,
          columnIndex,
        },
        rowSpan: 1,
        columnSpan: 1,
      },
    },
  }
}

function makeUpdateTableColumnWidth(
  tableStartIndex: number,
  columnIndices: number[],
  widthPt: number
): DocsRequest {
  return {
    updateTableColumnProperties: {
      tableStartLocation: { index: tableStartIndex },
      columnIndices,
      tableColumnProperties: {
        widthType: 'FIXED_WIDTH',
        width: { magnitude: widthPt, unit: 'PT' },
      },
      fields: 'widthType,width',
    },
  }
}

function makeUpdateTableRowMinHeight(
  tableStartIndex: number,
  rowIndices: number[],
  heightPt: number
): DocsRequest {
  return {
    updateTableRowStyle: {
      tableStartLocation: { index: tableStartIndex },
      rowIndices,
      tableRowStyle: {
        minRowHeight: { magnitude: heightPt, unit: 'PT' },
      },
      fields: 'minRowHeight',
    },
  }
}

function makeCompactCellParagraph(start: number, end: number): DocsRequest {
  return {
    updateParagraphStyle: {
      range: { startIndex: start, endIndex: end },
      paragraphStyle: {
        spaceAbove: { magnitude: 0, unit: 'PT' },
        spaceBelow: { magnitude: 0, unit: 'PT' },
        lineSpacing: 100,
      },
      fields: 'spaceAbove,spaceBelow,lineSpacing',
    },
  }
}

function headingStyleType(level: number): string {
  switch (level) {
    case 1: return 'HEADING_1'
    case 2: return 'HEADING_2'
    case 3: return 'HEADING_3'
    case 4: return 'HEADING_4'
    case 5: return 'HEADING_5'
    default: return 'NORMAL_TEXT'
  }
}

async function batchUpdate(documentId: string, accessToken: string, requests: DocsRequest[]): Promise<void> {
  if (requests.length === 0) return
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`batchUpdate failed (${res.status}): ${err}`)
  }
}

async function getDocumentEndIndex(documentId: string, accessToken: string): Promise<number> {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`documents.get failed: ${await res.text()}`)
  const doc = await res.json()
  let endIndex = 1
  for (const el of (doc.body?.content ?? []) as Array<Record<string, unknown>>) {
    if (typeof el.endIndex === 'number') endIndex = Math.max(endIndex, el.endIndex)
  }
  return endIndex
}

interface DocCellPos { startIndex: number; endIndex: number }
interface DocTablePos { startIndex: number; rows: { cells: DocCellPos[] }[] }

async function getDocumentTables(documentId: string, accessToken: string): Promise<DocTablePos[]> {
  const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!docRes.ok) throw new Error(`getDocumentTables: ${await docRes.text()}`)
  const doc = await docRes.json()

  const docTables: DocTablePos[] = []
  for (const el of (doc.body?.content ?? []) as Array<Record<string, unknown>>) {
    if (el.table) {
      const t = el.table as { tableRows: Array<{ tableCells: Array<{ content: Array<{ startIndex: number; endIndex: number }> }> }> }
      docTables.push({
        startIndex: (el.startIndex as number) ?? 0,
        rows: t.tableRows.map((row) => ({
          cells: row.tableCells.map((cell) => ({
            startIndex: cell.content[0]?.startIndex ?? 0,
            endIndex: cell.content[cell.content.length - 1]?.endIndex ?? 0,
          })),
        })),
      })
    }
  }
  return docTables
}

function buildNonTableBatch(elements: ExportElement[], startCursor: number): { requests: DocsRequest[]; insertedLength: number } {
  const insertAndParagraph: DocsRequest[] = []
  const textStyles: DocsRequest[] = []
  let cursor = startCursor

  for (const el of elements) {
    if (el.type === 'pageBreak') {
      insertAndParagraph.push(makeInsertPageBreak(cursor))
      cursor += 1
      continue
    }
    if (el.type === 'toc') continue

    if (el.type === 'heading') {
      const text = (el.text || '') + '\n'
      insertAndParagraph.push(makeInsertText(cursor, text))
      insertAndParagraph.push(makeUpdateParagraphStyle(cursor, cursor + text.length, headingStyleType(el.level)))
      cursor += text.length
      continue
    }

    if (el.type === 'paragraph') {
      const nonEmptyRuns = el.runs.filter((r) => r.text && r.text.length > 0)
      const fullText = nonEmptyRuns.map((r) => r.text).join('') + '\n'
      if (fullText === '\n') {
        insertAndParagraph.push(makeInsertText(cursor, '\n'))
        cursor += 1
        continue
      }
      insertAndParagraph.push(makeInsertText(cursor, fullText))
      insertAndParagraph.push(makeUpdateParagraphStyle(cursor, cursor + fullText.length, 'NORMAL_TEXT'))

      let runCursor = cursor
      for (const run of nonEmptyRuns) {
        const start = runCursor
        const end = runCursor + run.text.length
        if (end <= start) continue
        if (run.bold || run.italic) {
          const style: { bold?: boolean; italic?: boolean } = {}
          if (run.bold) style.bold = true
          if (run.italic) style.italic = true
          textStyles.push(makeUpdateTextStyle(start, end, style))
        }
        runCursor = end
      }
      cursor += fullText.length
      continue
    }

    if (el.type === 'image') {
      insertAndParagraph.push(makeInsertImage(cursor, el.url))
      cursor += 1
      insertAndParagraph.push(makeInsertText(cursor, '\n'))
      cursor += 1
      if (el.caption) {
        const cap = el.caption + '\n'
        insertAndParagraph.push(makeInsertText(cursor, cap))
        cursor += cap.length
      }
      continue
    }

    if (el.type === 'table') {
      throw new Error('buildNonTableBatch: получена таблица')
    }
  }

  return {
    requests: [...insertAndParagraph, ...textStyles],
    insertedLength: cursor - startCursor,
  }
}

function calcColumnWidths(numCols: number): number[] {
  if (numCols === 1) return [PAGE_USABLE_WIDTH_PT]
  const totalShares = 2 + (numCols - 1)
  const unit = PAGE_USABLE_WIDTH_PT / totalShares
  const widths = new Array(numCols).fill(unit)
  widths[0] = unit * 2
  return widths
}

function isEmptyDataRow(rowCells: string[]): boolean {
  return rowCells.every((c) => !c || c.trim() === '')
}

async function fillTableCellsAndStyle(documentId: string, accessToken: string, tables: ExportTable[]): Promise<void> {
  if (tables.length === 0) return

  let docTables = await getDocumentTables(documentId, accessToken)

  if (docTables.length !== tables.length) {
    console.warn(`[gdocs-export] table count mismatch: doc=${docTables.length}, payload=${tables.length}`)
  }

  const totalTables = Math.min(docTables.length, tables.length)

  const insertReqs: DocsRequest[] = []
  for (let i = totalTables - 1; i >= 0; i--) {
    const docTable = docTables[i]
    const sourceTable = tables[i]

    for (let r = docTable.rows.length - 1; r >= 0; r--) {
      const docRow = docTable.rows[r]
      const isHeader = r === 0
      const sourceCells: string[] = isHeader ? sourceTable.headers : (sourceTable.rows[r - 1] ?? [])

      for (let c = docRow.cells.length - 1; c >= 0; c--) {
        const text = sourceCells[c] ?? ''
        if (!text) continue
        insertReqs.push(makeInsertText(docRow.cells[c].startIndex, text))
      }
    }
  }

  if (insertReqs.length > 0) {
    await batchUpdateChunked(documentId, accessToken, insertReqs)
  }

  try {
    await collapseEmptyParagraphsBeforeTables(documentId, accessToken)
  } catch (e) {
    console.warn('[gdocs-export] collapseEmptyParagraphs failed:', e)
  }

  docTables = await getDocumentTables(documentId, accessToken)

  const styleReqs: DocsRequest[] = []

  for (let i = 0; i < Math.min(docTables.length, tables.length); i++) {
    const docTable = docTables[i]
    const sourceTable = tables[i]
    const numCols = docTable.rows[0]?.cells.length ?? 0
    const numRows = docTable.rows.length

    if (numCols > 0) {
      const widths = calcColumnWidths(numCols)
      for (let c = 0; c < numCols; c++) {
        styleReqs.push(makeUpdateTableColumnWidth(docTable.startIndex, [c], widths[c]))
      }
    }

    if (numRows > 0) {
      styleReqs.push(makeUpdateTableRowMinHeight(
        docTable.startIndex,
        Array.from({ length: numRows }, (_, k) => k),
        0,
      ))
    }

    for (let r = 0; r < numRows; r++) {
      const docRow = docTable.rows[r]
      const isHeader = r === 0
      const dataRowIdx = isHeader ? -1 : r - 1
      const sourceRowCells: string[] = isHeader ? sourceTable.headers : (sourceTable.rows[dataRowIdx] ?? [])
      const isEmptyRow = !isHeader && isEmptyDataRow(sourceRowCells)
      const customStyle = isHeader ? undefined : sourceTable.rowStyles?.[dataRowIdx]
      const rowBold = isHeader || customStyle?.bold || false
      const fontSize = isEmptyRow ? EMPTY_ROW_FONT_SIZE_PT : CELL_FONT_SIZE_PT

      let bgColor: string | null = null
      if (isHeader) {
        bgColor = HEADER_BG_HEX
      } else if (customStyle?.bgColor) {
        bgColor = customStyle.bgColor
      } else if (sourceTable.zebraStripe && dataRowIdx % 2 === 1) {
        bgColor = 'F9FAFB'
      }
      const padding = isEmptyRow ? EMPTY_ROW_PADDING_PT : CELL_PADDING_PT

      for (let c = 0; c < docRow.cells.length; c++) {
        const cell = docRow.cells[c]
        const start = cell.startIndex
        const end = cell.endIndex - 1

        if (end > start) {
          styleReqs.push(makeUpdateTextStyle(start, end, { fontSize, bold: rowBold }))
          styleReqs.push(makeCompactCellParagraph(cell.startIndex, cell.endIndex))
        }

        styleReqs.push(makeUpdateTableCellStyle(docTable.startIndex, r, c, bgColor, true, padding))
      }
    }
  }

  if (styleReqs.length > 0) {
    await batchUpdateChunked(documentId, accessToken, styleReqs)
  }
}

async function batchUpdateChunked(documentId: string, accessToken: string, reqs: DocsRequest[]): Promise<void> {
  const CHUNK = 500
  for (let i = 0; i < reqs.length; i += CHUNK) {
    await batchUpdate(documentId, accessToken, reqs.slice(i, i + CHUNK))
  }
}

async function collapseEmptyParagraphsBeforeTables(documentId: string, accessToken: string): Promise<void> {
  const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!docRes.ok) return
  const doc = await docRes.json()
  const content = (doc.body?.content ?? []) as Array<Record<string, unknown>>

  const reqs: DocsRequest[] = []
  for (let idx = 1; idx < content.length; idx++) {
    const el = content[idx]
    if (!el.table) continue
    const prev = content[idx - 1]
    if (!prev.paragraph) continue
    const para = prev.paragraph as { elements?: Array<{ textRun?: { content?: string } }> }
    const text = (para.elements ?? []).map((e) => e.textRun?.content ?? '').join('')
    if (text.trim() !== '') continue

    const startIndex = prev.startIndex as number
    const endIndex = prev.endIndex as number
    if (endIndex <= startIndex) continue

    reqs.push({
      updateTextStyle: {
        range: { startIndex, endIndex },
        textStyle: { fontSize: { magnitude: 1, unit: 'PT' } },
        fields: 'fontSize',
      },
    })
    reqs.push({
      updateParagraphStyle: {
        range: { startIndex, endIndex },
        paragraphStyle: {
          spaceAbove: { magnitude: 0, unit: 'PT' },
          spaceBelow: { magnitude: 0, unit: 'PT' },
          lineSpacing: 100,
        },
        fields: 'spaceAbove,spaceBelow,lineSpacing',
      },
    })
  }

  if (reqs.length > 0) {
    await batchUpdateChunked(documentId, accessToken, reqs)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body: RequestBody = await req.json()
    if (!body.document_id) throw new Error('document_id required')
    if (!body.access_token) throw new Error('access_token required')
    if (!body.payload) throw new Error('payload required')

    const accessToken = body.access_token
    const docId = body.document_id

    console.log('[gdocs-export] start, docId:', docId, 'elements:', body.payload.elements.length)

    let endIndex = await getDocumentEndIndex(docId, accessToken)
    if (endIndex > 2) {
      await batchUpdate(docId, accessToken, [
        { deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } },
      ])
    }

    let cursor = 1
    let pendingNonTable: ExportElement[] = []
    const tablesInOrder: ExportTable[] = []

    async function flushNonTable() {
      if (pendingNonTable.length === 0) return
      const { requests, insertedLength } = buildNonTableBatch(pendingNonTable, cursor)
      if (requests.length > 0) {
        const CHUNK = 500
        for (let i = 0; i < requests.length; i += CHUNK) {
          await batchUpdate(docId, accessToken, requests.slice(i, i + CHUNK))
        }
      }
      cursor += insertedLength
      pendingNonTable = []
    }

    for (const el of body.payload.elements) {
      if (el.type === 'table') {
        await flushNonTable()

        const rows = Math.max(el.rows.length + 1, 1)
        const cols = Math.max(el.headers.length, 1)
        await batchUpdate(docId, accessToken, [makeInsertTable(cursor, rows, cols)])
        tablesInOrder.push(el)

        const newEnd = await getDocumentEndIndex(docId, accessToken)
        cursor = newEnd - 1
        continue
      }
      pendingNonTable.push(el)
    }
    await flushNonTable()

    if (tablesInOrder.length > 0) {
      console.log(`[gdocs-export] filling/styling ${tablesInOrder.length} tables...`)
      await fillTableCellsAndStyle(docId, accessToken, tablesInOrder)
    }

    return new Response(JSON.stringify({ ok: true, document_id: docId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[gdocs-export] error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
