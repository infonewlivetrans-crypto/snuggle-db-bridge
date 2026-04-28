import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Hash, Calendar, Warehouse, Save, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  DELIVERY_ROUTE_STATUS_LABELS,
  DELIVERY_ROUTE_STATUS_ORDER,
  DELIVERY_ROUTE_STATUS_STYLES,
  type DeliveryRouteStatus,
} from "@/lib/deliveryRoutes";
import { RouteExecutionBlock } from "@/components/RouteExecutionBlock";

export const Route = createFileRoute("/delivery-routes/$deliveryRouteId")({
  head: () => ({
    meta: [
      { title: "Маршрут — Радиус Трек" },
      { name: "description", content: "Карточка маршрута доставки" },
    ],
  }),
  component: DeliveryRoutePage,
});

type Detail = {
  id: string;
  route_number: string;
  route_date: string;
  status: DeliveryRouteStatus;
  comment: string | null;
  source_request_id: string;
  source_warehouse_id: string | null;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
  source_request: { route_number: string } | null;
  source_warehouse: { name: string; city: string | null } | null;
};

type PointRow = {
  id: string;
  point_number: number;
  client_window_from: string | null;
  client_window_to: string | null;
  order: {
    order_number: string;
    contact_name: string | null;
    delivery_address: string | null;
    comment: string | null;
  } | null;
};

function DeliveryRoutePage() {
  const { deliveryRouteId } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-route", deliveryRouteId],
    queryFn: async (): Promise<Detail | null> => {
      const { data, error } = await supabase
        .from("delivery_routes")
        .select(
          "id, route_number, route_date, status, comment, source_request_id, source_warehouse_id, assigned_driver, assigned_vehicle, source_request:source_request_id(route_number), source_warehouse:source_warehouse_id(name, city)",
        )
        .eq("id", deliveryRouteId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Detail | null;
    },
  });

  const { data: points } = useQuery({
    enabled: !!data?.source_request_id,
    queryKey: ["delivery-route-points", data?.source_request_id],
    queryFn: async (): Promise<PointRow[]> => {
      const { data: pts, error } = await supabase
        .from("route_points")
        .select(
          "id, point_number, client_window_from, client_window_to, order:order_id(order_number, contact_name, delivery_address, comment)",
        )
        .eq("route_id", data!.source_request_id)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return (pts ?? []) as unknown as PointRow[];
    },
  });

  const [status, setStatus] = useState<DeliveryRouteStatus>("formed");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (data) {
      setStatus(data.status);
      setComment(data.comment ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_routes")
        .update({ status, comment: comment || null })
        .eq("id", deliveryRouteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Маршрут сохранён");
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmt = (t: string | null) => (t ? t.slice(0, 5) : null);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link to="/delivery-routes">
          <Button variant="ghost" size="sm" className="mb-4 gap-1.5">
            <ArrowLeft className="h-4 w-4" />К списку маршрутов
          </Button>
        </Link>

        {isLoading ? (
          <div className="text-muted-foreground">Загрузка...</div>
        ) : !data ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Маршрут не найден</p>
          </div>
        ) : (
          <div className="space-y-5 rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <Hash className="h-6 w-6 text-muted-foreground" />
                  {data.route_number}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Маршрут доставки</p>
              </div>
              <Badge variant="outline" className={DELIVERY_ROUTE_STATUS_STYLES[data.status]}>
                {DELIVERY_ROUTE_STATUS_LABELS[data.status]}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field icon={<Calendar className="h-4 w-4" />} label="Дата">
                {new Date(data.route_date).toLocaleDateString("ru-RU")}
              </Field>
              <Field icon={<Hash className="h-4 w-4" />} label="Заявка">
                {data.source_request ? (
                  <Link
                    to="/transport-requests/$requestId"
                    params={{ requestId: data.source_request_id }}
                    className="text-primary hover:underline"
                  >
                    {data.source_request.route_number}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
              <Field icon={<Warehouse className="h-4 w-4" />} label="Склад отправления">
                {data.source_warehouse ? (
                  <>
                    {data.source_warehouse.name}
                    {data.source_warehouse.city ? `, ${data.source_warehouse.city}` : ""}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
            </div>

            {/* Управление статусом */}
            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Статус и комментарий
              </div>
              <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-start">
                <Select value={status} onValueChange={(v) => setStatus(v as DeliveryRouteStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_ROUTE_STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DELIVERY_ROUTE_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Комментарий к маршруту"
                  rows={2}
                />
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
                  <Save className="h-4 w-4" />
                  Сохранить
                </Button>
              </div>
            </div>

            {/* Исполнение маршрута: водитель + транспорт */}
            <RouteExecutionBlock
              deliveryRouteId={data.id}
              driver={data.assigned_driver}
              vehicle={data.assigned_vehicle}
            />

            {/* Точки маршрута */}
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Точки маршрута
                  <span className="text-muted-foreground">({points?.length ?? 0})</span>
                </h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">№</TableHead>
                    <TableHead>Заказ</TableHead>
                    <TableHead>Клиент</TableHead>
                    <TableHead>Адрес</TableHead>
                    <TableHead>Окно</TableHead>
                    <TableHead>Комментарий</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(points ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        В заявке нет точек доставки
                      </TableCell>
                    </TableRow>
                  ) : (
                    (points ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.point_number}</TableCell>
                        <TableCell>{p.order?.order_number ?? "—"}</TableCell>
                        <TableCell>{p.order?.contact_name ?? "—"}</TableCell>
                        <TableCell className="max-w-[260px] truncate">
                          {p.order?.delivery_address ?? "—"}
                        </TableCell>
                        <TableCell>
                          {p.client_window_from || p.client_window_to ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {fmt(p.client_window_from) ?? "—"}–{fmt(p.client_window_to) ?? "—"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {p.order?.comment ?? ""}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}
