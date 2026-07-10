import { useMemo } from 'react'
import { Link as LinkIcon, CornerDownRight } from 'lucide-react'
import type {
  GalleryImage,
  GalleryAudio,
  GalleryFile,
  GalleryLink,
} from '@/hooks/messenger/useThreadSearch'
import { useMessengerContext } from '../MessengerContext'
import { FileAttachment } from '../FileAttachment'
import { AudioAttachmentPlayer } from '../AudioAttachmentPlayer'
import { GalleryImageTile } from './GalleryImageTile'
import { formatMsgDate, periodGroup } from './searchFormat'
import { linkLabel } from '@/utils/messenger/extractLinks'

type PeriodGroup = {
  key: string
  label: string
  images: GalleryImage[]
  audios: GalleryAudio[]
  files: GalleryFile[]
  links: GalleryLink[]
}

/** Вид «Галерея»: элементы сгруппированы по периоду (Сегодня/Вчера/месяц),
 *  внутри — медиа плитками, аудио плеером, файлы и ссылки списком с отправителем. */
export function ThreadSearchGallery({
  images,
  audios,
  files,
  links,
  threadId,
  onJump,
}: {
  images: GalleryImage[]
  audios: GalleryAudio[]
  files: GalleryFile[]
  links: GalleryLink[]
  threadId: string
  onJump: (messageId: string) => void
}) {
  const { projectId, workspaceId } = useMessengerContext()

  const groups = useMemo<PeriodGroup[]>(() => {
    const merged = [
      ...images.map((x) => ({ kind: 'image' as const, at: x.createdAt, img: x })),
      ...audios.map((x) => ({ kind: 'audio' as const, at: x.createdAt, audio: x })),
      ...files.map((x) => ({ kind: 'file' as const, at: x.createdAt, file: x })),
      ...links.map((x) => ({ kind: 'link' as const, at: x.createdAt, link: x })),
    ].sort((a, b) => b.at.localeCompare(a.at)) // ISO desc = хронология вниз
    const map = new Map<string, PeriodGroup>()
    for (const it of merged) {
      const { key, label } = periodGroup(it.at)
      let g = map.get(key)
      if (!g) {
        g = { key, label, images: [], audios: [], files: [], links: [] }
        map.set(key, g)
      }
      if (it.kind === 'image') g.images.push(it.img)
      else if (it.kind === 'audio') g.audios.push(it.audio)
      else if (it.kind === 'file') g.files.push(it.file)
      else g.links.push(it.link)
    }
    return [...map.values()]
  }, [images, audios, files, links])

  return (
    <div className="p-3">
      {groups.map((g) => (
        <section key={g.key} className="mb-5">
          <h4 className="sticky top-0 z-10 mb-2 bg-background/95 py-1 text-xs font-medium text-muted-foreground">
            {g.label}
          </h4>

          {g.images.length > 0 && (
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {g.images.map((img) => (
                <GalleryImageTile
                  key={img.attachment.id}
                  attachment={img.attachment}
                  onJump={() => onJump(img.messageId)}
                />
              ))}
            </div>
          )}

          {g.audios.map((a) => (
            <div key={a.attachment.id} className="mb-2">
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="truncate">{a.senderName || 'Без имени'}</span>
                <span>·</span>
                <span className="flex-shrink-0">{formatMsgDate(a.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => onJump(a.messageId)}
                  aria-label="Перейти к сообщению"
                  className="ml-auto flex-shrink-0 hover:text-foreground"
                >
                  <CornerDownRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <AudioAttachmentPlayer attachment={a.attachment} />
            </div>
          ))}

          {g.files.map((f) => (
            <div key={f.attachment.id} className="mb-2">
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="truncate">{f.senderName || 'Без имени'}</span>
                <span>·</span>
                <span className="flex-shrink-0">{formatMsgDate(f.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => onJump(f.messageId)}
                  aria-label="Перейти к сообщению"
                  className="ml-auto flex-shrink-0 hover:text-foreground"
                >
                  <CornerDownRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <FileAttachment
                attachment={f.attachment}
                projectId={projectId}
                workspaceId={workspaceId}
                threadId={threadId}
              />
            </div>
          ))}

          {g.links.map((l, i) => (
            <div
              key={`${l.messageId}-${i}`}
              className="mb-1.5 flex items-center gap-2.5 border-b border-border/60 pb-1.5 text-sm last:border-0"
            >
              <LinkIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-primary hover:underline"
                  title={l.url}
                >
                  {linkLabel(l.url)}
                </a>
                <div className="truncate text-[11px] text-muted-foreground">
                  {l.senderName || 'Без имени'} · {formatMsgDate(l.createdAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onJump(l.messageId)}
                aria-label="Перейти к сообщению"
                className="flex-shrink-0 text-muted-foreground hover:text-foreground"
              >
                <CornerDownRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
