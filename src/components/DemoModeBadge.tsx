import { FlaskConical } from "lucide-react";
import { useDemoMode } from "@/lib/demo-mode";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Бейдж «Демо-режим» — показывается в шапке, когда в системе мало реальных данных
 * (преобладает seed). Помогает сразу понять, что цифры тестовые.
 */
export function DemoModeBadge() {
  const { isDemo } = useDemoMode();
  if (!isDemo) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="hidden h-7 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 md:inline-flex dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200"
            aria-label="Демо-режим"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Демо-режим
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Сейчас в системе тестовые данные для демонстрации функционала.
          Загрузите реальные данные через раздел «Импорт данных», чтобы перейти
          в рабочий режим.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
