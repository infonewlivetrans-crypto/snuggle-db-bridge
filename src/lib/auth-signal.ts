/**
 * Короткий фирменный звуковой сигнал auth-страницы.
 * Файл можно заменить — путь стабильный: /public/audio/radius-track-auth-signal.mp3.
 * Воспроизводится не более 8 секунд от начала.
 */
const AUTH_SIGNAL_SRC = "/audio/radius-track-auth-signal.mp3";
const MAX_DURATION_MS = 8000;

let currentAudio: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function stopCurrent() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
}

export function playAuthSignal(volume = 0.25) {
  if (typeof window === "undefined") return;
  try {
    // Останавливаем предыдущий, чтобы не накладывались
    stopCurrent();

    const audio = new Audio(AUTH_SIGNAL_SRC);
    audio.volume = Math.max(0, Math.min(1, volume));
    currentAudio = audio;

    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        /* Браузер заблокировал воспроизведение — молча игнорируем */
      });
    }

    // Жёсткий стоп через 8 секунд
    stopTimer = setTimeout(() => {
      if (currentAudio === audio) {
        stopCurrent();
      } else {
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
      }
    }, MAX_DURATION_MS);
  } catch {
    /* не ломаем страницу, если аудио недоступно */
  }
}
