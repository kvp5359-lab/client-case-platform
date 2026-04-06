/**
 * Иконки и цвета для файлов по расширению.
 * Используются в messenger (ComposeField chip-row) и в других местах,
 * где нужно визуально обозначить тип файла.
 */

import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  FileVideo,
  FileAudio,
  File,
  type LucideIcon,
} from 'lucide-react'

const EXT_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  pdf: { icon: FileText, color: 'text-red-500' },
  doc: { icon: FileText, color: 'text-blue-600' },
  docx: { icon: FileText, color: 'text-blue-600' },
  xls: { icon: FileSpreadsheet, color: 'text-green-600' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-600' },
  csv: { icon: FileSpreadsheet, color: 'text-green-600' },
  jpg: { icon: FileImage, color: 'text-amber-500' },
  jpeg: { icon: FileImage, color: 'text-amber-500' },
  png: { icon: FileImage, color: 'text-amber-500' },
  gif: { icon: FileImage, color: 'text-amber-500' },
  webp: { icon: FileImage, color: 'text-amber-500' },
  svg: { icon: FileImage, color: 'text-amber-500' },
  mp4: { icon: FileVideo, color: 'text-purple-500' },
  mov: { icon: FileVideo, color: 'text-purple-500' },
  avi: { icon: FileVideo, color: 'text-purple-500' },
  mp3: { icon: FileAudio, color: 'text-pink-500' },
  wav: { icon: FileAudio, color: 'text-pink-500' },
  ogg: { icon: FileAudio, color: 'text-pink-500' },
  zip: { icon: FileArchive, color: 'text-amber-600' },
  rar: { icon: FileArchive, color: 'text-amber-600' },
  '7z': { icon: FileArchive, color: 'text-amber-600' },
}

export function getFileIcon(filename: string): { icon: LucideIcon; color: string } {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? { icon: File, color: 'text-gray-500' }
}

/** Имя без расширения */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** Усечение по центру: "очень-длинное-название...файл" */
export function middleTruncate(name: string, maxLen = 30): string {
  const clean = stripExtension(name)
  if (clean.length <= maxLen) return clean
  const start = Math.ceil(maxLen * 0.6)
  const end = maxLen - start - 1
  return clean.slice(0, start) + '…' + clean.slice(-end)
}
