/**
 * perfTrace — лёгкий трассировщик таймингов открытия треда в мессенджере.
 *
 * Зачем: открытие чата из «Входящих» иногда мгновенное, иногда долгое.
 * Чтобы измерять, а не гадать, мы расставляем метки по всему пути
 * «клик → открытие панели → загрузка сообщений → отрисовка» и собираем
 * дельты в миллисекундах.
 *
 * Включается ВРУЧНУЮ из консоли браузера (работает и в проде):
 *   __ccPerf.on()      — включить (флаг в localStorage, переживает перезагрузку)
 *   __ccPerf.off()     — выключить
 *   __ccPerf.status()  — включено ли сейчас
 *   __ccPerf.dump()    — выгрузить таблицу последних сессий
 *   __ccPerf.clear()   — очистить историю
 *
 * Когда выключено — все вызовы perf* делают ранний return, оверхед нулевой.
 *
 * Модель: одна «сессия» на открытие треда (ключ — threadId). perfOpen()
 * стартует сессию (сбрасывая предыдущую для того же треда), perfMark()
 * добавляет промежуточную метку, perfEnd() закрывает и печатает таблицу.
 */

const LS_KEY = 'cc_perf_trace'
const HISTORY_LIMIT = 50

type Mark = { label: string; t: number; meta?: Record<string, unknown> }
type Session = { threadId: string; start: number; marks: Mark[]; done: boolean }

let enabled: boolean | null = null
const sessions = new Map<string, Session>()
const history: Session[] = []
const listeners = new Set<() => void>()

/** Подписка на смену состояния трассировки (для useSyncExternalStore в UI). */
export function subscribePerfTrace(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (enabled === null) {
    try {
      enabled = window.localStorage.getItem(LS_KEY) === '1'
    } catch {
      enabled = false
    }
  }
  return enabled
}

/** Текущее состояние трассировки (для UI-чекбокса). */
export function isPerfTraceEnabled(): boolean {
  return isEnabled()
}

/** Включить/выключить трассировку из UI. Пишет localStorage, переживает перезагрузку. */
export function setPerfTraceEnabled(on: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      if (on) window.localStorage.setItem(LS_KEY, '1')
      else window.localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }
  enabled = on
  listeners.forEach((l) => l())
}

function short(threadId: string): string {
  return threadId.slice(0, 8)
}

function logMark(threadId: string, label: string, t: number, delta: number, meta?: Record<string, unknown>) {
  // Цветная компактная строка: thread, +мс от старта, (Δ от предыдущей метки), label
  console.debug(
    `%c⏱ ${short(threadId)}%c +${Math.round(t)}ms%c (Δ${Math.round(delta)})%c ${label}`,
    'color:#64748b',
    'color:#16a34a;font-weight:bold',
    'color:#94a3b8',
    'color:#0f172a;font-weight:bold',
    meta ?? '',
  )
}

/** Старт новой сессии открытия треда. Сбрасывает предыдущую сессию того же треда. */
export function perfOpen(threadId: string | undefined, meta?: Record<string, unknown>): void {
  if (!isEnabled() || !threadId) return
  const s: Session = { threadId, start: nowMs(), marks: [], done: false }
  sessions.set(threadId, s)
  s.marks.push({ label: 'open', t: 0, meta })
  logMark(threadId, 'open', 0, 0, meta)
}

/** Промежуточная метка. Если сессии нет (метка пришла без open) — создаётся ленивая. */
export function perfMark(
  threadId: string | undefined,
  label: string,
  meta?: Record<string, unknown>,
): void {
  if (!isEnabled() || !threadId) return
  let s = sessions.get(threadId)
  if (!s) {
    s = { threadId, start: nowMs(), marks: [], done: false }
    sessions.set(threadId, s)
  }
  const t = nowMs() - s.start
  const prev = s.marks[s.marks.length - 1]
  const delta = prev ? t - prev.t : t
  s.marks.push({ label, t, meta })
  logMark(threadId, label, t, delta, meta)
}

/** Финальная метка — печатает сводную таблицу сессии и закрывает её. Идемпотентна. */
export function perfEnd(
  threadId: string | undefined,
  label = 'painted',
  meta?: Record<string, unknown>,
): void {
  if (!isEnabled() || !threadId) return
  const s = sessions.get(threadId)
  if (!s || s.done) return
  perfMark(threadId, label, meta)
  s.done = true
  const total = Math.round(nowMs() - s.start)
  console.groupCollapsed(
    `%c⏱ perf ${short(threadId)} — итого ${total}ms (${s.marks.length} меток)`,
    'color:#16a34a;font-weight:bold',
  )
  console.table(
    s.marks.map((m, i) => ({
      label: m.label,
      'мс от open': Math.round(m.t),
      'Δ пред': Math.round(m.t - (s.marks[i - 1]?.t ?? 0)),
      meta: m.meta ? JSON.stringify(m.meta) : '',
    })),
  )
  console.groupEnd()
  history.push(s)
  if (history.length > HISTORY_LIMIT) history.shift()
  sessions.delete(threadId)
}

// Установка глобального хелпера управления (один раз, только в браузере).
function install() {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __ccPerf?: unknown }
  if (w.__ccPerf) return
  w.__ccPerf = {
    on() {
      setPerfTraceEnabled(true)
      console.log('%c⏱ perfTrace ВКЛЮЧЁН — открой тред во «Входящих»', 'color:#16a34a;font-weight:bold')
    },
    off() {
      setPerfTraceEnabled(false)
      console.log('⏱ perfTrace выключен')
    },
    status() {
      return isEnabled()
    },
    dump() {
      console.table(
        history.flatMap((s) =>
          s.marks.map((m) => ({
            thread: short(s.threadId),
            label: m.label,
            'мс от open': Math.round(m.t),
          })),
        ),
      )
      return history
    },
    clear() {
      history.length = 0
      sessions.clear()
      console.log('⏱ perfTrace история очищена')
    },
    history,
  }
}

install()
