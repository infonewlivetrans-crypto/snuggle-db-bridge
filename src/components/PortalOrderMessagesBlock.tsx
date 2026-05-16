import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, UserCog, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Msg = {
  id: string;
  target_role: "manager" | "driver";
  body: string;
  created_at: string;
  read_by_manager_at: string | null;
  read_by_driver_at: string | null;
};

const MAX = 2000;

export function PortalOrderMessagesBlock({
  token,
  orderId,
}: {
  token: string;
  orderId: string;
}) {
  return (
    <div className="space-y-4">
      <ChannelSection
        token={token}
        orderId={orderId}
        targetRole="manager"
        title="Написать менеджеру"
        icon={<UserCog className="h-3.5 w-3.5" />}
      />
      <ChannelSection
        token={token}
        orderId={orderId}
        targetRole="driver"
        title="Написать водителю"
        icon={<Truck className="h-3.5 w-3.5" />}
      />
    </div>
  );
}

function ChannelSection({
  token,
  orderId,
  targetRole,
  title,
  icon,
}: {
  token: string;
  orderId: string;
  targetRole: "manager" | "driver";
  title: string;
  icon: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const queryKey = ["portal-msgs", token, orderId, targetRole] as const;
  const base = `/api/public/client-portal/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderId)}/messages`;

  const q = useQuery({
    queryKey,
    queryFn: async (): Promise<Msg[]> => {
      const r = await fetch(`${base}?target_role=${targetRole}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { messages: Msg[] };
      return j.messages;
    },
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: async (body: string) => {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_role: targetRole, body }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "send_failed");
      }
    },
    onSuccess: () => {
      setText("");
      toast.success("Сообщение отправлено");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось отправить"),
  });

  const trimmed = text.trim();
  const canSend = trimmed.length >= 1 && trimmed.length <= MAX && !send.isPending;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX))}
        rows={3}
        placeholder="Напишите ваше сообщение…"
        className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm text-foreground"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {trimmed.length}/{MAX}
        </span>
        <Button
          size="sm"
          onClick={() => canSend && send.mutate(trimmed)}
          disabled={!canSend}
          className="gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          Отправить
        </Button>
      </div>

      <div className="space-y-1.5 pt-1">
        {q.isLoading ? (
          <div className="text-xs text-muted-foreground">Загрузка…</div>
        ) : q.isError ? (
          <div className="text-xs text-destructive">Не удалось загрузить</div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground">Пока нет сообщений.</div>
        ) : (
          <ul className="space-y-1.5">
            {(q.data ?? []).map((m) => {
              const readAt =
                targetRole === "manager" ? m.read_by_manager_at : m.read_by_driver_at;
              return (
                <li
                  key={m.id}
                  className="rounded-md border border-border bg-muted/30 p-2 text-sm"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{formatDateTime(m.created_at)}</span>
                    {readAt ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        Прочитано
                      </Badge>
                    ) : (
                      <Badge variant="outline">Отправлено</Badge>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap text-foreground">{m.body}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
