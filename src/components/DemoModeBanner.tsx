import { Link } from "@tanstack/react-router";
import { Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDemoMode } from "@/lib/demo-mode";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "demo-mode-banner-dismissed-v1";

/**
 * Информационный баннер на главной — поясняет, что система в демо-режиме,
 * и предлагает загрузить реальные данные. Скрывается до конца сессии,
 * если пользователь нажал «×».
 */
export function DemoModeBanner() {
  const { isDemo, ordersCount, routesCount } = useDemoMode();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* sessionStorage недоступен — оставляем баннер */
    }
  }, []);

  if (!isDemo || dismissed) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Демо-режим</div>
        <p className="mt-0.5 leading-snug">
          В системе сейчас тестовые данные ({ordersCount} заказов, {routesCount} рейсов) — реалистичные примеры
          для демонстрации работы платформы. Чтобы начать работать с настоящими данными, импортируйте их
          из&nbsp;
          <Link to="/data-import" className="underline underline-offset-2 hover:text-amber-700">
            Excel/CSV
          </Link>
          &nbsp;или&nbsp;
          <Link to="/upload" className="underline underline-offset-2 hover:text-amber-700">
            загрузите файл
          </Link>
          .
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
        onClick={() => {
          try {
            sessionStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        aria-label="Скрыть"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
