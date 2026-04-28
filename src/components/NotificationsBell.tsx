import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, QrCode, CheckCircle2, AlertTriangle, PackageX, PackageSearch } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

type NotificationKind =
  | "qr_uploaded"
  | "order_delivered"
  | "order_failed"
  | "order_returned"
  | "payment_received"
  | "low_stock";

type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  order_id: string | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  qr_uploaded: QrCode,
  order_delivered: CheckCircle2,
  order_failed: AlertTriangle,
  order_returned: PackageX,
  payment_received: CheckCircle2,
  low_stock: PackageSearch,
};

const KIND_COLOR: Record<NotificationKind, string> = {
  qr_uploaded: "text-blue-600",
  order_delivered: "text-green-600",
  order_failed: "text-red-600",
  order_returned: "text-purple-600",
  payment_received: "text-green-600",
  low_stock: "text-orange-600",
};

export function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await (
        supabase.from as unknown as (n: string) => {
          select: (c: string) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => {
              limit: (n: number) => Promise<{ data: Notification[] | null; error: Error | null }>;
            };
          };
        }
      )("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const unreadCount = useMemo(() => items.filter((i) => !i.is_read).length, [items]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as Notification;
          qc.invalidateQueries({ queryKey: ["notifications"] });
          // Toast
          if (n.kind === "qr_uploaded") toast.info(n.title, { description: n.body ?? "" });
          else if (n.kind === "order_delivered") toast.success(n.title, { description: n.body ?? "" });
          else if (n.kind === "order_failed") toast.error(n.title, { description: n.body ?? "" });
          else if (n.kind === "order_returned") toast.warning(n.title, { description: n.body ?? "" });
          else toast(n.title, { description: n.body ?? "" });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const markAllRead = useMutation({
    mutationFn: async () => {
      const ids = items.filter((i) => !i.is_read).map((i) => i.id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Уведомления">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-sm font-semibold">
            Уведомления{unreadCount > 0 ? ` · ${unreadCount}` : ""}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Прочитать все
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Пока нет уведомлений
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={`flex gap-3 px-3 py-2.5 ${n.is_read ? "" : "bg-primary/5"}`}
                    onClick={() => {
                      if (!n.is_read) markOne.mutate(n.id);
                    }}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${KIND_COLOR[n.kind] ?? ""}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-foreground">{n.title}</div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {n.body && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>
                      )}
                    </div>
                    {!n.is_read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
