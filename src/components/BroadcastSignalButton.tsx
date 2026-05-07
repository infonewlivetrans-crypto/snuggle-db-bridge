// Кнопка «Отправить сигнал подходящим авто».
// Подбирает подходящие свободные машины по требованиям рейса и
// создаёт предложения в route_offers (с expires_at) для всех найденных.
// Не дублирует уже активные предложения по этому рейсу.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { apiPost } from "@/lib/api-client";
import type { BodyType } from "@/lib/carriers";

export type SignalRequirements = {
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
  requirements: SignalRequirements;
  /** Срок жизни предложения в часах (мин. 1, по умолчанию 1). */
  expiresInHours?: number;
  className?: string;
};

type VehicleRow = {
  id: string;
  carrier_id: string;
  body_type: BodyType;
  capacity_kg: number | null;
  volume_m3: number | null;
  body_length_m: number | null;
  has_tent: boolean;
  has_straps: boolean;
  has_manipulator: boolean;
  is_active: boolean;
  carriers: { id: string; company_name: string | null; city: string | null } | null;
};

type DriverRow = { id: string; carrier_id: string; is_active: boolean };

type BusyRoute = {
  vehicle_id: string | null;
  planned_departure_at: string | null;
  route_date: string | null;
};

type OfferLite = { vehicle_id: string | null; status: string };

function num(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function vehicleFits(v: VehicleRow, req: SignalRequirements): boolean {
  if (req.required_body_type && v.body_type !== req.required_body_type) return false;
  const cap = num(v.capacity_kg);
  if (req.required_capacity_kg != null && (cap == null || cap < req.required_capacity_kg)) {
    return false;
  }
  const vol = num(v.volume_m3);
  if (req.required_volume_m3 != null && (vol == null || vol < req.required_volume_m3)) {
    return false;
  }
  const len = num(v.body_length_m);
  if (req.required_body_length_m != null && (len == null || len < req.required_body_length_m)) {
    return false;
  }
  if (req.requires_tent && !v.has_tent) return false;
  if (req.requires_straps && !v.has_straps) return false;
  if (req.requires_manipulator && !v.has_manipulator) return false;
  if (req.warehouse_city) {
    const reqCity = req.warehouse_city.trim().toLowerCase();
    const carrCity = v.carriers?.city?.trim().toLowerCase() ?? null;
    // Если у перевозчика город не указан — не отбрасываем.
    if (carrCity && carrCity !== reqCity) return false;
  }
  return true;
}

export function BroadcastSignalButton({
  routeId,
  transportRequestId,
  requirements,
  expiresInHours = 1,
  className,
}: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: vehicles } = useQuery({
    queryKey: ["broadcast-signal", "vehicles"],
    queryFn: async (): Promise<VehicleRow[]> => {
      const { data, error } = await db
        .from("vehicles")
        .select(
          "id, carrier_id, body_type, capacity_kg, volume_m3, body_length_m, has_tent, has_straps, has_manipulator, is_active, carriers:carrier_id(id, company_name, city)",
        )
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as VehicleRow[];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["broadcast-signal", "drivers"],
    queryFn: async (): Promise<DriverRow[]> => {
      const { data, error } = await db
        .from("drivers")
        .select("id, carrier_id, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as DriverRow[];
    },
  });

  const { data: busyRoutes } = useQuery({
    queryKey: ["broadcast-signal", "busy"],
    queryFn: async (): Promise<BusyRoute[]> => {
      const { data, error } = await db
        .from("routes")
        .select("vehicle_id, planned_departure_at, route_date, status")
        .in("status", ["planned", "in_progress"]);
      if (error) throw error;
      return (data ?? []) as BusyRoute[];
    },
  });

  const offersKey = ["broadcast-signal", "offers", routeId ?? null, transportRequestId ?? null];
  const { data: offers } = useQuery({
    queryKey: offersKey,
    enabled: !!(routeId || transportRequestId),
    queryFn: async (): Promise<OfferLite[]> => {
      let q = db.from("route_offers").select("vehicle_id, status");
      if (routeId) q = q.eq("route_id", routeId);
      else if (transportRequestId) q = q.eq("transport_request_id", transportRequestId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OfferLite[];
    },
  });

  const departureAt = requirements.planned_departure_at
    ? new Date(requirements.planned_departure_at)
    : null;

  const candidates = useMemo(() => {
    const list = vehicles ?? [];
    // Занятость: если у машины есть активный рейс с departure до планируемого — пропустить.
    const busyUntil: Record<string, Date> = {};
    for (const r of busyRoutes ?? []) {
      if (!r.vehicle_id) continue;
      const baseRaw = r.planned_departure_at ?? (r.route_date ? `${r.route_date}T00:00:00` : null);
      if (!baseRaw) continue;
      const base = new Date(baseRaw);
      const end = new Date(base.getTime() + 8 * 3600_000);
      if (!busyUntil[r.vehicle_id] || end > busyUntil[r.vehicle_id]) {
        busyUntil[r.vehicle_id] = end;
      }
    }

    // Уже активные предложения по этой заявке/рейсу — не дублируем.
    const activeOfferVehicleIds = new Set(
      (offers ?? [])
        .filter((o) => ["sent", "viewed", "accepted"].includes(o.status))
        .map((o) => o.vehicle_id)
        .filter((x): x is string => !!x),
    );

    const driverByCarrier = new Map<string, DriverRow>();
    for (const d of drivers ?? []) {
      if (!driverByCarrier.has(d.carrier_id)) driverByCarrier.set(d.carrier_id, d);
    }

    return list
      .filter((v) => vehicleFits(v, requirements))
      .filter((v) => {
        const until = busyUntil[v.id];
        if (!until) return true;
        // свободна, если занятость заканчивается до планируемого выезда
        return departureAt ? until <= departureAt : false;
      })
      .filter((v) => !activeOfferVehicleIds.has(v.id))
      .map((v) => ({
        carrierId: v.carrier_id,
        vehicleId: v.id,
        driverId: driverByCarrier.get(v.carrier_id)?.id ?? null,
      }));
  }, [vehicles, drivers, busyRoutes, offers, requirements, departureAt]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (candidates.length === 0) {
        throw new Error("Свободных подходящих авто нет");
      }
      let sent = 0;
      const errors: string[] = [];
      for (const c of candidates) {
        try {
          await apiPost(
            "/api/route-offers",
            {
              action: "send",
              routeId: routeId ?? null,
              transportRequestId: transportRequestId ?? null,
              carrierId: c.carrierId,
              vehicleId: c.vehicleId,
              driverId: c.driverId,
              expiresInHours: Math.max(1, expiresInHours),
              comment: "Новая подходящая заявка",
            },
            10000,
          );
          sent++;
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      return { sent, errors };
    },
    onMutate: () => setBusy(true),
    onSettled: () => setBusy(false),
    onSuccess: ({ sent, errors }) => {
      if (sent > 0) toast.success(`Сигнал отправлен подходящим авто: ${sent}`);
      if (errors.length > 0) toast.error(`Ошибок при отправке: ${errors.length}`);
      void qc.invalidateQueries({ queryKey: ["broadcast-signal"] });
      void qc.invalidateQueries({ queryKey: ["route-signals"] });
      void qc.invalidateQueries({ queryKey: ["route-offers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled =
    busy || sendMutation.isPending || (!routeId && !transportRequestId);

  return (
    <Button
      type="button"
      onClick={() => sendMutation.mutate()}
      disabled={disabled}
      className={className}
    >
      <Send className="mr-1.5 h-4 w-4" />
      {sendMutation.isPending
        ? "Отправка…"
        : `Отправить сигнал подходящим авто${candidates.length > 0 ? ` (${candidates.length})` : ""}`}
    </Button>
  );
}
