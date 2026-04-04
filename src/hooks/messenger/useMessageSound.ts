/**
 * Звуки мессенджера:
 * - playIncomingSound — входящее сообщение (вызывается из useNewMessageToast)
 * - playSendSound — исходящее сообщение (вызывается при отправке)
 */

// Lazy-singleton для звука входящего
let incomingAudio: HTMLAudioElement | null = null

export function playIncomingSound() {
  if (!incomingAudio) {
    incomingAudio = new Audio('/sounds/message-correct-tone.wav')
    incomingAudio.volume = 0.8
  }
  incomingAudio.currentTime = 0
  incomingAudio.play().catch(() => {})
}

// Lazy-singleton для звука отправки
let sendAudio: HTMLAudioElement | null = null

export function playSendSound() {
  if (!sendAudio) {
    sendAudio = new Audio('/sounds/message-pop.wav')
    sendAudio.volume = 0.4
  }
  sendAudio.currentTime = 0
  sendAudio.play().catch(() => {})
}
