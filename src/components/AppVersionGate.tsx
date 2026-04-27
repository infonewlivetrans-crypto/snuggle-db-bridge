import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import {
  fetchAppVersion,
  checkVersion,
  APP_CLIENT_VERSION,
  type VersionCheckResult,
} from "@/lib/system-settings";

/**
 * Проверяет версию приложения при старте.
 * Если версия ниже минимальной — показывает блокирующее окно.
 * Если доступно мягкое обновление — показывает закрываемый баннер.
 */
export function AppVersionGate() {
  const [result, setResult] = useState<VersionCheckResult>({ status: "ok" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const version = await fetchAppVersion();
        if (cancelled) return;
        setResult(checkVersion(version));
      } catch {
        // Сеть недоступна — не блокируем работу.
      }
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000); // повторная проверка каждые 5 минут
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (result.status === "ok") return null;

  if (result.status === "force_update") {
    const v = result.version;
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Требуется обновление
            </DialogTitle>
            <DialogDescription>
              {v.update_message ?? "Доступна новая версия приложения. Обновите приложение для продолжения работы."}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Текущая версия: <span className="font-mono">{APP_CLIENT_VERSION}</span>
            <br />
            Требуется не ниже: <span className="font-mono">{v.minimum_required_version}</span>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={() => window.location.reload()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Обновить
            </Button>
            {v.app_store_url && (
              <Button asChild variant="outline">
                <a href={v.app_store_url} target="_blank" rel="noreferrer">App Store</a>
              </Button>
            )}
            {v.play_market_url && (
              <Button asChild variant="outline">
                <a href={v.play_market_url} target="_blank" rel="noreferrer">Google Play</a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Мягкое обновление — баннер
  if (dismissed) return null;
  const v = result.version;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <Download className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium text-sm">Доступна новая версия {v.current_version}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {v.update_message ?? "Обновите приложение, чтобы получить новые возможности."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => window.location.reload()} className="gap-1">
              <RefreshCw className="h-3 w-3" /> Обновить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Позже
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
