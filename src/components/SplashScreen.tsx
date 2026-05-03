import { BrandLogo } from "@/components/BrandLogo";

/**
 * Стартовая заставка приложения «Радиус Трек».
 * Показывается во время первичной загрузки (auth/profile).
 * Лёгкая, без сторонних зависимостей — не раздувает bundle.
 */
export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background px-6 animate-in fade-in duration-300">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex items-center justify-center">
          <BrandLogo size={72} />
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Радиус Трек — платформа для управления перевозками, заказами,
          маршрутами, складом и контролем работы компании
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <div
            className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Загрузка системы"
          >
            <div className="splash-bar h-full w-1/3 rounded-full bg-primary" />
          </div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Загрузка системы…
          </div>
        </div>
      </div>

      <style>{`
        @keyframes splash-bar-slide {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(420%); }
        }
        .splash-bar {
          animation: splash-bar-slide 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
