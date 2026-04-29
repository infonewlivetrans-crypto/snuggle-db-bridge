import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CheckCheck,
  FileText,
  QrCode,
  AlertTriangle,
  RotateCcw,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Мои уведомления — Радиус Трек" },
      { name: "description", content: "Уведомления менеджера: маршруты, QR, проблемы, возвраты, оплата" },
    ],
  }),
  component: NotificationsPage,
});

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  order_id: string | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  order_delivered: "Доставлено",
  order_failed: "Не доставлено",
  order_returned: "Возврат на склад",
  order_awaiting_return: "Ожидает возврата",
  order_return_accepted: "Возврат принят",
  qr_uploaded: "QR-код",
  payment_received: "Оплата",
  low_stock: "Остаток",
  delivery_report: "Отчёт по доставке",
  route_completed_report: "Маршрут завершён",
  driver_problem_reported: "Проблема по заказу",
  transport_request_warehouse_status: "Склад · заявка",
};

const KIND_TONE: Record<string, string> = {
  order_delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  order_failed: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  order_returned: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  order_awaiting_return: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  order_return_accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  qr_uploaded: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  delivery_report: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  route_completed_report: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  driver_problem_reported: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  transport_request_warehouse_status: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

type FilterKey = "all" | "routes" | "qr" | "problems" | "returns" | "payment_diff";

const FILTERS: { key: FilterKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all", label: "Все", icon: Bell },
  { key: "routes", label: "Маршруты", icon: FileText },
  { key: "qr", label: "QR-коды", icon: QrCode },
  { key: "problems", label: "Проблемы", icon: AlertTriangle },
  { key: "returns", label: "Возвраты", icon: RotateCcw },
  { key: "payment_diff", label: "Расхождения", icon: Wallet },
];

function matchesFilter(n: Row, f: FilterKey): boolean {
  if (f === "all") return true;
  if (f === "routes") return n.kind === "route_completed_report";
  if (f === "qr") return n.kind === "qr_uploaded";
  if (f === "problems") return n.kind === "driver_problem_reported" || n.kind === "order_failed";
  if (f === "returns") return n.kind === "order_returned" || n.kind === "order_awaiting_return" || n.kind === "order_return_accepted";
  if (f === "payment_diff") {
    if (n.kind === "route_completed_report") {
      const totals = (n.payload?.totals as Record<string, number> | undefined) ?? {};
      return Number(totals.amount_diff ?? 0) !== 0;
    }
    const diff = Number((n.payload?.amount_diff as number | undefined) ?? 0);
    return diff !== 0;
  }
  return true;
}

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: items = [], isLoading } = useQuery<Row[]>({
    queryKey: ["notifications", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, order_id, payload, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Все уведомления отмечены как прочитанные");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRead = useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: read, read_at: read ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => items.filter((n) => matchesFilter(n, filter)), [items, filter]);
  const unreadCount = items.filter((i) => !i.is_read).length;

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: items.length,
      routes: 0,
      qr: 0,
      problems: 0,
      returns: 0,
      payment_diff: 0,
    };
    for (const n of items) {
      for (const f of FILTERS) {
        if (f.key === "all") continue;
        if (matchesFilter(n, f.key)) c[f.key]++;
      }
    }
    return c;
  }, [items]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold sm:text-2xl">
              <Bell className="h-5 w-5 text-muted-foreground sm:h-6 sm:w-6" />
              Мои уведомления
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              Всего: {items.length} · Непрочитанных: {unreadCount}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
            className="h-8 gap-1.5 text-xs sm:h-9 sm:text-sm"
          >
            <CheckCheck className="h-4 w-4" />
            <span className="hidden xs:inline">Прочитать все</span>
            <span className="xs:hidden">Все</span>
          </Button>
        </div>

        {/* Фильтры — горизонтальный скролл на мобильном */}
        <div className="mb-3 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.key;
            const count = counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
                <span
                  className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                    active ? "bg-background/20 text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Уведомлений нет
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => (
              <NotificationCard
                key={n.id}
                n={n}
                onClick={() => {
                  if (!n.is_read) toggleRead.mutate({ id: n.id, read: true });
                  if (n.kind === "route_completed_report") {
                    const routeId = n.payload?.delivery_route_id as string | undefined;
                    if (routeId) {
                      navigate({
                        to: "/delivery-routes/$deliveryRouteId",
                        params: { deliveryRouteId: routeId },
                      });
                      return;
                    }
                  }
                  const orderId = n.order_id ?? (n.payload?.order_id as string | undefined);
                  if (orderId) {
                    navigate({ to: "/", search: { orderId } });
                  }
                }}
                onToggleRead={() => toggleRead.mutate({ id: n.id, read: !n.is_read })}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function NotificationCard({
  n,
  onClick,
  onToggleRead,
}: {
  n: Row;
  onClick: () => void;
  onToggleRead: () => void;
}) {
  const isRoute = n.kind === "route_completed_report";
  const orderNumber = (n.payload?.order_number as string | undefined) ?? null;
  const reasonLabel = (n.payload?.reason_label as string | undefined) ?? null;
  const manager = (n.payload?.manager_name as string | undefined) ?? null;
  const expected = n.payload?.expected_return_at as string | undefined;
  const diff = Number((n.payload?.amount_diff as number | undefined) ?? 0);

  return (
    <div
      className={`rounded-lg border border-border bg-card p-3 transition-colors ${
        n.is_read ? "" : "border-primary/40 bg-primary/5"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <Badge
            variant="outline"
            className={`${KIND_TONE[n.kind] ?? "border-border bg-muted text-foreground"} text-[11px]`}
          >
            {KIND_LABEL[n.kind] ?? n.kind}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {new Date(n.created_at).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {isRoute ? (
          <RouteCompletedSummary payload={n.payload} />
        ) : (
          <>
            <div className="text-sm font-medium">
              {orderNumber ? `Заказ № ${orderNumber}` : n.title}
            </div>
            {n.body && (
              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {n.body}
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {reasonLabel && <span>Причина: {reasonLabel}</span>}
              {n.kind === "order_returned" && (
                <span>
                  Ожид.: {expected ? new Date(expected).toLocaleString("ru-RU") : "—"}
                </span>
              )}
              {diff !== 0 && (
                <span className="font-medium text-red-600">
                  Расхождение: {(diff > 0 ? "+" : "") + diff.toLocaleString("ru-RU")}
                </span>
              )}
              {manager && <span>Менеджер: {manager}</span>}
            </div>
          </>
        )}
      </button>

      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
        <button
          type="button"
          className={`text-[11px] ${
            n.is_read
              ? "text-muted-foreground hover:underline"
              : "font-medium text-primary hover:underline"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead();
          }}
        >
          {n.is_read ? "Прочитано" : "Отметить прочитанным"}
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function RouteCompletedSummary({ payload }: { payload: Record<string, unknown> }) {
  const routeNumber = (payload.route_number as string | undefined) ?? "—";
  const driver = (payload.driver as string | undefined) ?? "—";
  const vehicle = (payload.vehicle as string | undefined) ?? "—";
  const totals = (payload.totals as Record<string, number> | undefined) ?? {};
  const diff = Number(totals.amount_diff ?? 0);
  return (
    <>
      <div className="text-sm font-semibold">Маршрут № {routeNumber}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {driver} · {vehicle}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-emerald-700 dark:text-emerald-400">
          Доставлено: {totals.delivered ?? 0}
        </span>
        <span className="text-red-600">Не доставлено: {totals.not_delivered ?? 0}</span>
        <span className="text-orange-600">Возврат: {totals.returned ?? 0}</span>
        {diff !== 0 && (
          <span className="font-medium text-red-600">
            Расхождение: {(diff > 0 ? "+" : "") + diff.toLocaleString("ru-RU")} ₽
          </span>
        )}
      </div>
    </>
  );
}
