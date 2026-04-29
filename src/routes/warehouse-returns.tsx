import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RotateCcw,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  PackageCheck,
  Image as ImageIcon,
  MessageSquare,
  Calendar,
  User as UserIcon,
} from "lucide-react";

export const Route = createFileRoute("/warehouse-returns")({
  head: () => ({
    meta: [
      { title: "Возвраты на склад — Радиус Трек" },
      { name: "description", content: "Обработка возвратов на склад: приёмка, проверка, брак, повторная отправка." },
    ],
  }),
  component: WarehouseReturnsPage,
});

type ReturnStatus = "expected" | "arrived" | "accepted" | "needs_check" | "defective" | "ready_to_resend";

const STATUS_LABELS: Record<ReturnStatus, string> = {
  expected: "Ожидается",
  arrived: "Прибыл на склад",
  accepted: "Принят складом",
  needs_check: "Требует проверки",
  defective: "Брак",
  ready_to_resend: "Готов к повторной отправке",
};

const STATUS_VARIANTS: Record<ReturnStatus, "default" | "secondary" | "destructive" | "outline"> = {
  expected: "outline",
  arrived: "secondary",
  accepted: "default",
  needs_check: "secondary",
  defective: "destructive",
  ready_to_resend: "default",
};

const REASON_LABELS: Record<string, string> = {
  client_absent: "клиента нет",
  client_no_answer: "клиент не отвечает",
  no_payment: "нет оплаты",
  no_qr: "нет QR-кода",
  client_refused: "отказ клиента",
  no_unloading: "нет возможности выгрузки",
  defective: "брак",
  other: "другое",
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WarehouseReturnsPage() {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState<string>("");
  const [acceptedBy, setAcceptedBy] = useState<string>("Кладовщик");

  const { data: warehouses } = useQuery({
    queryKey: ["wh-returns-warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id,name,city").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: points, isLoading } = useQuery({
    queryKey: ["wh-returns", warehouseId, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("route_points")
        .select(
          "id, order_id, route_id, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_status_changed_at, dp_status_changed_by, wh_return_status, wh_return_arrived_at, wh_return_accepted_at, wh_return_accepted_by, wh_return_comment, wh_return_status_changed_at, wh_return_status_changed_by",
        )
        .eq("dp_status", "returned_to_warehouse")
        .order("dp_expected_return_at", { ascending: true, nullsFirst: false });
      if (warehouseId !== "all") q = q.eq("dp_return_warehouse_id", warehouseId);
      if (statusFilter === "active") {
        q = q.in("wh_return_status", ["expected", "arrived", "needs_check"]);
      } else if (statusFilter !== "all") {
        q = q.eq("wh_return_status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderIds = useMemo(
    () => Array.from(new Set((points ?? []).map((p) => p.order_id).filter(Boolean) as string[])),
    [points],
  );
  const routeIds = useMemo(
    () => Array.from(new Set((points ?? []).map((p) => p.route_id).filter(Boolean) as string[])),
    [points],
  );
  const pointIds = useMemo(() => (points ?? []).map((p) => p.id), [points]);

  const { data: orders } = useQuery({
    queryKey: ["wh-returns-orders", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, contact_name, delivery_address")
        .in("id", orderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["wh-returns-routes", routeIds],
    enabled: routeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, route_number, driver_name, driver_id, vehicle_id")
        .in("id", routeIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const driverIds = useMemo(
    () => Array.from(new Set((routes ?? []).map((r) => r.driver_id).filter(Boolean) as string[])),
    [routes],
  );
  const vehicleIds = useMemo(
    () => Array.from(new Set((routes ?? []).map((r) => r.vehicle_id).filter(Boolean) as string[])),
    [routes],
  );

  const { data: drivers } = useQuery({
    queryKey: ["wh-returns-drivers", driverIds],
    enabled: driverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("id,full_name,phone").in("id", driverIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["wh-returns-vehicles", vehicleIds],
    enabled: vehicleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate_number, brand, model")
        .in("id", vehicleIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["wh-returns-photos", pointIds],
    enabled: pointIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_point_photos")
        .select("id, route_point_id, file_url, kind")
        .in("route_point_id", pointIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderById = useMemo(() => Object.fromEntries((orders ?? []).map((o) => [o.id, o])), [orders]);
  const routeById = useMemo(() => Object.fromEntries((routes ?? []).map((r) => [r.id, r])), [routes]);
  const driverById = useMemo(() => Object.fromEntries((drivers ?? []).map((d) => [d.id, d])), [drivers]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles ?? []).map((v) => [v.id, v])), [vehicles]);
  const photosByPoint = useMemo(() => {
    const m: Record<string, typeof photos> = {};
    for (const p of photos ?? []) {
      if (!m[p.route_point_id]) m[p.route_point_id] = [];
      m[p.route_point_id]!.push(p);
    }
    return m;
  }, [photos]);

  const updateStatus = useMutation({
    mutationFn: async (args: { id: string; status: ReturnStatus; comment?: string; accepted_by?: string }) => {
      const now = new Date().toISOString();
      const patch: Record<string, any> = {
        wh_return_status: args.status,
        wh_return_status_changed_at: now,
        wh_return_status_changed_by: args.accepted_by || acceptedBy || "Кладовщик",
      };
      if (args.status === "arrived" && !patch.wh_return_arrived_at) {
        patch.wh_return_arrived_at = now;
      }
      if (args.status === "accepted") {
        patch.wh_return_accepted_at = now;
        patch.wh_return_accepted_by = args.accepted_by || acceptedBy || "Кладовщик";
      }
      if (typeof args.comment === "string" && args.comment.trim().length > 0) {
        patch.wh_return_comment = args.comment.trim();
      }
      const { error } = await supabase.from("route_points").update(patch).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Статус возврата обновлён");
      qc.invalidateQueries({ queryKey: ["wh-returns"] });
      setOpenId(null);
      setComment("");
    },
    onError: (e: any) => toast.error(e.message ?? "Не удалось обновить"),
  });

  const open = openId ? (points ?? []).find((p) => p.id === openId) : null;
  const openOrder = open ? orderById[open.order_id] : null;
  const openRoute = open && open.route_id ? routeById[open.route_id] : null;
  const openDriver = openRoute?.driver_id ? driverById[openRoute.driver_id] : null;
  const openVehicle = openRoute?.vehicle_id ? vehicleById[openRoute.vehicle_id] : null;
  const openPhotos = open ? photosByPoint[open.id] ?? [] : [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Возвраты на склад</h1>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Склад</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все склады</SelectItem>
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} {w.city ? `· ${w.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Статус</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="expected">Ожидаются</SelectItem>
                <SelectItem value="arrived">Прибыли</SelectItem>
                <SelectItem value="accepted">Приняты</SelectItem>
                <SelectItem value="needs_check">Требуют проверки</SelectItem>
                <SelectItem value="defective">Брак</SelectItem>
                <SelectItem value="ready_to_resend">Готовы к повторной отправке</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <Label className="mb-1 block text-xs text-muted-foreground">Кто принимает</Label>
            <Input
              value={acceptedBy}
              onChange={(e) => setAcceptedBy(e.target.value)}
              className="w-[220px]"
              placeholder="Кладовщик / ФИО"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : (points ?? []).length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Возвратов нет
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(points ?? []).map((p) => {
              const o = orderById[p.order_id];
              const r = p.route_id ? routeById[p.route_id] : null;
              const d = r?.driver_id ? driverById[r.driver_id] : null;
              const v = r?.vehicle_id ? vehicleById[r.vehicle_id] : null;
              const ph = photosByPoint[p.id] ?? [];
              const status = (p.wh_return_status ?? "expected") as ReturnStatus;
              const reasonLabel = p.dp_undelivered_reason
                ? REASON_LABELS[p.dp_undelivered_reason as string] ?? (p.dp_undelivered_reason as string)
                : "не указана";
              return (
                <div
                  key={p.id}
                  className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30"
                  onClick={() => {
                    setOpenId(p.id);
                    setComment(p.wh_return_comment ?? "");
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-semibold">№ {o?.order_number ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        Маршрут {r?.route_number ?? "—"}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <UserIcon className="h-3.5 w-3.5" />
                      {(d?.full_name) || r?.driver_name || "—"}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Truck className="h-3.5 w-3.5" />
                      {v
                        ? [v.brand, v.model].filter(Boolean).join(" ") +
                          (v.plate_number ? ` · ${v.plate_number}` : "")
                        : "—"}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Причина: {reasonLabel}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      Ожидается: {fmt(p.dp_expected_return_at)}
                    </div>
                    {p.dp_return_comment && (
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5" />
                        <span className="line-clamp-2">{p.dp_return_comment}</span>
                      </div>
                    )}
                    {ph.length > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Фото: {ph.length}
                      </div>
                    )}
                    {status === "accepted" && (
                      <div className="mt-2 rounded-md bg-secondary p-2 text-xs">
                        Принято: {p.wh_return_accepted_by ?? "—"} · {fmt(p.wh_return_accepted_at)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Возврат №{openOrder?.order_number ?? "—"}
              </DialogTitle>
              <DialogDescription>
                Маршрут {openRoute?.route_number ?? "—"}
              </DialogDescription>
            </DialogHeader>

            {open && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Водитель</div>
                    <div>{(openDriver?.full_name) || openRoute?.driver_name || "—"}</div>
                    {openDriver?.phone && (
                      <div className="text-xs text-muted-foreground">{openDriver.phone}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Машина</div>
                    <div>
                      {openVehicle
                        ? [openVehicle.brand, openVehicle.model].filter(Boolean).join(" ") +
                          (openVehicle.plate_number ? ` · ${openVehicle.plate_number}` : "")
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Причина возврата</div>
                    <div>
                      {open.dp_undelivered_reason
                        ? REASON_LABELS[open.dp_undelivered_reason as string] ??
                          (open.dp_undelivered_reason as string)
                        : "не указана"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Ожидаемое время</div>
                    <div>{fmt(open.dp_expected_return_at)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs text-muted-foreground">Текущий статус</div>
                    <div>
                      <Badge variant={STATUS_VARIANTS[(open.wh_return_status ?? "expected") as ReturnStatus]}>
                        {STATUS_LABELS[(open.wh_return_status ?? "expected") as ReturnStatus]}
                      </Badge>
                    </div>
                  </div>
                </div>

                {open.dp_return_comment && (
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-1 text-xs text-muted-foreground">Комментарий водителя</div>
                    <div className="text-sm">{open.dp_return_comment}</div>
                  </div>
                )}

                {openPhotos.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs text-muted-foreground">Фото</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {openPhotos.map((ph) => (
                        <a
                          key={ph.id}
                          href={ph.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-md border border-border"
                        >
                          <img src={ph.file_url} alt="фото" className="h-24 w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {open.wh_return_arrived_at && (
                  <div className="text-xs text-muted-foreground">
                    Прибыл: {fmt(open.wh_return_arrived_at)}
                  </div>
                )}
                {open.wh_return_accepted_at && (
                  <div className="rounded-md bg-secondary p-3 text-sm">
                    <div className="font-medium">Принято складом</div>
                    <div className="text-muted-foreground">
                      Кто: {open.wh_return_accepted_by ?? "—"}
                      <br />
                      Когда: {fmt(open.wh_return_accepted_at)}
                    </div>
                    {open.wh_return_comment && (
                      <div className="mt-1">
                        <span className="text-xs text-muted-foreground">Комментарий склада: </span>
                        {open.wh_return_comment}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <Label className="mb-1 block text-sm">Комментарий склада</Label>
                  <Textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Состояние товара, упаковки и т.п."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => updateStatus.mutate({ id: open.id, status: "arrived", comment })}
                    disabled={updateStatus.isPending}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Машина прибыла
                  </Button>
                  <Button
                    onClick={() => updateStatus.mutate({ id: open.id, status: "accepted", comment, accepted_by: acceptedBy })}
                    disabled={updateStatus.isPending}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Принять возврат
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: open.id, status: "needs_check", comment })}
                    disabled={updateStatus.isPending}
                  >
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Отправить на проверку
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => updateStatus.mutate({ id: open.id, status: "defective", comment })}
                    disabled={updateStatus.isPending}
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Отметить как брак
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => updateStatus.mutate({ id: open.id, status: "ready_to_resend", comment })}
                    disabled={updateStatus.isPending}
                  >
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Готов к повторной отправке
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
