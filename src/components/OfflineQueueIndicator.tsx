import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudOff, RefreshCw } from "lucide-react";
import {
  flushQueue,
  isOnline,
  readQueue,
  subscribeQueue,
} from "@/lib/offlineQueue";

/**
 * Индикатор офлайн-очереди + автосинхронизация при появлении сети.
 * Монтируется один раз на странице водителя.
 */
export function OfflineQueueIndicator({
  invalidateKeys = [],
}: {
  invalidateKeys?: Array<readonly unknown[]>;
}) {
  const qc = useQueryClient();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState<boolean>(isOnline());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setCount(readQueue().length);
    refresh();
    const unsub = subscribeQueue(refresh);
    const onOnline = () => {
      setOnline(true);
      void runFlush();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Первичная попытка отправки
    void runFlush();
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runFlush() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await flushQueue();
      if (res.sent > 0) {
        toast.success(`Отправлено офлайн-действий: ${res.sent}`);
        for (const key of invalidateKeys) {
          qc.invalidateQueries({ queryKey: key as unknown[] });
        }
      }
    } finally {
      setBusy(false);
      setCount(readQueue().length);
    }
  }

  if (online && count === 0) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
        online
          ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
          : "border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-200"
      }`}
    >
      <CloudOff className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {online
          ? `В очереди ${count} действий — отправляем…`
          : `Нет сети. В очереди: ${count}. Действия сохранены и уйдут при подключении.`}
      </span>
      {online && count > 0 && (
        <button
          type="button"
          onClick={() => void runFlush()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-current px-2 py-1 hover:bg-background/40 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          Повторить
        </button>
      )}
    </div>
  );
}
