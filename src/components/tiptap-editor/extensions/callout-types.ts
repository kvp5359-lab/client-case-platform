/**
 * Типы для Callout extension. Вынесены в отдельный файл,
 * чтобы node-view мог импортировать их без цикла
 * (extension -> view -> extension).
 */

export type CalloutIcon = string
export type CalloutColor = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'pink'
