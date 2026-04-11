/**
 * Validates that a string is a safe CSS color value.
 * Prevents CSS injection via style={{ backgroundColor }}.
 *
 * Accepts: hex (#rgb, #rrggbb, #rrggbbaa), rgb(), hsl(), named colors.
 * Rejects: url(), expression(), var(), and anything with semicolons/braces.
 */

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const FUNC_RE = /^(?:rgb|hsl)a?\(\s*[\d.%,\s/]+\)$/
// запрещаем CSS-функции (url, var, calc, expression) и слова длиннее 20 символов
const DANGEROUS_RE = /(?:url|var|calc|expression|env)\s*\(/i
const NAMED_RE = /^[a-zA-Z]{1,20}$/

export function isValidCssColor(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (DANGEROUS_RE.test(trimmed)) return false
  return HEX_RE.test(trimmed) || FUNC_RE.test(trimmed) || NAMED_RE.test(trimmed)
}

/** Returns the color if valid, otherwise the fallback. */
export function safeCssColor(value: string | null | undefined, fallback = '#e5e7eb'): string {
  return isValidCssColor(value) ? value!.trim() : fallback
}
