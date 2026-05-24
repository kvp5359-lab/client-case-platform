/**
 * Hex-карта акцентных цветов для inline-style событий календаря.
 *
 * Tailwind-классы не работают: .rbc-event имеет жёсткий background-color
 * дефолтом, перебить класс без !important на всех bg-* не выйдет, а
 * inline style побеждает по специфичности.
 */
export const ACCENT_HEX: Record<string, string> = {
  blue: '#3b82f6',
  slate: '#57534e',
  emerald: '#059669',
  amber: '#f59e0b',
  rose: '#ef4444',
  violet: '#7c3aed',
  orange: '#f97316',
  cyan: '#0891b2',
  pink: '#ec4899',
  indigo: '#4f46e5',
}
