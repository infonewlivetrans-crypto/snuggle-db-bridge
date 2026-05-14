import { cn } from "@/lib/utils";
import brandLogoSrc from "@/assets/brand-logo.jpeg";

interface BrandLogoProps {
  /** Размер иконки в px (определяет высоту лого) */
  size?: number;
  /** Показывать ли текст «Радиус Трек» рядом с иконкой */
  withText?: boolean;
  /** Вариант текста (оставлен для совместимости API; не влияет, т.к. лого — изображение) */
  textTone?: "dark" | "light";
  className?: string;
}

/**
 * Фирменный логотип «Радиус Трек».
 * Используется одно изображение бренда (знак + текст).
 */
export function BrandLogo({ size = 36, withText = true, className }: BrandLogoProps) {
  // Пропорции исходного изображения ~ 1:1 (знак занимает левую часть).
  // При withText=true показываем целиком; иначе — только знак (через BrandMark).
  if (!withText) {
    return <BrandMark size={size} className={className} />;
  }

  // Высота = size, ширина auto — изображение само сохраняет пропорции.
  return (
    <div className={cn("inline-flex items-center", className)}>
      <img
        src={brandLogoSrc}
        alt="Радиус Трек"
        style={{ height: size }}
        className="block w-auto select-none"
        draggable={false}
      />
    </div>
  );
}

/**
 * Только знак (без текста). Реализован как кроп левой части лого
 * через фиксированную ширину контейнера и object-position.
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
      className={cn("relative inline-block shrink-0 overflow-hidden", className)}
      style={{ width: size, height: size }}
      aria-label="Радиус Трек"
    >
      <img
        src={brandLogoSrc}
        alt="Радиус Трек"
        // Оригинал ~1:1, знак занимает примерно левую треть.
        // Растягиваем по высоте x3, выравниваем по левому краю — видна только иконка.
        style={{ height: size, width: size * 3, objectPosition: "left center" }}
        className="block max-w-none object-cover select-none"
        draggable={false}
      />
    </span>
  );
}
