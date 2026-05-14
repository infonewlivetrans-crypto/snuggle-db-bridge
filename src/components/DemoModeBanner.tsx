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
    <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 truncate">
        <span className="font-semibold">Демо-режим:</span>{" "}
        <span className="text-amber-900/80 dark:text-amber-100/80">
          {ordersCount} заказов, {routesCount} рейсов.
        </span>{" "}
        <Link to="/data-import" className="underline underline-offset-2 hover:text-amber-700">
          Импортировать
        </Link>
        {" · "}
        <Link to="/upload" className="underline underline-offset-2 hover:text-amber-700">
          Загрузить файл
        </Link>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
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
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
