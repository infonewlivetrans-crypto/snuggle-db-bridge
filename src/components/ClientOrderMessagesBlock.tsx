import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, UserCog, Truck } from "lucide-react";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

type Msg = {
  id: string;
  target_role: "manager" | "driver";
  body: string;
  created_at: string;
  read_by_manager_at: string | null;
  read_by_driver_at: string | null;
};

export function ClientOrderMessagesBlock({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["order-client-messages", orderId],
    queryFn: () =>
      apiGetAuth<{ messages: Msg[] }>(`/api/orders/${orderId}/client-messages`),
    refetchOnWindowFocus: false,
  });

  const markRead = useMutation({
    mutationFn: () =>
      apiPatch<{ updated: number }>(`/api/orders/${orderId}/client-messages/mark-read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order-client-messages", orderId] }),
  });

  const hasUnread = (q.data?.messages ?? []).some((m) => !m.read_by_manager_at);
  useEffect(() => {
    if (hasUnread && !markRead.isPending) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  const messages = q.data?.messages ?? [];
  const managerMsgs = messages.filter((m) => m.target_role === "manager");
  const driverMsgs = messages.filter((m) => m.target_role === "driver");

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Сообщения от клиента
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка…</div>
      ) : q.isError ? (
        <div className="text-sm text-destructive">Не удалось загрузить сообщения</div>
      ) : (
        <div className="space-y-4">
          <Section
            icon={<UserCog className="h-3.5 w-3.5" />}
            title="Менеджеру"
            messages={managerMsgs}
            kind="manager"
          />
          <Section
            icon={<Truck className="h-3.5 w-3.5" />}
            title="Водителю"
            messages={driverMsgs}
            kind="driver"
          />
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  messages,
  kind,
}: {
  icon: React.ReactNode;
  title: string;
  messages: Msg[];
  kind: "manager" | "driver";
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon}
        {title}
        <span className="text-xs text-muted-foreground">({messages.length})</span>
      </div>
      {messages.length === 0 ? (
        <div className="text-xs text-muted-foreground">Сообщений нет.</div>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const isNew =
              kind === "manager" ? !m.read_by_manager_at : !m.read_by_driver_at;
            return (
              <li
                key={m.id}
                className="rounded-md border border-border bg-muted/30 p-2.5 text-sm"
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatDateTime(m.created_at)}</span>
                  {isNew && (
                    <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                      Новое
                    </Badge>
                  )}
                </div>
                <div className="whitespace-pre-wrap text-foreground">{m.body}</div>
              </li>
            );
          })}
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
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
