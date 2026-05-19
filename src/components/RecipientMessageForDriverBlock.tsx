import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

type Msg = {
  id: string;
  target_role: "driver";
  body: string;
  created_at: string;
  read_by_driver_at: string | null;
};

/**
 * 403 от backend для водителя — штатное «нет доступа к этому заказу» (например,
 * заказ был переназначен). Обрабатываем как пустой список, без красной ошибки
 * в Console и без throw, чтобы UI водителя оставался чистым.
 */
function isForbidden(err: unknown): boolean {
  return err instanceof Error && /HTTP 403\b/.test(err.message);
}

export function RecipientMessageForDriverBlock({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["driver-client-messages", orderId],
    queryFn: async () => {
      try {
        return await apiGetAuth<{ messages: Msg[] }>(
          `/api/orders/${orderId}/driver-client-messages`,
        );
      } catch (err) {
        if (isForbidden(err)) return { messages: [] as Msg[] };
        throw err;
      }
    },
    retry: (count, err) => !isForbidden(err) && count < 1,
    refetchOnWindowFocus: false,
  });

  const markRead = useMutation({
    mutationFn: async () => {
      try {
        return await apiPatch<{ updated: number }>(
          `/api/orders/${orderId}/driver-client-messages/mark-read`,
        );
      } catch (err) {
        if (isForbidden(err)) return { updated: 0 };
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-client-messages", orderId] });
      qc.invalidateQueries({ queryKey: ["driver-unread-client-msgs"] });
    },
  });

  const messages = q.data?.messages ?? [];
  const hasUnread = messages.some((m) => !m.read_by_driver_at);
  useEffect(() => {
    if (hasUnread && !markRead.isPending) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  if (!q.isLoading && messages.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
        <MessageSquare className="h-3.5 w-3.5" />
        Сообщение от получателя
      </div>
      {q.isLoading ? (
        <div className="text-xs text-muted-foreground">Загрузка…</div>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-border bg-background p-2 text-sm"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{formatDateTime(m.created_at)}</span>
                {!m.read_by_driver_at && (
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/10 text-primary"
                  >
                    Новое
                  </Badge>
                )}
              </div>
              <div className="whitespace-pre-wrap text-foreground">{m.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
