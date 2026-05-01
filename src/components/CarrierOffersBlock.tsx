import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Send, Truck, Clock, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { useServerFn } from "@tanstack/react-start";
import { sendRouteOffer, updateOfferStatus } from "@/server/route-offers.functions";
import {
  BODY_TYPE_LABELS,
  type BodyType,
  type Vehicle,
  type Carrier,
  type Driver,
} from "@/lib/carriers";

export type OfferRequirements = {
  required_body_type: BodyType | null;
  required_capacity_kg: number | null;
  required_volume_m3: number | null;
  required_body_length_m: number | null;
  requires_tent: boolean | null;
  requires_manipulator: boolean | null;
  requires_straps: boolean | null;
  warehouse_city?: string | null;
  planned_departure_at: string | null;
};

type Props = {
  routeId?: string | null;
  transportRequestId?: string | null;
  requirements: OfferRequirements;
};

type VehicleRow = Vehicle & {
  carriers: Pick<Carrier, "id" | "company_name" | "city"> | null;
};

type OfferRow = {
  id: string;
  route_id: string | null;
  transport_request_id: string | null;
  carrier_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  status: "sent" | "viewed" | "accepted" | "declined" | "expired";
  sent_at: string;
  viewed_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
  decline_reason: string | null;
  comment: string | null;
};

const OFFER_STATUS_LABELS: Record<OfferRow["status"], string> = {
  sent: "Отправлено",
  viewed: "Просмотрено",
  accepted: "Принято",
  declined: "Отклонено",
  expired: "Истекло",
};

const OFFER_STATUS_STYLES: Record<OfferRow["status"], string> = {
  sent: "bg-blue-100 text-blue-900 border-blue-200",
  viewed: "bg-amber-100 text-amber-900 border-amber-200",
  accepted: "bg-green-100 text-green-900 border-green-200",
  declined: "bg-red-100 text-red-900 border-red-200",
  expired: "bg-muted text-muted-foreground border-border",
};

type VehicleAvailabilityStatus = "free" | "busy" | "free_in_time" | "unavailable";

type ScoredVehicle = {
  vehicle: VehicleRow;
  driver: Driver | null;
  busyUntil: Date | null;
  availability: VehicleAvailabilityStatus;
  fits: boolean;
  reasons: string[];
};

function num(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function CarrierOffersBlock({ routeId, transportRequestId, requirements }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set()); // vehicle ids
  const sendOffer = useServerFn(sendRouteOffer);
  const updateOffer = useServerFn(updateOfferStatus);

  // 1. Загружаем все активные машины с перевозчиком
  const { data: vehicles } = useQuery({
    queryKey: ["route-offers", "vehicles"],
    queryFn: async (): Promise<VehicleRow[]> => {
      const { data, error } = await db
        .from("vehicles")
        .select("*, carriers:carrier_id(id, company_name, city)")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as VehicleRow[];
    },
  });

  // 2. Загружаем активные маршруты, чтобы вычислить «занятость» машин
  const { data: busyMap } = useQuery({
    queryKey: ["route-offers", "busy"],
    queryFn: async (): Promise<Record<string, Date>> => {
      const { data, error } = await db
        .from("routes")
        .select("vehicle_id, planned_departure_at, route_date, status")
        .in("status", ["planned", "in_progress"]);
      if (error) throw error;
      const map: Record<string, Date> = {};
      for (const r of (data ?? []) as Array<{
        vehicle_id: string | null;
        planned_departure_at: string | null;
        route_date: string | null;
      }>) {
        if (!r.vehicle_id) continue;
        const baseRaw = r.planned_departure_at ?? (r.route_date ? `${r.route_date}T00:00:00` : null);
        if (!baseRaw) continue;
        const base = new Date(baseRaw);
        const end = new Date(base.getTime() + 8 * 3600_000); // оценка: рейс длится ~8 часов
        if (!map[r.vehicle_id] || end > map[r.vehicle_id]) {
          map[r.vehicle_id] = end;
        }
      }
      return map;
    },
  });

  // 3. Загружаем драйверов (для подсказки)
  const { data: drivers } = useQuery({
    queryKey: ["route-offers", "drivers"],
    queryFn: async (): Promise<Driver[]> => {
      const { data, error } = await db
        .from("drivers")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Driver[];
    },
  });

  // 4. Существующие предложения
  const offersKey = ["route-offers", "offers", routeId ?? null, transportRequestId ?? null];
  const { data: offers } = useQuery({
    queryKey: offersKey,
    queryFn: async (): Promise<OfferRow[]> => {
      let q = db.from("route_offers").select("*").order("sent_at", { ascending: false });
      if (routeId) q = q.eq("route_id", routeId);
      else if (transportRequestId) q = q.eq("transport_request_id", transportRequestId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OfferRow[];
    },
  });

  const departureAt = requirements.planned_departure_at
    ? new Date(requirements.planned_departure_at)
    : null;

  const scored: ScoredVehicle[] = useMemo(() => {
    const list = vehicles ?? [];
    const driverByCarrier = new Map<string, Driver>();
    for (const d of drivers ?? []) {
      if (!driverByCarrier.has(d.carrier_id)) driverByCarrier.set(d.carrier_id, d);
    }

    return list.map((v) => {
      const reasons: string[] = [];
      const busyUntil = busyMap?.[v.id] ?? null;

      let availability: VehicleAvailabilityStatus = "free";
      if (busyUntil) {
        if (departureAt && busyUntil <= departureAt) {
          availability = "free_in_time";
        } else {
          availability = "busy";
          reasons.push(
            `Занята до ${busyUntil.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`,
          );
        }
      }

      // Проверки совместимости
      const cap = num(v.capacity_kg);
      if (requirements.required_capacity_kg != null) {
        if (cap == null) reasons.push("Нет данных о грузоподъёмности");
        else if (cap < requirements.required_capacity_kg)
          reasons.push(`Грузоподъёмность ${cap} < ${requirements.required_capacity_kg} кг`);
      }
      const vol = num(v.volume_m3);
      if (requirements.required_volume_m3 != null) {
        if (vol == null) reasons.push("Нет данных об объёме");
        else if (vol < requirements.required_volume_m3)
          reasons.push(`Объём ${vol} < ${requirements.required_volume_m3} м³`);
      }
      const len = num(v.body_length_m);
      if (requirements.required_body_length_m != null) {
        if (len == null) reasons.push("Нет данных о длине кузова");
        else if (len < requirements.required_body_length_m)
          reasons.push(`Длина ${len} < ${requirements.required_body_length_m} м`);
      }
      if (requirements.required_body_type && v.body_type !== requirements.required_body_type) {
        reasons.push(
          `Тип кузова: ${BODY_TYPE_LABELS[v.body_type]} ≠ ${BODY_TYPE_LABELS[requirements.required_body_type]}`,
        );
      }
      if (requirements.requires_straps && !v.has_straps) reasons.push("Нет ремней / креплений");
      if (requirements.requires_tent && !v.has_tent) reasons.push("Нет тента");
      if (requirements.requires_manipulator && !v.has_manipulator) reasons.push("Нет манипулятора");

      // Город (по перевозчику)
      const carrierCity = v.carriers?.city ?? null;
      const reqCity = requirements.warehouse_city ?? null;
      if (reqCity && carrierCity && carrierCity.trim().toLowerCase() !== reqCity.trim().toLowerCase()) {
        reasons.push(`Город перевозчика: ${carrierCity} ≠ ${reqCity}`);
      }

      return {
        vehicle: v,
        driver: driverByCarrier.get(v.carrier_id) ?? null,
        busyUntil,
        availability,
        fits: reasons.length === 0,
        reasons,
      };
    });
  }, [vehicles, drivers, busyMap, requirements, departureAt]);

  const sorted = useMemo(() => {
    return [...scored].sort((a, b) => {
      if (a.fits !== b.fits) return a.fits ? -1 : 1;
      const order: Record<VehicleAvailabilityStatus, number> = {
        free: 0,
        free_in_time: 1,
        busy: 2,
        unavailable: 3,
      };
      return order[a.availability] - order[b.availability];
    });
  }, [scored]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) throw new Error("Выберите машины для отправки предложения");
      const byVehicle = new Map(scored.map((s) => [s.vehicle.id, s]));
      for (const vid of ids) {
        const s = byVehicle.get(vid);
        if (!s) continue;
        await sendOffer({
          data: {
            routeId: routeId ?? null,
            transportRequestId: transportRequestId ?? null,
            carrierId: s.vehicle.carrier_id,
            vehicleId: s.vehicle.id,
            driverId: s.driver?.id ?? null,
            expiresInHours: 24,
            comment: null,
          },
        });
      }
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Отправлено предложений: ${n}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: offersKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (args: { offerId: string; status: OfferRow["status"] }) =>
      updateOffer({ data: { offerId: args.offerId, status: args.status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: offersKey });
      toast.success("Статус обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fitCount = sorted.filter((s) => s.fits).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4" />
          Подбор перевозчиков
          <Badge variant="outline" className="ml-2 font-normal">
            подходит: {fitCount} из {sorted.length}
          </Badge>
        </CardTitle>
        <Button
          size="sm"
          onClick={() => sendMutation.mutate()}
          disabled={selected.size === 0 || sendMutation.isPending}
        >
          <Send className="mr-1.5 h-4 w-4" />
          {sendMutation.isPending
            ? "Отправка…"
            : `Отправить предложение (${selected.size})`}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {(offers?.length ?? 0) > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Отправленные предложения
            </div>
            <div className="space-y-2">
              {(offers ?? []).map((o) => {
                const v = (vehicles ?? []).find((x) => x.id === o.vehicle_id);
                return (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 p-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={OFFER_STATUS_STYLES[o.status]}>
                        {OFFER_STATUS_LABELS[o.status]}
                      </Badge>
                      <span className="font-medium">
                        {v?.carriers?.company_name ?? "—"}
                      </span>
                      {v && (
                        <span className="text-muted-foreground">
                          {v.plate_number} · {v.brand ?? ""} {v.model ?? ""}
                        </span>
                      )}
                      {o.expires_at && (
                        <span className="text-xs text-muted-foreground">
                          до{" "}
                          {new Date(o.expires_at).toLocaleString("ru-RU", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                    {o.status === "sent" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateMutation.mutate({ offerId: o.id, status: "expired" })
                          }
                        >
                          Отозвать
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Доступные машины
          </div>
          {sorted.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Нет активных машин
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(({ vehicle: v, driver, busyUntil, availability, fits, reasons }) => (
                <div
                  key={v.id}
                  className={`rounded-md border p-3 text-sm ${
                    fits ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(v.id)}
                      onCheckedChange={() => toggle(v.id)}
                      className="mt-0.5"
                      disabled={!fits}
                    />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{v.carriers?.company_name ?? "—"}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono">{v.plate_number}</span>
                        <span className="text-muted-foreground">
                          {v.brand ?? ""} {v.model ?? ""} · {BODY_TYPE_LABELS[v.body_type]}
                        </span>
                        {fits ? (
                          <Badge className="bg-green-100 text-green-900 border-green-200">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Подходит
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-900">
                            <AlertCircle className="mr-1 h-3 w-3" /> Не подходит
                          </Badge>
                        )}
                        <AvailabilityBadge status={availability} busyUntil={busyUntil} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {driver && <span>Водитель: {driver.full_name}</span>}
                        {v.carriers?.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {v.carriers.city}
                          </span>
                        )}
                        {v.capacity_kg != null && <span>{v.capacity_kg} кг</span>}
                        {v.volume_m3 != null && <span>{v.volume_m3} м³</span>}
                        {v.body_length_m != null && <span>L {v.body_length_m} м</span>}
                        {busyUntil && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            освободится{" "}
                            {busyUntil.toLocaleString("ru-RU", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </div>
                      {reasons.length > 0 && (
                        <div className="text-xs text-red-700 dark:text-red-400">
                          {reasons.join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AvailabilityBadge({
  status,
  busyUntil,
}: {
  status: VehicleAvailabilityStatus;
  busyUntil: Date | null;
}) {
  const map: Record<VehicleAvailabilityStatus, { label: string; cls: string }> = {
    free: { label: "Свободна", cls: "bg-emerald-100 text-emerald-900 border-emerald-200" },
    free_in_time: {
      label: "Освободится к погрузке",
      cls: "bg-blue-100 text-blue-900 border-blue-200",
    },
    busy: { label: "Занята", cls: "bg-amber-100 text-amber-900 border-amber-200" },
    unavailable: { label: "Недоступна", cls: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[status];
  return (
    <Badge variant="outline" className={m.cls} title={busyUntil ? busyUntil.toISOString() : ""}>
      {m.label}
    </Badge>
  );
}



/**
 * Обёртка: грузит требования из routes по routeId и рендерит CarrierOffersBlock.
 */
export function CarrierOffersBlockForRoute({ routeId }: { routeId: string }) {
  const { data, isLoading } = useQueryWrap({
    queryKey: ["route-offers-requirements", routeId],
    queryFn: async (): Promise<OfferRequirements | null> => {
      const { data, error } = await db
        .from("routes")
        .select(
          "required_body_type, required_capacity_kg, required_volume_m3, required_body_length_m, requires_tent, requires_manipulator, requires_straps, planned_departure_at, warehouse:warehouse_id(city)",
        )
        .eq("id", routeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as Record<string, unknown>;
      const wh = r.warehouse as { city?: string | null } | null;
      return {
        required_body_type: (r.required_body_type as BodyType) ?? null,
        required_capacity_kg: (r.required_capacity_kg as number) ?? null,
        required_volume_m3: (r.required_volume_m3 as number) ?? null,
        required_body_length_m: (r.required_body_length_m as number) ?? null,
        requires_tent: (r.requires_tent as boolean) ?? null,
        requires_manipulator: (r.requires_manipulator as boolean) ?? null,
        requires_straps: (r.requires_straps as boolean) ?? null,
        warehouse_city: wh?.city ?? null,
        planned_departure_at: (r.planned_departure_at as string) ?? null,
      };
    },
  });

  if (isLoading || !data) return null;
  return <CarrierOffersBlock routeId={routeId} requirements={data} />;
}
