// «Громкий» сигнал — повторяющийся вызов (трель) до явной остановки.
// Использует WebAudio (без внешних файлов). Уважает autoplay-policy браузера.

import {
  getNotifSoundSettings,
  triggerVibration,
} from "@/lib/notifications/sound-settings";

let activeCtx: AudioContext | null = null;
let intervalId: number | null = null;
let armed = false; // получено ли разрешение от пользователя (после первого клика)

// Помечаем первое взаимодействие, чтобы знать, что autoplay разрешён.
if (typeof window !== "undefined") {
  const arm = () => {
    armed = true;
    window.removeEventListener("click", arm);
    window.removeEventListener("keydown", arm);
    window.removeEventListener("touchstart", arm);
  };
  window.addEventListener("click", arm, { once: true });
  window.addEventListener("keydown", arm, { once: true });
  window.addEventListener("touchstart", arm, { once: true });
}

function playOne(ctx: AudioContext, vol: number) {
  const now = ctx.currentTime;
  const notes = [880, 1175, 1568, 1175];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.16;
    const end = start + 0.14;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.3 * vol), start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
}

export function isLoudRingArmed(): boolean {
  return armed;
}

export function startLoudRing(): boolean {
  if (intervalId != null) return true;
  const settings = getNotifSoundSettings();
  if (!settings.enabled || settings.volume <= 0) return false;
  if (!armed) return false;
  try {
    const Ctx =
      (window.AudioContext as typeof AudioContext | undefined) ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return false;
    activeCtx = new Ctx();
    const tick = () => {
      if (!activeCtx) return;
      playOne(activeCtx, settings.volume);
      if (settings.vibrate) triggerVibration([200, 100, 200]);
    };
    tick();
    intervalId = window.setInterval(tick, 1600);
    return true;
  } catch {
    return false;
  }
}

export function stopLoudRing(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (activeCtx) {
    void activeCtx.close().catch(() => {});
    activeCtx = null;
  }
}
