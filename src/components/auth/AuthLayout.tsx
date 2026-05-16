import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import heroBg from "@/assets/auth-radius-track-hero.jpg";
import { AuthAmbientToggle } from "./AuthAmbientToggle";

interface AuthLayoutProps {
  children: ReactNode;
  /** На desktop карточку можно прижать влево, чтобы не закрывать центр сцены */
  align?: "left" | "center";
}

/**
 * Полноэкранный auth-layout с фирменным фоном «Радиус Трек».
 * - Фон: cover, адаптивный object-position (центр золотого куба остаётся виден).
 * - Затемняющий gradient overlay (мягче на desktop, заметнее на mobile).
 * - Glassmorphism-карточка по центру (mobile/tablet) / левее (desktop, align="left").
 * - Кнопка-переключатель ambient-аудио в нижнем правом углу.
 */
export function AuthLayout({ children, align = "left" }: AuthLayoutProps) {
  return (
    <div className="relative isolate flex w-full" style={{ minHeight: "100svh" }}>
      {/* Фоновое изображение */}
      <img
        src={heroBg}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 h-full w-full select-none object-cover [object-position:55%_center] md:[object-position:center_center] lg:[object-position:center_center]"
        draggable={false}
      />

      {/* Overlay: на mobile затемняем сильнее, на desktop — мягкий боковой градиент в зоне карточки */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          // mobile / tablet — равномерное затемнение для читаемости
          "bg-[radial-gradient(ellipse_at_center,rgba(8,10,16,0.35)_0%,rgba(8,10,16,0.65)_100%)]",
          // desktop — мягкий боковой градиент со стороны карточки
          align === "left"
            ? "md:bg-[linear-gradient(90deg,rgba(8,10,16,0.78)_0%,rgba(8,10,16,0.55)_28%,rgba(8,10,16,0.15)_55%,rgba(8,10,16,0.05)_100%)]"
            : "md:bg-[radial-gradient(ellipse_at_center,rgba(8,10,16,0.55)_0%,rgba(8,10,16,0.35)_60%,rgba(8,10,16,0.15)_100%)]",
        )}
      />

      {/* Контент */}
      <div
        className={cn(
          "relative z-10 flex w-full px-4 py-8 sm:px-6 md:px-10 lg:px-16",
          align === "left"
            ? "items-center justify-center md:justify-start"
            : "items-center justify-center",
        )}
      >
        <div className="w-full max-w-[460px] md:max-w-[440px] lg:ml-[6vw]">{children}</div>
      </div>

      {/* Ambient toggle */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center md:bottom-6 md:right-6 md:left-auto md:justify-end md:px-0 md:pr-2">
        <div className="pointer-events-auto">
          <AuthAmbientToggle />
        </div>
      </div>
    </div>
  );
}

/**
 * Стеклянная карточка для форм. Использовать внутри AuthLayout.
 */
export function GlassCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[26px] border border-white/30 bg-white/85 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150 sm:p-7",
        "ring-1 ring-white/15",
        className,
      )}
    >
      {children}
    </div>
  );
}
