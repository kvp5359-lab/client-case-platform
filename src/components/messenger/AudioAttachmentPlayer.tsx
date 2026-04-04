import { useState, useEffect, useRef } from 'react'
import { Loader2, Mic, Music, Play, Pause, Languages, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getAttachmentUrl,
  type MessageAttachment as AttachmentType,
} from '@/services/api/messengerService'
import { supabase } from '@/lib/supabase'
import { formatSize } from '@/utils/formatSize'
import { toast } from 'sonner'
import { isVoice } from './utils/attachmentHelpers'

function formatTime(sec: number) {
  if (!sec || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS = [1, 1.5, 2]

export function AudioAttachmentPlayer({ attachment }: { attachment: AttachmentType }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcription, setTranscription] = useState<string | null>(attachment.transcription)
  const [transcriptionOpen, setTranscriptionOpen] = useState(false)
  const autoTranscribeTriggered = useRef(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)

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

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
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

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length]
    setPlaybackRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
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

  return (
    <div className="rounded-lg bg-background/50 border p-2">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      <div className="flex items-center gap-2">
        {/* Play/Pause */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={togglePlay}
          disabled={loading || !audioUrl}
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
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium truncate">
              {voice ? 'Голосовое сообщение' : attachment.file_name}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-muted cursor-pointer" onClick={handleSeek}>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {formatTime(audioRef.current?.currentTime ?? 0)}
              {duration ? ` / ${formatTime(duration)}` : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors leading-none"
                onClick={cycleSpeed}
                title="Скорость воспроизведения"
              >
                {playbackRate}x
              </button>
              {attachment.file_size && (
                <span className="text-[10px] text-muted-foreground">
                  {formatSize(attachment.file_size)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Transcription toggle */}
        {!transcription ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleTranscribe}
            disabled={transcribing}
            title="Распознать текст"
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
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
            onClick={() => setTranscriptionOpen(!transcriptionOpen)}
            title={transcriptionOpen ? 'Свернуть' : 'Показать текст'}
          >
            {transcriptionOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Transcription text */}
      {transcription && transcriptionOpen && (
        <div className="mt-1.5 px-1 py-1 text-xs text-muted-foreground bg-muted/30 rounded leading-relaxed">
          {transcription}
        </div>
      )}
    </div>
  )
}
