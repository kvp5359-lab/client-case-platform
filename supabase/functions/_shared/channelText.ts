/**
 * Текст-хелперы для исходящих в мессенджер-каналы (WhatsApp/Wazzup и т.п.),
 * где сообщение нужно превратить из нашего HTML в плоский текст.
 *
 * ⚠️ НЕ путать с `_shared/textProcessing.ts#stripHtml` — тот заточен под
 * индексацию базы знаний (сохраняет нумерацию/вложенность списков, чанкинг).
 * Здесь — простой вариант для канала: `<br>`/`</p>` → перевод строки,
 * срезаем теги, декодируем базовые HTML-сущности.
 *
 * Раньше эта функция жила байт-в-байт в `wazzup-send` и `wazzup-send-reaction`.
 * Вынесена, чтобы копии не разъезжались (класс карантинных багов — дрейф копий).
 *
 * Ссылки разворачиваются в видимый адрес (`anchorsToText`) — иначе href терялся
 * бы вместе с тегом и клиент получал текст без возможности открыть ссылку.
 */
import { anchorsToText } from "./htmlFormatting.ts";

export function stripHtmlBasic(html: string): string {
  return anchorsToText(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
