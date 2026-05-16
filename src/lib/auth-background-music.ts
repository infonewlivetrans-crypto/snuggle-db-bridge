/**
 * Фоновая музыка экрана входа.
 * - Стабильный путь: /public/audio/auth-background.mp3 → URL /audio/auth-background.mp3
 * - Loop, мягкая громкость.
 * - Если autoplay заблокирован браузером, ставим один раз слушатели
 *   на pointerdown/keydown/touchstart, чтобы запустить при первом
 *   взаимодействии пользователя со страницей.
 */
const AUTH_BG_SRC = "/audio/auth-background.mp3";

let currentAudio: HTMLAudioElement | null = null;
let unlockHandler: (() => void) | null = null;

function removeUnlockListeners() {
  if (!unlockHandler) return;
  window.removeEventListener("pointerdown", unlockHandler);
  window.removeEventListener("keydown", unlockHandler);
  window.removeEventListener("touchstart", unlockHandler);
  unlockHandler = null;
}

function tryPlay(audio: HTMLAudioElement) {
  const result = audio.play();
  if (result && typeof result.catch === "function") {
    result.catch(() => {
      // autoplay заблокирован — повторим при первом user gesture
      if (unlockHandler || !currentAudio) return;
      unlockHandler = () => {
        if (!currentAudio) {
          removeUnlockListeners();
          return;
        }
        const r = currentAudio.play();
        if (r && typeof r.catch === "function") {
          r.catch(() => {
            /* всё ещё нельзя — тихо игнорируем */
          });
        }
        removeUnlockListeners();
      };
      window.addEventListener("pointerdown", unlockHandler, { once: true });
      window.addEventListener("keydown", unlockHandler, { once: true });
      window.addEventListener("touchstart", unlockHandler, { once: true });
    });
  }
}

export function startAuthBackgroundMusic(volume = 0.1) {
  if (typeof window === "undefined") return;
  if (currentAudio) return;
  try {
    const audio = new Audio(AUTH_BG_SRC);
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, volume));
    currentAudio = audio;
    tryPlay(audio);
  } catch {
    currentAudio = null;
  }
}

export function stopAuthBackgroundMusic() {
  removeUnlockListeners();
  if (!currentAudio) return;
  try {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  } catch {
    /* noop */
  }
  currentAudio = null;
}
