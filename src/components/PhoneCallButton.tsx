import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRuPhone, telHref } from "@/lib/phone";

type Props = {
  phone: string | null | undefined;
  /** Подпись слева от номера, например "Клиент" или "Менеджер". */
  label?: string;
  /** Если true — кнопка раскроется на всю ширину контейнера (удобно на мобильных). */
  fullWidth?: boolean;
  /** Размер кнопки. */
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  /** Колбэк после нажатия (например, для логирования). Не блокирует переход по tel:. */
  onCall?: (phone: string) => void;
  /** Если true — показывает только иконку и номер, без подписи (компактный режим). */
  compact?: boolean;
};

/**
 * Универсальная кнопка-звонок (tel:). Форматирует номер как "+7 XXX XXX-XX-XX",
 * показывает "нет контакта" если телефона нет.
 */
export function PhoneCallButton({
  phone,
  label,
  fullWidth,
  size = "lg",
  variant = "outline",
  className,
  onCall,
  compact,
}: Props) {
  const href = telHref(phone);
  const formatted = formatRuPhone(phone);

  if (!href) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[10px] border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground",
          fullWidth && "w-full",
          className,
        )}
      >
        <Phone className="h-4 w-4" />
        <span>{label ? `${label}: нет контакта` : "нет контакта"}</span>
      </div>
    );
  }

  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={cn(
        "h-11 gap-2",
        fullWidth && "w-full",
        size === "lg" && "min-h-11",
        className,
      )}
    >
      <a
        href={href}
        onClick={() => onCall?.(formatted)}
        aria-label={`Позвонить${label ? " " + label.toLowerCase() : ""}: ${formatted}`}
      >
        <Phone className="h-4 w-4 shrink-0" />
        {compact ? (
          <span className="truncate font-medium">{formatted}</span>
        ) : (
          <span className="flex flex-col items-start leading-tight">
            {label && <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</span>}
            <span className="truncate font-semibold">{formatted}</span>
          </span>
        )}
      </a>
    </Button>
  );
}
