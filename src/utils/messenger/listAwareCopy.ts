/**
 * Восстановление обёртки списка при копировании из ленты сообщений.
 *
 * Проблема: когда пользователь выделяет мышью ПУНКТЫ списка (а не сам элемент
 * `<ol>`/`<ul>`), `range.cloneContents()` возвращает «сиротские» `<li>` БЕЗ
 * родителя:
 *   `<li><p>Барселона</p></li><li><p>Мадрид</p></li>…`
 * ProseMirror (tiptap) при вставке таких сирот оборачивает их в список
 * ДЕФОЛТНОГО типа — bulletList (`<ul>`), из-за чего нумерованный список
 * вставляется маркированным (точками). Тип списка теряется уже в буфере.
 *
 * Фикс: если ВСЕ элементы верхнего уровня клонированного фрагмента — `<li>`,
 * оборачиваем их в правильный тег (`<ol>`/`<ul>`, определяем по ближайшему
 * списку-предку выделения) с сохранением `start` (если выделение начинается не
 * с первого пункта). Вызывать после `cloneContents`, до чтения `innerHTML`.
 */
export function wrapOrphanListItems(container: HTMLElement, range: Range) {
  const elemChildren = Array.from(container.children)
  // Только когда весь фрагмент — «голые» <li> (выделение внутри одного списка).
  // Смешанный контент (текст + список) не трогаем — там обёртка не терялась.
  if (elemChildren.length === 0 || !elemChildren.every((c) => c.tagName === 'LI')) return

  const anchorEl =
    range.commonAncestorContainer.nodeType === 1
      ? (range.commonAncestorContainer as HTMLElement)
      : range.commonAncestorContainer.parentElement
  const list = anchorEl?.closest('ol, ul')
  const tag = list && list.tagName === 'OL' ? 'ol' : 'ul'
  const wrapper = document.createElement(tag)

  // Сохранить стартовый номер, если выделение начинается не с первого пункта.
  if (tag === 'ol' && list) {
    const startNode =
      range.startContainer.nodeType === 1
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement
    const startLi = startNode?.closest('li')
    if (startLi) {
      const items = Array.from(list.querySelectorAll(':scope > li'))
      const idx = items.indexOf(startLi)
      const base = parseInt(list.getAttribute('start') ?? '1', 10) || 1
      if (idx > 0) wrapper.setAttribute('start', String(base + idx))
    }
  }

  while (container.firstChild) wrapper.appendChild(container.firstChild)
  container.appendChild(wrapper)
}
