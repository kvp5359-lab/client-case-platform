/**
 * Кнопка прикрепления файлов с двумя источниками:
 * 1. Загрузить с компьютера (file input)
 * 2. Выбрать из проекта (callback)
 *
 * Используется в AiChatInput и MessageInput.
 */

import { useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Paperclip, Upload, FolderOpen } from 'lucide-react'

interface AttachmentButtonProps {
  onFilesSelected: (files: File[]) => void
  onOpenDocPicker?: () => void
  projectDocumentsCount?: number
  disabled?: boolean
  accept?: string
  multiple?: boolean
  /** Класс для кнопки (размер и т.д.) */
  buttonClassName?: string
  /** Класс для иконки */
  iconClassName?: string
  /** Текст рядом с иконкой (например «Прикрепить (2)») */
  label?: string
  /** Бейдж с количеством файлов (отображается поверх иконки) */
  badge?: number
}

export function AttachmentButton({
  onFilesSelected,
  onOpenDocPicker,
  projectDocumentsCount = 0,
  disabled,
  accept,
  multiple,
  buttonClassName = 'h-8 w-8',
  iconClassName = 'h-4 w-4',
  label,
  badge,
}: AttachmentButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesSelected(Array.from(e.target.files))
        e.target.value = ''
      }
    },
    [onFilesSelected],
  )

  const badgeEl =
    badge && badge > 0 ? (
      <span className="absolute bottom-0.5 right-0.5 min-w-[13px] h-[13px] px-0.5 rounded-full bg-blue-500 text-white text-[8px] font-semibold flex items-center justify-center leading-none pointer-events-none ring-2 ring-white">
        {badge}
      </span>
    ) : null

  // Если нет пикера документов — просто кнопка-скрепка без dropdown
  if (!onOpenDocPicker) {
    return (
      <>
        <div className="relative shrink-0">
          <Button
            variant="ghost"
            size={label ? 'sm' : 'icon'}
            className={`${buttonClassName}`}
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className={iconClassName} />
            {label && <span className="text-xs">{label}</span>}
          </Button>
          {badgeEl}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="hidden"
        />
      </>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              size={label ? 'sm' : 'icon'}
              className={`${buttonClassName}`}
              disabled={disabled}
            >
              <Paperclip className={iconClassName} />
              {label && <span className="text-xs">{label}</span>}
            </Button>
            {badgeEl}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={4}>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Загрузить с компьютера
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenDocPicker} disabled={projectDocumentsCount === 0}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Выбрать из проекта
            {projectDocumentsCount > 0 && (
              <span className="ml-auto text-muted-foreground text-xs">{projectDocumentsCount}</span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  )
}
