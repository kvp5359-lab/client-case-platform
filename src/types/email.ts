/**
 * Email-получатель (чип) для поля ввода адресатов письма.
 * Определение вынесено сюда (нижний слой), чтобы хуки не импортировали вверх
 * из `components/templates/EmailRecipientInput` (который реэкспортирует тип).
 */

export type EmailChip = {
  email: string
  label: string
}
