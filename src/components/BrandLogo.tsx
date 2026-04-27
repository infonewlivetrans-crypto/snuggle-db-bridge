import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** Размер иконки в px */
  size?: number;
  /** Показывать ли текст «Радиус Трек» рядом с иконкой */
  withText?: boolean;
  /** Вариант текста: тёмный (на светлом фоне) или светлый (на тёмном) */
  textTone?: "dark" | "light";
  className?: string;
}

/**
 * Фирменный логотип «Радиус Трек».
 * Круг (жёлтый) с чек-маркером и стрелкой роста внутри + текст бренда.
 * Используется в header, экране входа, панелях и т.п.
 */
export function BrandLogo({
  size = 36,
  withText = true,
  textTone = "dark",
  className,
}: BrandLogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      {withText && (
        <div className="flex flex-col leading-tight">
          <span
            className={cn(
              "text-[15px] font-extrabold tracking-tight",
              textTone === "dark" ? "text-foreground" : "text-white",
            )}
          >
            Радиус&nbsp;Трек
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-[0.14em]",
              textTone === "dark" ? "text-muted-foreground" : "text-white/70",
            )}
          >
            Логистика · Трекинг
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Только знак (без текста) — для favicon-подобных мест,
 * аватарок, кнопок и компактных хедеров.
 */
export function BrandMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-primary shadow-card",
        className,
      )}
      style={{ width: size, height: size }}
      aria-label="Радиус Трек"
    >
      <svg
        viewBox="0 0 40 40"
        width={size * 0.66}
        height={size * 0.66}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Чек-маркер */}
        <path
          d="M9 21.5 L17 29 L26 16"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground"
        />
        {/* Стрелка роста (вверх-вправо) */}
        <path
          d="M24 14 L32 6"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="text-foreground"
        />
        <path
          d="M26 6 L32 6 L32 12"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground"
        />
      </svg>
    </span>
  );
}
