import { cn } from '@/lib/utils'

/**
 * Компактные стили текстового блока плана в режиме чтения.
 *
 * Зеркалят правила контента TiptapEditor (см. tiptap-editor.tsx → editorProps),
 * чтобы просмотр совпадал с редактированием по отступам. Без редакторских
 * `focus`/`p-4`/`min-height`. Tailwind `prose` НЕ используем — он даёт слишком
 * крупные вертикальные отступы (особенно у списков и нумерации).
 */
export const PLAN_TEXT_CLASS = cn(
  // базовый кегль как у списка задач
  'text-sm',
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-3',
  '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-3',
  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2',
  '[&_p]:mb-1.5 [&_p]:leading-relaxed',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-1.5',
  '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-1.5',
  '[&_li]:mb-0 [&_li_p]:mb-0',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-2',
  '[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:bg-[#F3F4F6]',
  '[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-2 [&_pre]:overflow-x-auto',
  '[&_hr]:my-3 [&_hr]:border-border',
  '[&_a]:text-primary [&_a]:underline',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:my-2',
  '[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_th]:font-semibold [&_th]:text-left',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
  '[&_th_p]:mb-0 [&_td_p]:mb-0',
  '[&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto [&_img]:my-2',
  // последний блок без нижнего отступа — компактность
  '[&>*:last-child]:mb-0',
)
