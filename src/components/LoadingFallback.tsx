import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Через сколько мс показать fallback с кнопкой "Обновить". По умолчанию 1500мс. */
  timeoutMs?: number;
  /** Колбэк "Обновить" — обычно refetch() от useQuery. */
  onRefresh?: () => void;
  /** Текст основного состояния. */
  label?: string;
  /** Класс контейнера. */
  className?: string;
};

/**
 * Универсальный fallback для загрузки.
 *
 * Поведение:
 * - первые `timeoutMs` мс показываем мягкий «Загрузка…» со спиннером
 *   (чтобы не моргало на быстрых ответах);
 * - после таймаута переключаемся на «Данные пока не загружены»
 *   с кнопкой «Обновить», чтобы не висеть бесконечно.
 *
 * Не блокирует весь экран — рендерится в потоке родителя.
 */
export function LoadingFallback({
  timeoutMs = 1500,
  onRefresh,
  label = "Загрузка…",
  className,
}: Props) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setStalled(true), timeoutMs);
    return () => window.clearTimeout(t);
  }, [timeoutMs]);

  if (!stalled) {
    return (
      <div
        className={
          "flex items-center gap-2 py-6 text-sm text-muted-foreground " +
          (className ?? "")
        }
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className={
        "flex flex-col items-start gap-2 py-6 text-sm text-muted-foreground " +
        (className ?? "")
      }
    >
      <div>Данные пока не загружены</div>
      {onRefresh ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Обновить
        </Button>
      ) : null}
    </div>
  );
}
