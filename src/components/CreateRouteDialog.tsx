import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Order } from "@/lib/orders";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/orders";
import type { Driver, Vehicle, BodyType } from "@/lib/carriers";
import { BODY_TYPE_LABELS, BODY_TYPE_ORDER } from "@/lib/carriers";
import type { Warehouse, TransportRequestType } from "@/lib/routes";
import {
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_ORDER,
  checkVehicleFit,
} from "@/lib/routes";
import { ArrowDown, ArrowUp, X, Search, MapPin, GripVertical, AlertTriangle, Scale, Box } from "lucide-react";

interface CreateRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRouteDialog({ open, onOpenChange }: CreateRouteDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [requestType, setRequestType] = useState<TransportRequestType>("client_delivery");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>("");
  const [requiredBodyType, setRequiredBodyType] = useState<BodyType | "">("");
  const [manualWeightKg, setManualWeightKg] = useState<string>("");
  const [manualVolumeM3, setManualVolumeM3] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Справочники
  const { data: drivers } = useQuery({
    queryKey: ["drivers", "active"],
    enabled: open,
    queryFn: async (): Promise<Driver[]> => {
      const { data, error } = await db
        .from("drivers")
        .select("id, full_name, is_active, carrier_id")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", "active"],
    enabled: open,
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await db
        .from("vehicles")
        .select("id, plate_number, brand, model, body_type, is_active, carrier_id, capacity_kg, volume_m3")
        .eq("is_active", true)
        .order("plate_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "active"],
    enabled: open,
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await db
        .from("warehouses")
        .select("id, name, city, address, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Доступные заказы
  const { data: orders } = useQuery({
    queryKey: ["orders", "available-for-route"],
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "in_progress", "awaiting_resend"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (!search) return orders;
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        (o.delivery_address?.toLowerCase().includes(q) ?? false),
    );
  }, [orders, search]);

  const ordersById = useMemo(() => {
    const m = new Map<string, Order>();
    (orders ?? []).forEach((o) => m.set(o.id, o));
    return m;
  }, [orders]);

  // Если выбрали машину/водителя одного перевозчика — автоподбор не делаем,
  // но сбрасываем при смене водителя, чтобы пользователь видел только машины перевозчика
  const selectedDriverCarrier = drivers?.find((d) => d.id === driverId)?.carrier_id;
  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    if (!selectedDriverCarrier) return vehicles;
    return vehicles.filter((v) => v.carrier_id === selectedDriverCarrier);
  }, [vehicles, selectedDriverCarrier]);

  useEffect(() => {
    if (vehicleId && filteredVehicles.length > 0 && !filteredVehicles.find((v) => v.id === vehicleId)) {
      setVehicleId("");
    }
  }, [filteredVehicles, vehicleId]);

  // Расчёт суммарного веса/объёма по выбранным заказам (для client_delivery)
  const computedTotals = useMemo(() => {
    let w = 0;
    let v = 0;
    let items = 0;
    for (const id of selectedIds) {
      const o = ordersById.get(id);
      if (!o) continue;
      w += Number(o.total_weight_kg ?? 0);
      v += Number(o.total_volume_m3 ?? 0);
      items += Number(o.items_count ?? 0);
    }
    return { w, v, items };
  }, [selectedIds, ordersById]);

  const isTransfer = requestType !== "client_delivery";
  const totalWeight = isTransfer ? Number(manualWeightKg || 0) : computedTotals.w;
  const totalVolume = isTransfer ? Number(manualVolumeM3 || 0) : computedTotals.v;

  const selectedVehicle = filteredVehicles.find((v) => v.id === vehicleId) ?? null;
  const fit = checkVehicleFit({
    vehicle: selectedVehicle,
    totalWeightKg: totalWeight,
    totalVolumeM3: totalVolume,
    requiredBodyType: requiredBodyType || null,
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const move = (idx: number, dir: -1 | 1) => {
    setSelectedIds((prev) => {
      const next = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const remove = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const reset = () => {
    setDriverId("");
    setVehicleId("");
    setWarehouseId("");
    setDestinationWarehouseId("");
    setRequestType("client_delivery");
    setRequiredBodyType("");
    setManualWeightKg("");
    setManualVolumeM3("");
    setComment("");
    setSearch("");
    setSelectedIds([]);
    setRouteDate(new Date().toISOString().slice(0, 10));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!driverId) throw new Error("Выберите водителя");
      if (requestType === "client_delivery" && selectedIds.length === 0)
        throw new Error("Выберите хотя бы один заказ");
      if (requestType === "warehouse_transfer" && !destinationWarehouseId)
        throw new Error("Укажите склад назначения");

      const driver = drivers?.find((d) => d.id === driverId);
      const driverName = driver?.full_name ?? "";

      const { data: numData, error: numErr } = await supabase.rpc("generate_route_number");
      if (numErr) throw numErr;
      const routeNumber = numData as string;

      const { data: route, error: routeErr } = await db
        .from("routes")
        .insert({
          route_number: routeNumber,
          driver_name: driverName,
          driver_id: driverId,
          vehicle_id: vehicleId || null,
          warehouse_id: warehouseId || null,
          destination_warehouse_id: destinationWarehouseId || null,
          request_type: requestType,
          required_body_type: requiredBodyType || null,
          required_capacity_kg: totalWeight > 0 ? totalWeight : null,
          required_volume_m3: totalVolume > 0 ? totalVolume : null,
          route_date: routeDate,
          planned_departure_at: null,
          comment: comment.trim() || null,
          status: "planned",
          // Для warehouse_transfer передадим вручную, иначе пересчитает триггер
          total_weight_kg: isTransfer ? totalWeight : 0,
          total_volume_m3: isTransfer ? totalVolume : 0,
        })
        .select()
        .single();
      if (routeErr) throw routeErr;

      if (selectedIds.length > 0) {
        const points = selectedIds.map((orderId, idx) => ({
          route_id: route.id,
          order_id: orderId,
          point_number: idx + 1,
          status: "pending" as const,
        }));
        const { error: pointsErr } = await supabase.from("route_points").insert(points);
        if (pointsErr) throw pointsErr;
      }

      return route;
    },
    onSuccess: (route) => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Маршрут ${route.route_number} создан`);
      reset();
      onOpenChange(false);
      navigate({ to: "/routes/$routeId", params: { routeId: route.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Заявка на транспорт</DialogTitle>
          <DialogDescription>
            Тип заявки, склады, требуемая машина и состав груза
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Тип заявки */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Тип заявки *</Label>
              <Select value={requestType} onValueChange={(v) => setRequestType(v as TransportRequestType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {REQUEST_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Требуемый тип кузова</Label>
              <Select value={requiredBodyType} onValueChange={(v) => setRequiredBodyType(v as BodyType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Любой" />
                </SelectTrigger>
                <SelectContent>
                  {BODY_TYPE_ORDER.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BODY_TYPE_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Параметры маршрута */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Склад отправки</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={(warehouses?.length ?? 0) === 0 ? "Сначала добавьте склад" : "Выберите склад"} />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.city ? ` · ${w.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {requestType === "warehouse_transfer" && (
              <div>
                <Label>Склад назначения *</Label>
                <Select value={destinationWarehouseId} onValueChange={setDestinationWarehouseId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Выберите склад" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehouses ?? []).filter((w) => w.id !== warehouseId).map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                        {w.city ? ` · ${w.city}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Склад отправки</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={(warehouses?.length ?? 0) === 0 ? "Сначала добавьте склад" : "Выберите склад"} />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.city ? ` · ${w.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата</Label>
              <Input
                type="date"
                value={routeDate}
                onChange={(e) => setRouteDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Водитель *</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={(drivers?.length ?? 0) === 0 ? "Нет активных водителей" : "Выберите водителя"} />
                </SelectTrigger>
                <SelectContent>
                  {(drivers ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Автомобиль</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={filteredVehicles.length === 0 ? "Нет машин" : "Выберите авто"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate_number} · {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Комментарий</Label>
            <Input
              placeholder="Например: утренний рейс"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Выбор заказов */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Доступные заказы</Label>
              <span className="text-xs text-muted-foreground">
                Выбрано: {selectedIds.length}
              </span>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по номеру или адресу"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Нет доступных заказов
                </div>
              ) : (
                filtered.map((o) => {
                  const checked = selectedIds.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-start gap-3 border-b border-border p-3 last:border-b-0 hover:bg-secondary/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSelect(o.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {o.order_number}
                          </span>
                          <Badge variant="outline" className={STATUS_STYLES[o.status]}>
                            {STATUS_LABELS[o.status]}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {o.delivery_address ??
                              (o.latitude !== null && o.longitude !== null
                                ? `По координатам: ${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`
                                : "Без локации")}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Порядок доставки */}
          {selectedIds.length > 0 && (
            <div>
              <Label>Порядок доставки</Label>
              <div className="mt-2 space-y-2">
                {selectedIds.map((id, idx) => {
                  const o = ordersById.get(id);
                  if (!o) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm font-semibold">{o.order_number}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {o.delivery_address ??
                            (o.latitude !== null && o.longitude !== null
                              ? `${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`
                              : "—")}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(idx, 1)}
                        disabled={idx === selectedIds.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => remove(id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Создание..." : "Создать маршрут"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
