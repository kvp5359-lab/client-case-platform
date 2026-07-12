import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Loader2, Mic, Music, Play, Pause, Languages, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  getAttachmentUrl,
  type MessageAttachment as AttachmentType,
} from '@/services/api/messenger/messengerService'
import { supabase } from '@/lib/supabase'
import { formatSize } from '@/utils/files/formatSize'
import { toast } from 'sonner'
import { isVoice } from '@/lib/messenger/attachmentHelpers'
import { useAudioPlaybackRate } from '@/hooks/useAudioPlaybackRate'

function formatTime(sec: number) {
  if (!sec || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AudioAttachmentPlayer({
  attachment,
  isOwn = false,
  timestampOverlay,
}: {
  attachment: AttachmentType
  isOwn?: boolean
  /** Время сообщения — оверлеем в правый нижний угол плашки (последнее аудио
   *  в баббле без текста), как у файлов/картинок. */
  timestampOverlay?: ReactNode
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcription, setTranscription] = useState<string | null>(attachment.transcription)
  const [transcriptionOpen, setTranscriptionOpen] = useState(false)
  const autoTranscribeTriggered = useRef(false)
  const { rate: playbackRate, cycleRate } = useAudioPlaybackRate()
  const [sourceError, setSourceError] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Синхронизируем скорость с элементом <audio> — на изменение из других плееров
  // (кеш react-query общий) или при первой загрузке.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, audioUrl])

  // Load signed URL
  useEffect(() => {
    if (!attachment.storage_path) {
      setLoading(false)
      return
    }
    let cancelled = false
    getAttachmentUrl(attachment.storage_path, attachment.file_id)
      .then((url) => {
        if (!cancelled) {
          setAudioUrl(url)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attachment.storage_path, attachment.file_id])

  // Playback progress
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration)
    }
    const onLoadedMetadata = () => setDuration(audio.duration)
    const onEnded = () => {
      setPlaying(false)
      setProgress(0)
    }

    const onError = () => setSourceError(true)

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [audioUrl])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.playbackRate = playbackRate
      audio.play()
    }
    setPlaying(!playing)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setProgress(ratio)
  }

  const handleTranscribe = async () => {
    setTranscribing(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Unauthorized')

      const res = await supabase.functions.invoke('transcribe-audio', {
        body: { attachment_id: attachment.id },
      })

      if (res.error) throw res.error
      const text = res.data?.transcription || ''
      setTranscription(text)
      if (!text) toast.info('Не удалось распознать текст')
    } catch {
      toast.error('Ошибка распознавания')
    } finally {
      setTranscribing(false)
    }
  }

  // Auto-transcribe on first render
  useEffect(() => {
    if (autoTranscribeTriggered.current) return
    if (transcription) return
    if (loading) return

    autoTranscribeTriggered.current = true
    handleTranscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, transcription])

  // Sync from props (Realtime updates)
  useEffect(() => {
    if (attachment.transcription && !transcription) {
      setTranscription(attachment.transcription)
    }
  }, [attachment.transcription, transcription])

  const voice = isVoice(attachment)
  const Icon = voice ? Mic : Music

  const containerCls = isOwn
    ? 'rounded-lg bg-white/15 border border-white/20 p-2'
    : 'rounded-lg bg-background/50 border p-2'
  const iconCls = isOwn ? 'text-white/80' : 'text-muted-foreground'
  const subTextCls = isOwn ? 'text-white/70' : 'text-muted-foreground'
  const subBtnCls = isOwn
    ? 'text-white/70 hover:text-white'
    : 'text-muted-foreground hover:text-foreground'
  const progressBgCls = isOwn ? 'bg-white/25' : 'bg-muted'
  const progressFillCls = isOwn ? 'bg-white' : 'bg-primary'
  const hoverBtnCls = isOwn ? 'hover:bg-white/15' : 'hover:bg-muted/50'

  return (
    <div className={containerCls}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      <div className="relative flex items-center gap-2">
        {sourceError ? (
          /* Fallback: браузер не поддерживает формат (VS Code Simple Browser и т.п.) */
          <>
            <a
              href={audioUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-md ${hoverBtnCls} transition-colors`}
              title="Открыть в браузере"
            >
              <Download className={`h-4 w-4 ${iconCls}`} />
            </a>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${iconCls} shrink-0`} />
                <span className="text-xs font-medium truncate">
                  {voice ? 'Голосовое сообщение' : attachment.file_name}
                </span>
              </div>
              <span className={`text-[10px] ${subTextCls}`}>
                Формат не поддерживается — откройте в браузере
              </span>
            </div>
          </>
        ) : (
          <>
            {/* Play/Pause */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 shrink-0 ${isOwn ? 'text-white hover:bg-white/15 hover:text-white' : ''}`}
              onClick={togglePlay}
              disabled={loading || !audioUrl}
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            {/* Progress + info */}
            <div className="flex-1 min-w-0">
              {/* При бейдже времени кнопка транскрипции уходит в правый верхний
                  угол (absolute) — освобождаем правый край названию/прогрессу, а
                  мета-строка тянется до края, прижимая время к нему. */}
              <div className={cn('flex items-center gap-1.5 mb-1', timestampOverlay && 'pr-7')}>
                <Icon className={`h-3.5 w-3.5 ${iconCls} shrink-0`} />
                <span className="text-xs font-medium truncate">
                  {voice ? 'Голосовое сообщение' : attachment.file_name}
                </span>
              </div>

              {/* Progress bar. При бейдже времени сужаем трек справа (pr-7 на
                  обёртке, не на самом баре — иначе поедет заливка), чтобы его
                  правый край не уходил под absolute-кнопку транскрипции и seek
                  конца оставался кликабельным. */}
              <div className={cn(timestampOverlay && 'pr-7')}>
                <div className={`h-1.5 rounded-full ${progressBgCls} cursor-pointer`} onClick={handleSeek}>
                  <div
                    className={`h-full rounded-full ${progressFillCls} transition-[width] duration-100`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-0.5">
                <span className={`text-[10px] ${subTextCls}`}>
                  {formatTime(audioRef.current?.currentTime ?? 0)}
                  {duration ? ` / ${formatTime(duration)}` : ''}
                </span>
                {/* Скорость + размер + время — одной группой, прижаты к правому краю. */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={`text-[10px] font-medium ${subBtnCls} transition-colors leading-none`}
                    onClick={cycleRate}
                    title="Скорость воспроизведения"
                  >
                    {playbackRate}x
                  </button>
                  {attachment.file_size && (
                    <span className={`text-[10px] ${subTextCls}`}>
                      {formatSize(attachment.file_size)}
                    </span>
                  )}
                  {timestampOverlay}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Transcription toggle. При бейдже времени — в правом верхнем углу
            (absolute), чтобы info-блок дотянулся до края и время прижалось к нему. */}
        <div className={cn(timestampOverlay && 'absolute top-0 right-0')}>
          {!transcription ? (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 shrink-0',
                isOwn && 'text-white hover:bg-white/15 hover:text-white',
              )}
              onClick={handleTranscribe}
              disabled={transcribing}
              title="Распознать текст"
              aria-label="Распознать текст"
            >
              {transcribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Languages className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <button
              type="button"
              className={cn(
                'h-7 w-7 shrink-0 flex items-center justify-center rounded-md transition-colors',
                hoverBtnCls,
              )}
              onClick={() => setTranscriptionOpen(!transcriptionOpen)}
              title={transcriptionOpen ? 'Свернуть' : 'Показать текст'}
              aria-label={transcriptionOpen ? 'Свернуть' : 'Показать текст'}
            >
              {transcriptionOpen ? (
                <ChevronUp className={`h-4 w-4 ${iconCls}`} />
              ) : (
                <ChevronDown className={`h-4 w-4 ${iconCls}`} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Transcription text */}
      {transcription && transcriptionOpen && (
        <div className={`mt-1.5 px-1 py-1 text-xs rounded leading-relaxed ${isOwn ? 'text-white/85 bg-white/10' : 'text-muted-foreground bg-muted/30'}`}>
          {transcription}
        </div>
      )}
    </div>
  )
}
