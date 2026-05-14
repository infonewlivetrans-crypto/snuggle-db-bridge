// Локальные настройки звука и вибрации для уведомления
// «Новая подходящая заявка». Хранятся в localStorage.
import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "notif-sound-settings:v1";
const EVENT_NAME = "notif-sound-settings:changed";

export type NotifSoundSettings = {
  /** Включён ли звук */
  enabled: boolean;
  /** Громкость 0..1 */
  volume: number;
  /** Включена ли вибрация (на устройствах с поддержкой Vibration API) */
  vibrate: boolean;
};

export const DEFAULT_NOTIF_SOUND_SETTINGS: NotifSoundSettings = {
  enabled: true,
  volume: 0.6,
  vibrate: true,
};

function read(): NotifSoundSettings {
  if (typeof window === "undefined") return DEFAULT_NOTIF_SOUND_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIF_SOUND_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NotifSoundSettings>;
    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_NOTIF_SOUND_SETTINGS.enabled,
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_NOTIF_SOUND_SETTINGS.volume,
      vibrate:
        typeof parsed.vibrate === "boolean"
          ? parsed.vibrate
          : DEFAULT_NOTIF_SOUND_SETTINGS.vibrate,
    };
  } catch {
    return DEFAULT_NOTIF_SOUND_SETTINGS;
  }
}

function write(value: NotifSoundSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* ignore */
  }
}

/** Прочитать актуальные настройки синхронно (для использования вне React). */
export function getNotifSoundSettings(): NotifSoundSettings {
  return read();
}

/** Поддерживается ли Vibration API в текущем браузере. */
export function isVibrationSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof (navigator as Navigator & { vibrate?: unknown }).vibrate ===
    "function";
}

/**
 * Включить вибрацию по паттерну. На iOS Safari Vibration API не реализован
 * (тогда просто ничего не произойдёт). На Android и многих PWA — работает.
 */
export function triggerVibration(
  pattern: number | number[] = [120, 60, 120, 60, 200],
) {
  try {
    if (!isVibrationSupported()) return;
    (navigator as Navigator & { vibrate: (p: number | number[]) => boolean })
      .vibrate(pattern);
  } catch {
    /* ignore */
  }
}

/** Реактивный хук с настройками. */
export function useNotifSoundSettings(): {
  settings: NotifSoundSettings;
  vibrationSupported: boolean;
  setEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  setVibrate: (v: boolean) => void;
} {
  const [settings, setSettings] = useState<NotifSoundSettings>(() => read());

  useEffect(() => {
    const sync = () => setSettings(read());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    const next = { ...read(), enabled: v };
    write(next);
    setSettings(next);
  }, []);

  const setVolume = useCallback((v: number) => {
    const next = { ...read(), volume: Math.max(0, Math.min(1, v)) };
    write(next);
    setSettings(next);
  }, []);

  const setVibrate = useCallback((v: boolean) => {
    const next = { ...read(), vibrate: v };
    write(next);
    setSettings(next);
  }, []);

  return {
    settings,
    vibrationSupported: isVibrationSupported(),
    setEnabled,
    setVolume,
    setVibrate,
  };
}
