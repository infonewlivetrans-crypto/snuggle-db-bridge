import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/supply/notifications")({
  head: () => ({
    meta: [
      { title: "Уведомления снабжения" },
      { name: "description", content: "Дефицит, низкий остаток, перегруз" },
    ],
  }),
  component: SupplyNotificationsPage,
});

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const SUPPLY_KINDS = ["supply_alert", "stock_low", "stock_out", "stock_overflow", "stock_error"];

const LEVEL_STYLE: Record<string, string> = {
  out: "border-red-300 bg-red-100 text-red-900",
  critical: "border-orange-300 bg-orange-100 text-orange-900",
  low: "border-amber-300 bg-amber-100 text-amber-900",
};
const LEVEL_LABEL: Record<string, string> = {
  out: "Нет в наличии",
  critical: "Критический",
  low: "Низкий",
};

function SupplyNotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("unread");

  const { data, isLoading } = useQuery({
    queryKey: ["supply-notifications", filter],
    queryFn: async (): Promise<Notif[]> => {
      let q = db
        .from("notifications")
        .select("id, kind, title, body, payload, read_at, created_at")
        .in("kind", SUPPLY_KINDS)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "unread") q = q.is("read_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supply-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const ids = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
      if (ids.length === 0) return;
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Уведомления отмечены прочитанными");
      qc.invalidateQueries({ queryKey: ["supply-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unreadCount = useMemo(
    () => (data ?? []).filter((n) => !n.read_at).length,
    [data],
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Bell className="h-6 w-6 text-primary" />
              Уведомления снабжения
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Дефицит, низкий остаток, перегруз — {unreadCount} непрочитанных
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unread">Только новые</SelectItem>
                <SelectItem value="all">Все</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <Check className="mr-1 h-4 w-4" /> Отметить все
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/notifications">
                <ExternalLink className="mr-1 h-4 w-4" /> Все уведомления
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Уведомлений нет
            </div>
          ) : (
            (data ?? []).map((n) => {
              const level = (n.payload?.["level"] as string | undefined) ?? "";
              return (
                <div
                  key={n.id}
                  className={`rounded-lg border p-4 ${n.read_at ? "border-border bg-card" : "border-primary/30 bg-primary/5"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{n.title}</span>
                        {level && LEVEL_LABEL[level] && (
                          <Badge variant="outline" className={LEVEL_STYLE[level]}>
                            {LEVEL_LABEL[level]}
                          </Badge>
                        )}
                        {!n.read_at && (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            новое
                          </Badge>
                        )}
                      </div>
                      {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("ru-RU")}
                      </p>
                    </div>
                    {!n.read_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead.mutate(n.id)}
                        disabled={markRead.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
