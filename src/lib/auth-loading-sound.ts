/**
 * Тихий зацикленный звук состояния загрузки авторизации.
 * Файл можно заменить — путь стабильный: /public/audio/auth-loading.mp3.
 */
const AUTH_LOADING_SRC = "/audio/auth-loading.mp3";

let currentAudio: HTMLAudioElement | null = null;

export function startAuthLoadingSound(volume = 0.1) {
  if (typeof window === "undefined") return;
  // Если уже играет — ничего не делаем
  if (currentAudio) return;
  try {
    const audio = new Audio(AUTH_LOADING_SRC);
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, volume));
    currentAudio = audio;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // Браузер заблокировал воспроизведение — молча сбрасываем
        currentAudio = null;
      });
    }
  } catch {
    currentAudio = null;
  }
}

export function stopAuthLoadingSound() {
  if (!currentAudio) return;
  try {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  } catch {
    /* noop */
  }
  currentAudio = null;
}
