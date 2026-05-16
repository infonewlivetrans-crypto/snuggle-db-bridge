/**
 * Короткий фирменный звуковой сигнал auth-страницы.
 * Файл можно заменить — путь стабильный: /public/audio/auth-signal.mp3.
 */
const AUTH_SIGNAL_SRC = "/audio/radius-track-auth-signal.mp3";

export function playAuthSignal(volume = 0.25) {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(AUTH_SIGNAL_SRC);
    audio.volume = Math.max(0, Math.min(1, volume));
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        /* Браузер заблокировал воспроизведение — молча игнорируем */
      });
    }
  } catch {
    /* не ломаем страницу, если аудио недоступно */
  }
}
