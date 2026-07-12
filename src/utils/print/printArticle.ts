/**
 * Печать статьи базы знаний в PDF через скрытый iframe.
 * Клон DOM сохраняет текущее состояние раскрытых <details> (аккордеонов).
 */

import { escapeHtml } from '@/lib/html'

const PRINT_STYLES = `
  @page { margin: 16mm; }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
  }

  .article {
    max-width: 100%;
    word-wrap: break-word;
  }

  .article > h1:first-child,
  .article > h2:first-child,
  .article > p:first-child { margin-top: 0; }

  h1 { font-size: 22pt; font-weight: 700; margin: 18pt 0 10pt; }
  h2 { font-size: 17pt; font-weight: 600; margin: 16pt 0 8pt; }
  h3 { font-size: 14pt; font-weight: 600; margin: 14pt 0 6pt; }
  h4, h5, h6 { font-weight: 600; margin: 12pt 0 6pt; }

  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 22pt; }
  li { margin-bottom: 2pt; }
  li > p { margin: 0; }

  a { color: #1d4ed8; text-decoration: underline; word-break: break-word; }

  blockquote {
    border-left: 3pt solid #cbd5e1;
    padding-left: 10pt;
    margin: 10pt 0;
    color: #475569;
    font-style: italic;
  }

  code {
    background: #f1f5f9;
    padding: 1pt 4pt;
    border-radius: 3pt;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 10pt;
  }

  pre {
    background: #f1f5f9;
    padding: 8pt 10pt;
    border-radius: 4pt;
    overflow: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 9.5pt;
    margin: 10pt 0;
  }
  pre code { background: none; padding: 0; font-size: inherit; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0;
    page-break-inside: avoid;
  }
  th, td {
    border: 0.5pt solid #cbd5e1;
    padding: 5pt 7pt;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f1f5f9; font-weight: 600; }
  th p, td p { margin: 0; }

  img {
    max-width: 100%;
    height: auto;
    border-radius: 4pt;
    margin: 8pt 0;
    page-break-inside: avoid;
    display: block;
  }

  hr { border: none; border-top: 0.5pt solid #cbd5e1; margin: 14pt 0; }

  /* Tiptap accordion: <details data-type="accordion"> */
  details {
    border: 0.5pt solid #cbd5e1;
    border-radius: 4pt;
    margin: 8pt 0;
    padding: 0;
    page-break-inside: avoid;
  }
  details > summary {
    list-style: none;
    padding: 6pt 10pt;
    background: #f8fafc;
    font-weight: 600;
    cursor: default;
  }
  details > summary::-webkit-details-marker { display: none; }
  details[open] > summary { border-bottom: 0.5pt solid #cbd5e1; }
  details .accordion-content,
  details > div { padding: 8pt 10pt; }
  details:not([open]) > *:not(summary) { display: none; }

  /* Tiptap callout: <div data-type="callout" data-color="..."> */
  [data-type="callout"] {
    border-left: 3pt solid #94a3b8;
    background: #f8fafc;
    padding: 8pt 12pt;
    border-radius: 4pt;
    margin: 10pt 0;
    page-break-inside: avoid;
  }
  [data-type="callout"][data-color="blue"]   { border-color: #3b82f6; background: #eff6ff; }
  [data-type="callout"][data-color="green"]  { border-color: #22c55e; background: #f0fdf4; }
  [data-type="callout"][data-color="yellow"] { border-color: #eab308; background: #fefce8; }
  [data-type="callout"][data-color="red"]    { border-color: #ef4444; background: #fef2f2; }
  [data-type="callout"][data-color="gray"]   { border-color: #94a3b8; background: #f8fafc; }
  [data-type="callout"] p:last-child { margin-bottom: 0; }

  /* Tiptap columns: <div data-type="columns"> > <div data-type="column"> */
  [data-type="columns"] {
    display: flex;
    gap: 12pt;
    margin: 10pt 0;
  }
  [data-type="column"] { flex: 1; min-width: 0; }

  /* Tiptap image-block: <figure data-type="image-block"> с inline width / box-shadow
     — на печати inline-стили перебиваем !important, иначе картинка из <li>
     сжимается до 60% от узкой колонки и наезжает на соседние блоки. */
  figure[data-type="image-block"],
  [data-type="image-block"] {
    display: block !important;
    width: auto !important;
    max-width: 100% !important;
    margin: 12pt 0 !important;
    box-shadow: none !important;
    page-break-inside: avoid;
    clear: both;
  }
  [data-type="image-block"] img { margin: 0; max-width: 100%; }

  /* Все блочные конструкции редактора — каждый своим потоком, чтобы соседние
     не накладывались при печати. */
  [data-type="callout"],
  details,
  blockquote,
  pre,
  table,
  figure {
    clear: both;
    page-break-inside: avoid;
  }

  /* Картинки и блоки внутри списков: дать им полную ширину пункта, отделить
     от соседних абзацев пустотой сверху/снизу. */
  li > figure,
  li > [data-type="image-block"],
  li > [data-type="callout"],
  li > details {
    width: auto !important;
    max-width: 100%;
    margin-top: 8pt;
    margin-bottom: 8pt;
  }

  /* Кнопки/контролы из NodeViewWrapper в редакторе сюда не попадают (рендер
     через dangerouslySetInnerHTML отдаёт только сериализованный HTML), но
     на всякий случай скрываем интерактивные элементы. */
  button, .no-print { display: none !important; }
`

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images)
  if (images.length === 0) return Promise.resolve()

  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalHeight !== 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }),
    ),
  ).then(() => undefined)
}

/**
 * Открывает диалог печати браузера с контентом статьи. Пользователь сам
 * выбирает «Сохранить как PDF» в системном диалоге.
 *
 * @param contentEl исходный DOM-узел статьи (живой — текущее состояние
 *   раскрытых аккордеонов сохранится в клоне).
 * @param title заголовок PDF (попадёт в `<title>` страницы и в имя файла
 *   по умолчанию).
 */
export async function printArticleToPdf(contentEl: HTMLElement, title: string): Promise<void> {
  const clone = contentEl.cloneNode(true) as HTMLElement
  clone.className = 'article'

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
<div id="article-root"></div>
</body>
</html>`)
  doc.close()

  const root = doc.getElementById('article-root')
  if (root) root.appendChild(clone)

  await waitForImages(doc)

  const cleanup = () => {
    // Маленькая задержка, чтобы Safari/Chrome успели отрисовать диалог.
    setTimeout(() => iframe.remove(), 500)
  }

  const win = iframe.contentWindow
  if (!win) {
    cleanup()
    return
  }

  win.addEventListener('afterprint', cleanup, { once: true })

  try {
    win.focus()
    win.print()
  } catch {
    cleanup()
  }
}
