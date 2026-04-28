import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  payload: Record<string, unknown>;
};

const KIND_LABEL: Record<string, string> = {
  order_delivered: "Доставлено",
  order_failed: "Не доставлено",
  order_returned: "Возврат на склад",
  qr_uploaded: "QR-код",
  payment_received: "Оплата",
};

const KIND_TONE: Record<string, string> = {
  order_delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  order_failed: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  order_returned: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

export function OrderNotificationsBlock({ orderId }: { orderId: string }) {
  const { data: items = [], isLoading } = useQuery<Row[]>({
    queryKey: ["notifications", "order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, is_read, created_at, payload")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Bell className="h-3.5 w-3.5" />
        Уведомления по заказу
        <span className="text-muted-foreground/70">({items.length})</span>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground">Уведомлений по этому заказу пока нет</div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex flex-wrap items-start gap-2 rounded border border-border/60 p-2 text-xs ${
                n.is_read ? "opacity-70" : ""
              }`}
            >
              <Badge
                variant="outline"
                className={KIND_TONE[n.kind] ?? "border-border bg-muted text-foreground"}
              >
                {KIND_LABEL[n.kind] ?? n.kind}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{n.body ?? n.title}</div>
                {Array.isArray((n.payload as { photos?: unknown }).photos) &&
                  ((n.payload as { photos: Array<{ kind: string; url: string }> }).photos.length > 0) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(n.payload as { photos: Array<{ kind: string; url: string }> }).photos.map((ph, i) => (
                        <a key={i} href={ph.url} target="_blank" rel="noopener noreferrer" title={ph.kind}>
                          <img src={ph.url} alt={ph.kind} className="h-12 w-12 rounded border border-border object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("ru-RU")}
                  {!n.is_read && <span className="ml-2 text-primary">• новое</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
