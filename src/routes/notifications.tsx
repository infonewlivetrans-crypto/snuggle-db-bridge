import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bell, CheckCheck, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Уведомления — Радиус Трек" },
      { name: "description", content: "Внутренние уведомления по заказам и точкам маршрута" },
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
  order_awaiting_return: "Ожидает возврата на склад",
  order_return_accepted: "Возврат принят складом",
  qr_uploaded: "QR-код",
  payment_received: "Оплата",
  low_stock: "Остаток",
  delivery_report: "Отчёт по доставке",
  route_completed_report: "Маршрут завершён",
};

const KIND_TONE: Record<string, string> = {
  order_delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  order_failed: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  order_returned: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  order_awaiting_return: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  order_return_accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  delivery_report: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  route_completed_report: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

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

  const unreadCount = items.filter((i) => !i.is_read).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Bell className="h-6 w-6 text-muted-foreground" />
              Уведомления
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Всего: {items.length} · Непрочитанных: {unreadCount}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
            className="gap-1.5"
          >
            <CheckCheck className="h-4 w-4" />
            Прочитать все
          </Button>
        </div>

        {/* Завершённые маршруты — отдельный блок (web + mobile) */}
        {(() => {
          const routeItems = items.filter((i) => i.kind === "route_completed_report");
          if (routeItems.length === 0) return null;
          return (
            <div className="mb-6">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <FileText className="h-4 w-4" />
                Маршруты завершены
              </h2>
              <div className="space-y-2">
                {routeItems.map((n) => {
                  const p = n.payload as Record<string, unknown>;
                  const totals = (p.totals as Record<string, number> | undefined) ?? {};
                  const routeId = p.delivery_route_id as string | undefined;
                  const routeNumber = (p.route_number as string | undefined) ?? "—";
                  const driver = (p.driver as string | undefined) ?? "—";
                  const vehicle = (p.vehicle as string | undefined) ?? "—";
                  const diff = totals.amount_diff ?? 0;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        if (!n.is_read) toggleRead.mutate({ id: n.id, read: true });
                        if (routeId) {
                          navigate({
                            to: "/delivery-routes/$deliveryRouteId",
                            params: { deliveryRouteId: routeId },
                          });
                        }
                      }}
                      className={`block w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary ${
                        n.is_read ? "" : "bg-primary/5"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">Маршрут № {routeNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(n.created_at).toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Водитель: {driver} · Машина: {vehicle}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Доставлено: {totals.delivered ?? 0}
                        </span>
                        <span className="text-red-600">
                          Не доставлено: {totals.not_delivered ?? 0}
                        </span>
                        <span className="text-orange-600">
                          Возврат: {totals.returned ?? 0}
                        </span>
                        {diff !== 0 && (
                          <span className="font-medium text-red-600">
                            Расхождение по оплате: {(diff > 0 ? "+" : "") + diff.toLocaleString("ru-RU")}
                          </span>
                        )}
                      </div>
                      {!n.is_read && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                          <span className="h-2 w-2 rounded-full bg-primary" />
                          Новое
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Дата и время</TableHead>
                <TableHead>Заказ</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Причина</TableHead>
                <TableHead>Менеджер</TableHead>
                <TableHead className="w-[140px]">Прочитано</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Уведомлений пока нет
                  </TableCell>
                </TableRow>
              ) : (
                items.map((n) => {
                  const orderNumber = (n.payload?.order_number as string | undefined) ?? "—";
                  const reasonLabel = (n.payload?.reason_label as string | undefined) ?? null;
                  const expected = n.payload?.expected_return_at as string | undefined;
                  const manager = (n.payload?.manager_name as string | undefined) ?? null;
                  return (
                    <TableRow key={n.id} className={n.is_read ? "" : "bg-muted/30"}>
                      <TableCell className="font-mono text-xs">
                        {new Date(n.created_at).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="font-medium">№ {orderNumber}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={KIND_TONE[n.kind] ?? "border-border bg-muted text-foreground"}
                        >
                          {KIND_LABEL[n.kind] ?? n.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {n.kind === "order_failed" && reasonLabel ? (
                          reasonLabel
                        ) : n.kind === "order_returned" ? (
                          <span className="text-muted-foreground">
                            Ожид.: {expected ? new Date(expected).toLocaleString("ru-RU") : "не указано"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {manager ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {n.is_read ? (
                          <button
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() => toggleRead.mutate({ id: n.id, read: false })}
                          >
                            Прочитано
                          </button>
                        ) : (
                          <button
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={() => toggleRead.mutate({ id: n.id, read: true })}
                          >
                            Не прочитано
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
