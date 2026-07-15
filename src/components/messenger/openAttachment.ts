/**
 * Открытие вложения в новой вкладке — общее для меню вложения и карточки файла
 * (раньше этот блок был скопирован в обоих).
 *
 * Вкладку открываем ДО await: браузер разрешает `window.open` только как
 * реакцию на клик, после асинхронной паузы попап будет заблокирован. Поэтому
 * сначала пустая вкладка, затем в неё подставляется ссылка.
 *
 * Имя файла передаём всегда: при просмотре — как inline-имя (иначе браузер
 * покажет имя из адреса, т.е. storage_path), для остальных типов — как
 * download-имя, потому что показать их браузер всё равно не умеет.
 */

import { toast } from 'sonner'
import { canInlinePreview, getAttachmentUrl } from '@/services/api/messenger/messengerService'

type OpenableAttachment = {
  storage_path: string
  file_id?: string | null
  file_name: string
  mime_type?: string | null
}

export async function openAttachmentInNewTab(attachment: OpenableAttachment): Promise<void> {
  const inline = canInlinePreview(attachment.mime_type)
  // Без `noopener`: он бы вернул null, а нам нужна ссылка на вкладку, чтобы
  // подставить в неё URL после await.
  const newTab = window.open('', '_blank')
  if (!newTab) {
    toast.error('Браузер заблокировал открытие вкладки')
    return
  }

  try {
    const url = await getAttachmentUrl(
      attachment.storage_path,
      attachment.file_id,
      inline ? { inline: attachment.file_name } : { download: attachment.file_name },
    )
    newTab.location.href = url
  } catch {
    newTab.close()
    toast.error('Не удалось открыть файл')
  }
}
