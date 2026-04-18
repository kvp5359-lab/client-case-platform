const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RowMetadata {
  hiddenByFilter?: boolean
  hiddenByUser?: boolean
}

interface SheetData {
  properties: { sheetId: number; title: string }
  data?: { rowMetadata?: RowMetadata[]; startRow?: number }[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { spreadsheetId, apiKey, gid, range } = await req.json() as {
      spreadsheetId: string
      apiKey: string
      gid?: string
      range?: string
    }

    if (!spreadsheetId || !apiKey) throw new Error('spreadsheetId and apiKey are required')

    const sheetGid = gid ?? '0'

    // Получаем метаданные + rowMetadata для определения скрытых строк
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&includeGridData=false&fields=sheets.properties,sheets.data.rowMetadata`
    const metaRes = await fetch(metaUrl)
    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({}))
      throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Ошибка API Google Sheets (${metaRes.status})`)
    }
    const meta = await metaRes.json() as { sheets: SheetData[] }
    const sheets = meta.sheets
    const targetSheet = sheets.find((s) => String(s.properties.sheetId) === sheetGid) ?? sheets[0]
    const sheetTitle = targetSheet.properties.title

    // Строим Set скрытых строк (0-based индексы)
    const hiddenRows = new Set<number>()
    const rowMetadata = targetSheet.data?.[0]?.rowMetadata ?? []
    const startRow = targetSheet.data?.[0]?.startRow ?? 0
    rowMetadata.forEach((rm, i) => {
      if (rm.hiddenByFilter || rm.hiddenByUser) {
        hiddenRows.add(startRow + i)
      }
    })

    // Определяем rangeSpec и startRowIndex диапазона
    let rangeSpec: string
    let rangeStartRow = 0

    if (range && !range.includes('!')) {
      rangeSpec = encodeURIComponent(`${sheetTitle}!${range}`)
      const rowMatch = range.match(/(\d+)/)
      if (rowMatch) rangeStartRow = parseInt(rowMatch[1]) - 1
    } else if (range) {
      rangeSpec = encodeURIComponent(range)
      const rowMatch = range.match(/!.*?(\d+)/)
      if (rowMatch) rangeStartRow = parseInt(rowMatch[1]) - 1
    } else {
      rangeSpec = encodeURIComponent(sheetTitle)
    }

    // Загружаем данные
    const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${rangeSpec}?key=${apiKey}`
    const dataRes = await fetch(dataUrl)
    if (!dataRes.ok) {
      const err = await dataRes.json().catch(() => ({}))
      throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Ошибка загрузки данных (${dataRes.status})`)
    }
    const data = await dataRes.json() as { values?: string[][] }
    const rawValues: string[][] = data.values ?? []

    if (rawValues.length === 0) {
      return new Response(
        JSON.stringify({ headers: [], rows: [], rawValues: [], sheetTitle }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const headers = rawValues[0].map((h) => String(h ?? '').trim())

    // Фильтруем строки: пропускаем скрытые
    const rows: Record<string, string>[] = []
    rawValues.slice(1).forEach((row, i) => {
      const absoluteRowIndex = rangeStartRow + 1 + i
      if (hiddenRows.has(absoluteRowIndex)) return
      const obj: Record<string, string> = {}
      headers.forEach((h, ci) => { obj[h] = String(row[ci] ?? '').trim() })
      rows.push(obj)
    })

    return new Response(
      JSON.stringify({ headers, rows, rawValues, sheetTitle }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
