import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  ClipboardList,
  Plus,
  Minus,
  RefreshCw,
  Truck,
  Search,
  Boxes,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { RouteSheetImportWizard } from "@/components/RouteSheetImportWizard";

export const Route = createFileRoute("/transport-requests/picker")({
  head: () => ({
    meta: [
      { title: "Подбор заказов в заявку — Радиус Трек" },
      { name: "description", content: "Подбор заказов в заявку на транспорт" },
    ],
  }),
  component: OrderPickerPage,
  validateSearch: (s: Record<string, unknown>) => ({
    requestId: typeof s.requestId === "string" ? s.requestId : undefined,
  }),
});

type OrderRow = {
  id: string;
  order_number: string;
  onec_order_number: string | null;
  status: string;
  delivery_address: string | null;
  delivery_zone: string | null;
  destination_city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  goods_amount: number | null;
  amount_due: number | null;
  created_at: string;
  source: string | null;
};

type RequestRow = {
  id: string;
  route_number: string;
  route_date: string;
  status: string;
  warehouse_id: string | null;
  destination_warehouse_id: string | null;
  unloading_zone: string | null;
  organization: string | null;
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  total_orders_amount: number | null;
};

type Warehouse = { id: string; name: string };

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ru-RU", { maximumFractionDigits: d });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU");
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  in_progress: "В работе",
  delivered: "Доставлен",
  cancelled: "Отменён",
  failed: "Не доставлен",
};

function generateRequestNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `ЗТ-${ymd}-${rnd}`;
}

function OrderPickerPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { requestId: initialRequestId } = Route.useSearch();

  const [requestId, setRequestId] = useState<string | undefined>(initialRequestId);

  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [managerFilter, setManagerFilter] = useState<string>("");

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-min"],
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["picker-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, delivery_address, contact_name, total_weight_kg, total_volume_m3, goods_amount, amount_due, created_at, source",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const ids = (data ?? []).map((o) => o.id);
      let extras: Array<{
        id: string;
        onec_order_number: string | null;
        delivery_zone: string | null;
        destination_city: string | null;
        contact_phone: string | null;
      }> = [];
      if (ids.length) {
        const { data: ex } = await db
          .from("orders")
          .select("id, onec_order_number, delivery_zone, destination_city, contact_phone")
          .in("id", ids);
        extras = ex ?? [];
      }
      const exMap = new Map(extras.map((e) => [e.id, e]));
      return (data ?? []).map((o) => {
        const e = exMap.get(o.id);
        return {
          ...o,
          onec_order_number: e?.onec_order_number ?? null,
          delivery_zone: e?.delivery_zone ?? null,
          destination_city: e?.destination_city ?? null,
          contact_phone: e?.contact_phone ?? null,
        } as OrderRow;
      });
    },
  });

  const { data: request } = useQuery({
    queryKey: ["picker-request", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await db
        .from("routes")
        .select(
          "id, route_number, route_date, status, warehouse_id, destination_warehouse_id, unloading_zone, organization, total_weight_kg, total_volume_m3, total_orders_amount",
        )
        .eq("id", requestId!)
        .single();
      if (error) throw error;
      return data as RequestRow;
    },
  });

  const { data: pickedOrderIds = [], refetch: refetchPicked } = useQuery({
    queryKey: ["picker-request-points", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await db
        .from("route_points")
        .select("order_id")
        .eq("route_id", requestId!);
      if (error) throw error;
      return ((data ?? []) as { order_id: string }[]).map((p) => p.order_id);
    },
  });

  const pickedSet = useMemo(() => new Set(pickedOrderIds), [pickedOrderIds]);
  const pickedOrders = useMemo(
    () => orders.filter((o) => pickedSet.has(o.id)),
    [orders, pickedSet],
  );

  const zones = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.delivery_zone) set.add(o.delivery_zone);
    });
    return Array.from(set).sort();
  }, [orders]);

  const availableOrders = useMemo(() => {
    return orders.filter((o) => {
      if (pickedSet.has(o.id)) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (zoneFilter !== "all" && (o.delivery_zone ?? "") !== zoneFilter) return false;
      if (warehouseFilter !== "all") {
      }
      if (dateFilter) {
        const d = new Date(o.created_at).toISOString().slice(0, 10);
        if (d !== dateFilter) return false;
      }
      if (clientFilter) {
        const txt = `${o.contact_name ?? ""} ${o.contact_phone ?? ""}`.toLowerCase();
        if (!txt.includes(clientFilter.toLowerCase())) return false;
      }
      if (managerFilter) {
      }
      if (search) {
        const q = search.toLowerCase();
        const txt = `${o.order_number} ${o.onec_order_number ?? ""} ${o.delivery_address ?? ""} ${o.contact_name ?? ""}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [
    orders,
    pickedSet,
    statusFilter,
    zoneFilter,
    warehouseFilter,
    dateFilter,
    clientFilter,
    managerFilter,
    search,
  ]);

  const pickedTotals = useMemo(() => {
    return pickedOrders.reduce(
      (acc, o) => {
        acc.weight += Number(o.total_weight_kg) || 0;
        acc.volume += Number(o.total_volume_m3) || 0;
        acc.amount += Number(o.goods_amount) || Number(o.amount_due) || 0;
        return acc;
      },
      { weight: 0, volume: 0, amount: 0 },
    );
  }, [pickedOrders]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["picker-orders"] });
    qc.invalidateQueries({ queryKey: ["picker-request-points", requestId] });
    qc.invalidateQueries({ queryKey: ["picker-request", requestId] });
    refetchOrders();
    refetchPicked();
  };

  const addOrder = async (orderId: string) => {
    if (!requestId) {
      toast.error("Сначала создайте или выберите заявку");
      return;
    }
    try {
      const { data: pts } = await db
        .from("route_points")
        .select("point_number")
        .eq("route_id", requestId);
      const next = ((pts ?? []) as { point_number: number }[]).reduce(
        (m, p) => Math.max(m, Number(p.point_number) || 0),
        0,
      ) + 1;

      const { error } = await db.from("route_points").insert({
        route_id: requestId,
        order_id: orderId,
        point_number: next,
      });
      if (error) throw error;
      toast.success("Заказ добавлен в заявку");
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    }
  };

  const removeOrder = async (orderId: string) => {
    if (!requestId) return;
    try {
      const { error } = await db
        .from("route_points")
        .delete()
        .eq("route_id", requestId)
        .eq("order_id", orderId);
      if (error) throw error;
      toast.success("Заказ убран из заявки");
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    }
  };

  const [creating, setCreating] = useState(false);
  const [newReqDate, setNewReqDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [newReqWh, setNewReqWh] = useState<string>("");
  const [newReqZone, setNewReqZone] = useState<string>("");

  const createRequest = async () => {
    setCreating(true);
    try {
      const number = generateRequestNumber();
      const { data, error } = await db
        .from("routes")
        .insert({
          route_number: number,
          route_date: newReqDate,
          warehouse_id: newReqWh || null,
          unloading_zone: newReqZone || null,
          status: "draft",
          request_status: "draft",
          request_type: "client_delivery",
          source: "manual",
        })
        .select()
        .single();
      if (error) throw error;
      setRequestId(data.id);
      navigate({
        to: "/transport-requests/picker",
        search: { requestId: data.id },
        replace: true,
      });
      toast.success(`Заявка ${number} создана`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Boxes className="h-6 w-6" />
              Подбор заказов в заявку на транспорт
            </h1>
            <p className="text-sm text-muted-foreground">
              Слева — доступные заказы, справа — текущая заявка
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Обновить
            </Button>
            <Button variant="outline" asChild>
              <Link to="/transport-requests">
                <ClipboardList className="mr-2 h-4 w-4" />
                К списку заявок
              </Link>
            </Button>
          </div>
        </div>

        <Card className="mb-4">
          <CardContent className="grid grid-cols-1 gap-3 py-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск: номер, адрес, клиент…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Склад" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все склады</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Зона выгрузки" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все зоны</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <Input
              placeholder="Клиент"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            />
            <Input
              placeholder="Менеджер (для 1С)"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_460px]">
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="text-sm font-medium">
                  Доступные заказы: {availableOrders.length}
                </div>
              </div>
              <div className="max-h-[calc(100vh-360px)] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Склад</TableHead>
                      <TableHead>Вид</TableHead>
                      <TableHead>Дата поставки</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>№ заказа</TableHead>
                      <TableHead>Зона</TableHead>
                      <TableHead>Адрес</TableHead>
                      <TableHead>Клиент</TableHead>
                      <TableHead>Менеджер</TableHead>
                      <TableHead className="text-right">Вес, кг</TableHead>
                      <TableHead className="text-right">Объём, м³</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      <TableRow>
                        <TableCell colSpan={14} className="py-8 text-center text-muted-foreground">
                          Загрузка…
                        </TableCell>
                      </TableRow>
                    ) : availableOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="py-8 text-center text-muted-foreground">
                          Нет заказов под фильтры
                        </TableCell>
                      </TableRow>
                    ) : (
                      availableOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs text-muted-foreground">—</TableCell>
                          <TableCell className="text-xs">Доставка</TableCell>
                          <TableCell className="text-xs">—</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {ORDER_STATUS_LABEL[o.status] ?? o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(o.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {o.onec_order_number || o.order_number}
                          </TableCell>
                          <TableCell className="text-xs">{o.delivery_zone ?? "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">
                            {o.delivery_address ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">{o.contact_name ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">—</TableCell>
                          <TableCell className="text-right text-xs">
                            {fmt(o.total_weight_kg)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {fmt(o.total_volume_m3, 3)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {fmt(o.goods_amount ?? o.amount_due)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addOrder(o.id)}
                              disabled={!requestId}
                              title={
                                requestId
                                  ? "Добавить в заявку"
                                  : "Сначала выберите или создайте заявку"
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="self-start">
            <CardContent className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Truck className="h-4 w-4" />
                Заявка на транспорт
              </div>

              {!requestId ? (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
                  <div className="text-sm text-muted-foreground">
                    Заявка не выбрана. Создайте новую:
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs text-muted-foreground">Дата загрузки</label>
                    <Input
                      type="date"
                      value={newReqDate}
                      onChange={(e) => setNewReqDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs text-muted-foreground">Склад</label>
                    <Select value={newReqWh} onValueChange={setNewReqWh}>
                      <SelectTrigger>
                        <SelectValue placeholder="Не выбран" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs text-muted-foreground">
                      Зона выгрузки / направление
                    </label>
                    <Input
                      value={newReqZone}
                      onChange={(e) => setNewReqZone(e.target.value)}
                      placeholder="Например: Север"
                    />
                  </div>
                  <Button onClick={createRequest} disabled={creating} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {creating ? "Создание…" : "Создать заявку на транспорт"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">№ заявки</span>
                      <Link
                        to="/transport-requests/$requestId"
                        params={{ requestId }}
                        className="font-mono text-foreground hover:underline"
                      >
                        {request?.route_number ?? "—"}
                      </Link>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Дата загрузки</span>
                      <span>{request ? fmtDate(request.route_date) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Склад</span>
                      <span>
                        {warehouses.find((w) => w.id === request?.warehouse_id)?.name ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Зона / направление</span>
                      <span>{request?.unloading_zone ?? "—"}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border">
                    <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                      Подобрано заказов: {pickedOrders.length}
                    </div>
                    <div className="max-h-[40vh] overflow-auto">
                      {pickedOrders.length === 0 ? (
                        <div className="p-4 text-sm italic text-muted-foreground">
                          Заказы не подобраны
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>№</TableHead>
                              <TableHead>Клиент</TableHead>
                              <TableHead className="text-right">Вес</TableHead>
                              <TableHead className="text-right">Объём</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pickedOrders.map((o) => (
                              <TableRow key={o.id}>
                                <TableCell className="font-mono text-xs">
                                  {o.onec_order_number || o.order_number}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {o.contact_name ?? "—"}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {fmt(o.total_weight_kg)}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {fmt(o.total_volume_m3, 3)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeOrder(o.id)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-lg border border-border p-2">
                      <div className="text-xs text-muted-foreground">Вес, кг</div>
                      <div className="font-bold">{fmt(pickedTotals.weight)}</div>
                    </div>
                    <div className="rounded-lg border border-border p-2">
                      <div className="text-xs text-muted-foreground">Объём, м³</div>
                      <div className="font-bold">{fmt(pickedTotals.volume, 3)}</div>
                    </div>
                    <div className="rounded-lg border border-border p-2">
                      <div className="text-xs text-muted-foreground">Сумма</div>
                      <div className="font-bold">{fmt(pickedTotals.amount)}</div>
                    </div>
                  </div>

                  <Button asChild className="w-full" variant="outline">
                    <Link to="/transport-requests/$requestId" params={{ requestId }}>
                      Открыть карточку заявки
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
