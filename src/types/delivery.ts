/**
 * Унифицированный статус доставки исходящего сообщения по всем каналам.
 * Источник правды — `project_messages.send_status`, поверх — read-семантика.
 * Определение вынесено сюда (нижний слой), чтобы хуки не импортировали вверх
 * из `components/messenger/DeliveryIndicator` (который реэкспортирует тип).
 */

export type DeliveryStatus = 'pending' | 'sent' | 'read' | 'failed' | null
