import { describe, it, expect } from 'vitest'
import { sanitizeMessengerHtml } from './messengerHtml'

/**
 * Проверка схлопывания пустых строк в email-HTML.
 * Маркетинговые письма часто валят пачки `<p>&nbsp;</p>` / `<div><br></div>`
 * между блоками — после санитизации они не должны давать более одной
 * пустой строки подряд.
 */
describe('sanitizeMessengerHtml — collapseEmptyLines', () => {
  // Считаем «видимые пустые строки» по количеству <br> подряд.
  // 1 <br> между блоками = нет пустой строки, 2 = 1 пустая, 3 = 2 пустые и т.д.
  const maxConsecutiveBr = (html: string): number => {
    let max = 0
    const re = /(?:<br\s*\/?>\s*)+/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const count = (m[0].match(/<br/gi) ?? []).length
      if (count > max) max = count
    }
    return max
  }

  it('схлопывает <p>&nbsp;</p> подряд до одной пустой строки', () => {
    const dirty =
      '<p>Hello</p>' +
      '<p>&nbsp;</p>'.repeat(10) +
      '<p>World</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
    expect(out).toContain('Hello')
    expect(out).toContain('World')
  })

  it('схлопывает <div></div> подряд', () => {
    const dirty =
      '<div>A</div>' +
      '<div></div>'.repeat(8) +
      '<div>B</div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('схлопывает <div><br></div> и <p><br></p>', () => {
    const dirty =
      '<p>A</p><p><br></p><p><br></p><p><br></p><p><br></p><p>B</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('схлопывает вложенные пустые: <div><span>&nbsp;</span></div>', () => {
    const dirty =
      '<p>A</p>' +
      '<div><span>&nbsp;</span></div>'.repeat(6) +
      '<p>B</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('схлопывает <br><br><br>... подряд', () => {
    const dirty = 'A' + '<br>'.repeat(20) + 'B'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('не трогает блок с реальным текстом', () => {
    const dirty = '<p>Hello world</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('Hello world')
    expect(out).toContain('<p>')
  })

  it('не считает блок с <img> пустым', () => {
    // <img> разрешит DOMPurify только если есть в whitelist — у нас его нет.
    // Поэтому реальная проверка — что блок с осмысленным текстом
    // (включая ссылку) не схлопывается.
    const dirty = '<p><a href="https://x.com">link</a></p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('href="https://x.com"')
  })

  it('сохраняет 1 пустую строку между абзацами (не схлопывает в 0)', () => {
    const dirty = '<p>A</p><p>&nbsp;</p><p>B</p>'
    const out = sanitizeMessengerHtml(dirty)
    // Должен остаться хотя бы один <br> или пустой блок-разделитель.
    expect(out).toMatch(/<br|<p[^>]*><\/p>|<div[^>]*><\/div>/)
  })

  it('обрезает хвостовую пустоту email (br/nbsp/пустой блок в конце)', () => {
    // Так заканчивается тело входящего email (Gmail): текст + <br><br><br> +
    // &nbsp; + пустой mail-quote-collapse div (класс вычищает DOMPurify).
    const dirty = 'Текст.<br><br><br>&nbsp;<div class="mail-quote-collapse"></div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toBe('Текст.')
  })

  it('обрезает начальную пустоту', () => {
    const dirty = '<br>&nbsp;<br>Текст'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toBe('Текст')
  })

  it('разворачивает вложенные одно-ячеечные layout-таблицы письма в div', () => {
    // Stripe/marketing-письма оборачивают каждую строку в свою таблицу,
    // вложенную на несколько уровней → накопленный левый отступ и зазоры.
    const dirty =
      '<table><tbody><tr><td><table><tbody><tr><td>' +
      '<span>Строка</span>' +
      '</td></tr></tbody></table></td></tr></tbody></table>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('<table')
    expect(out).toContain('Строка')
  })

  it('сохраняет реальную таблицу данных (2+ ячейки в строке)', () => {
    const dirty =
      '<table><tbody><tr><td>Итого</td><td>$12.14</td></tr></tbody></table>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('<table')
    expect(out).toContain('Итого')
    expect(out).toContain('$12.14')
  })

  it('убирает спейсер-ячейки font-size:0 с точкой (AliExpress) и не показывает «.»', () => {
    // Письма держат вертикаль невидимыми ячейками `<td style="font-size:0;
    // color:#FFF">.</td>`. Мы срезаем font-size/color → точка всплыла бы. Чистим
    // текст таких спейсеров ДО фильтрации стилей → ячейка пустеет и удаляется.
    const dirty =
      '<table><tbody>' +
      '<tr><td colspan="4" style="font-size: 0; line-height: 0; color: #FFFFFF; padding-top: 12px;">.</td></tr>' +
      '<tr><td>Cable Baseus</td></tr>' +
      '</tbody></table>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('>.<')
    expect(out).toContain('Cable Baseus')
  })

  it('снимает атрибут height у ячейки-кнопки письма (пустой бокс при незагрузке)', () => {
    // AliExpress/магазины держат кнопки-баннеры ячейкой `<td height="50">` с
    // `<img height="50">` внутри. Атрибут height резервировал пустой бокс, когда
    // картинка не грузилась. Снимаем height → бокс сжимается по контенту.
    const dirty =
      '<table><tbody><tr>' +
      '<td height="50" style="height:50px;font-size:0px"><a href="#"><img height="50" src="https://x/y.png" style="height:50px"></a></td>' +
      '</tr></tbody></table>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toMatch(/height=/i)
  })

  it('убирает ведущие <br> внутри блока (остаток от вырезанной картинки)', () => {
    // Санитайзер режет <img>, блок-контейнер картинки пустеет → collapseEmptyLines
    // делает из него <br>. Такие «висячие» <br> в начале ячейки давали гэп перед
    // товаром (реально измерено на письме AliExpress). Чистим края блока.
    const dirty = '<table><tbody><tr><td><div><br><br><a href="#">Товар</a></div></td></tr></tbody></table>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('Товар')
    expect(out).not.toMatch(/<div>\s*<br/i)
  })

  it('сохраняет <br> между строками текста (не край блока)', () => {
    const dirty = '<div>Первая<br><br>Вторая</div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('Первая')
    expect(out).toContain('Вторая')
    expect(out).toMatch(/<br/i)
  })

  it('выносит хвостовой <br> из <p> наружу (пустая строка из редактора видна)', () => {
    // tiptap: пустая строка в конце абзаца = <p>текст.<br></p>. Хвостовой <br>
    // ВНУТРИ <p> браузер не рисует (замер: gap 0) → абзацы слипались, хотя в
    // Telegram пустая строка видна. Переносим <br> наружу — между блоками он
    // рисуется как пустая строка (gap ≈17), совпадает с Telegram.
    const dirty = '<p>Первый абзац.<br></p><p>Второй абзац.</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('Первый абзац.')
    expect(out).toContain('Второй абзац.')
    // <br> вынесен из <p> — текст стоит прямо перед </p>, а пустая строка между
    // абзацами = <p><br></p> (чисто копируется/вставляется, не двоится в редакторе)
    expect(out).toContain('Первый абзац.</p>')
    expect(out).toMatch(/<\/p>\s*<p><br\s*\/?><\/p>\s*<p>Второй/i)
  })

  it('пустую строку между абзацами кодирует как <p><br></p>, а не bare <br> (не двоится при вставке)', () => {
    // Regression: bare <br> между блоками грязно копируется из бабла → при
    // вставке в tiptap-композер пустая строка двоилась. <p><br></p> round-trip'ится
    // ровно в одну пустую строку.
    const out = sanitizeMessengerHtml('<p>A</p><p></p><p>B</p>')
    expect(out).toContain('<p><br></p>')
    expect(out).not.toMatch(/<\/p>\s*<br\s*\/?>\s*<p>/i) // нет bare <br> между <p>
  })

  it('одиночный <br> в плоском тексте (plain-text из TG) — перенос строки, НЕ пустая строка', () => {
    // BubbleTextContent для plain-text шлёт content.replace(/\n/g,'<br>').
    // "Привет!\nПодготовил" → "Привет!<br>Подготовил". <br> между инлайн-текстом
    // это перенос строки, а не разделитель абзацев — НЕ оборачиваем в <p><br></p>
    // (иначе появлялась лишняя пустая строка — регресс от normalizeRootBlankLines).
    const out = sanitizeMessengerHtml('Привет!<br>Подготовил 👌')
    expect(out).not.toContain('<p><br></p>')
    expect(out).toMatch(/Привет!\s*<br\s*\/?>\s*Подготовил/i)
  })

  it('двойной <br> в плоском тексте — одна пустая строка (не блок-разделитель)', () => {
    const out = sanitizeMessengerHtml('Строка1<br><br>Строка2')
    expect(out).toContain('Строка1')
    expect(out).toContain('Строка2')
    expect(out).not.toContain('<p><br></p>') // остаётся <br><br>, не оборачивается
  })

  it('хвостовой <br> в самом конце сообщения не даёт лишней пустой строки', () => {
    const out = sanitizeMessengerHtml('<p>Текст.<br></p>')
    expect(out).toContain('Текст.')
    expect(out).not.toMatch(/<br/i) // край сообщения обрезается
  })

  it('не трогает реальный текст в блоке без font-size:0', () => {
    const dirty = '<div style="color: #333">Обычный . текст</div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('Обычный . текст')
  })

  it('вычищает preheader-распорки (soft hyphen / zero-width) и сворачивает блок', () => {
    // preheader письма: невидимые символы между пробелами создают высокий
    // пустой бокс + артефакт «-» (soft hyphen). После чистки блок пуст.
    const dirty =
      '<div>­ ­ ͏ ​ ­ ‍</div><div>Текст</div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('­')
    expect(out).not.toContain('͏')
    expect(out).not.toContain('​')
    expect(out).toContain('Текст')
  })
  it('конвертирует пробелы фиксированной ширины (figure space U+2007) в обычные', () => {
    // Stripe-письма набивают preheader figure-space (U+2007) — он НЕ схлопывается
    // под white-space:normal, сотня штук даёт высокий пустой бокс.
    const figureSpaces = '\u2007'.repeat(50)
    const dirty = `<span>Тема${figureSpaces}конец</span>`
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('\u2007')
    expect(out).toContain('Тема')
    expect(out).toContain('конец')
  })

  it('конвертирует braille-blank U+2800 (preheader-распорка Госуслуг) в пробел', () => {
    // Госуслуги набивают preheader символом U+2800 (печатный «пустой» braille,
    // ширина пробела, НЕ схлопывается) + color:transparent → пустой бокс.
    const braille = '\u2800'.repeat(80)
    const dirty = `<div style="color: transparent">${braille}</div><div>Текст</div>`
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('\u2800')
    expect(out).toContain('Текст')
  })

})
