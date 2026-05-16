import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

const AUDIO_SRC = "/audio/radius-track-auth-ambient.mp3";
const STORAGE_KEY = "auth.ambient.enabled";
const VOLUME = 0.15;

export function AuthAmbientToggle({ className }: { className?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const a = new Audio(AUDIO_SRC);
    a.loop = true;
    a.volume = VOLUME;
    a.preload = "none";
    audioRef.current = a;

    // Если пользователь раньше осознанно включал — пробуем восстановить
    const saved =
      typeof window !== "undefined" && window.localStorage?.getItem(STORAGE_KEY) === "1";
    if (saved) {
      a.play()
        .then(() => setEnabled(true))
        .catch(() => {
          // autoplay заблокирован — ждём клика
        });
    }

    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (enabled) {
      a.pause();
      setEnabled(false);
      try {
        window.localStorage?.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
      return;
    }
    try {
      await a.play();
      setEnabled(true);
      try {
        window.localStorage?.setItem(STORAGE_KEY, "1");
      } catch {
        /* noop */
      }
    } catch {
      // Файл отсутствует или браузер заблокировал — мягко скрываем
      setAvailable(false);
    }
  };

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Выключить атмосферу" : "Включить атмосферу"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-all hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-yellow,#facc15)]",
        className,
      )}
    >
      {enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      <span>{enabled ? "Атмосфера включена" : "Включить атмосферу"}</span>
    </button>
  );
}
