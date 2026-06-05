import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import type { FreightDTO, MatchResult, MatchVerdict } from "@/lib/dispatcher/types";

const ALLOWED_ROLES = ["admin", "dispatcher"];

// Транспорт, который участвует в подборе. archive не учитываем.
// «Подходящие» статусы: available, waiting_freight, new.
const ELIGIBLE_VEHICLE_STATUSES = ["available", "waiting_freight", "new"] as const;

interface VehicleRow {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  payload_kg: number | null;
  volume_m3: number | null;
  load_methods: string[] | null;
  home_city: string | null;
  ready_date: string | null;
  dispatcher_status: string;
  minimum_trip_rate: number | null;
  minimum_km_rate: number | null;
  dispatcher_driver_ext_id: string | null;
  dispatcher_carrier_ext_id: string | null;
}

interface DriverRow {
  id: string;
  full_name: string | null;
}
interface CarrierRow {
  id: string;
  name: string | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function evaluate(freight: FreightDTO, v: VehicleRow): { verdict: MatchVerdict; reasons: string[] } {
  const reasons: string[] = [];
  let hardFail = false;
  let softFail = false;

  // вес
  if (freight.weight_kg != null) {
    if (v.payload_kg != null && v.payload_kg >= freight.weight_kg) {
      reasons.push("вес подходит");
    } else if (v.payload_kg != null && v.payload_kg < freight.weight_kg) {
      reasons.push("не хватает грузоподъёмности");
      hardFail = true;
    } else {
      reasons.push("грузоподъёмность не указана");
      softFail = true;
    }
  }

  // объём
  if (freight.volume_m3 != null) {
    if (v.volume_m3 != null && v.volume_m3 >= freight.volume_m3) {
      reasons.push("объём подходит");
    } else if (v.volume_m3 != null && v.volume_m3 < freight.volume_m3) {
      reasons.push("не хватает объёма");
      hardFail = true;
    } else {
      reasons.push("объём не указан");
      softFail = true;
    }
  }

  // тип кузова
  if (freight.body_type && freight.body_type.trim()) {
    if (!v.body_type || !v.body_type.trim()) {
      reasons.push("кузов транспорта не указан");
      softFail = true;
    } else if (norm(v.body_type) === norm(freight.body_type)) {
      reasons.push("кузов подходит");
    } else {
      reasons.push("не совпадает тип кузова");
      hardFail = true;
    }
  }

  // способы загрузки
  const freightLM = (freight.load_methods ?? []).filter(Boolean);
  const vehicleLM = (v.load_methods ?? []).filter(Boolean);
  if (freightLM.length > 0) {
    if (vehicleLM.length === 0) {
      reasons.push("способы загрузки у машины не указаны");
      softFail = true;
    } else {
      const inter = vehicleLM.filter((m) => freightLM.includes(m));
      if (inter.length > 0) {
        reasons.push("загрузка подходит");
      } else {
        reasons.push("способы загрузки не совпадают");
        hardFail = true;
      }
    }
  }

  // готовность к дате
  if (freight.loading_date) {
    if (!v.ready_date) {
      reasons.push("дата готовности не указана");
      softFail = true;
    } else if (v.ready_date <= freight.loading_date) {
      reasons.push("машина готова к дате");
    } else {
      reasons.push("машина не готова к дате");
      hardFail = true;
    }
  }

  // город нахождения
  if (freight.loading_city && freight.loading_city.trim()) {
    if (v.home_city && norm(v.home_city) === norm(freight.loading_city)) {
      reasons.push("город совпадает");
    } else if (v.home_city) {
      reasons.push("другой город");
      softFail = true;
    }
  }

  // ставка ниже минимальной
  if (freight.rate != null && v.minimum_trip_rate != null && freight.rate < v.minimum_trip_rate) {
    reasons.push("ставка ниже минимальной");
    softFail = true;
  }

  let verdict: MatchVerdict = "fit";
  if (hardFail) verdict = "no_fit";
  else if (softFail) verdict = "partial";
  return { verdict, reasons };
}

export const Route = createFileRoute("/api/dispatcher/freights/$id/match-vehicles")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

        // 1. Достаём груз
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const freightRes: any = await (auth.client.from("dispatcher_freights" as never) as any)
          .select(
            "id, title, loading_city, unloading_city, loading_date, unloading_date, " +
              "cargo_name, weight_kg, volume_m3, body_type, load_methods, rate, " +
              "payment_type, payment_delay_days, source, source_url, " +
              "contact_name, contact_phone, contact_whatsapp, contact_telegram, contact_max_messenger, " +
              "comment, dispatcher_status, freight_kind, created_at, updated_at",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (freightRes.error) return jsonResponse({ error: freightRes.error.message }, { status: 500 });
        const freight: FreightDTO | null = freightRes.data;
        if (!freight) return jsonResponse({ error: "freight_not_found" }, { status: 404 });

        // 2. Достаём машины-кандидаты
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vehiclesRes: any = await (auth.client.from("dispatcher_vehicle_ext" as never) as any)
          .select(
            "id, vehicle_kind, body_type, payload_kg, volume_m3, load_methods, home_city, " +
              "ready_date, dispatcher_status, minimum_trip_rate, minimum_km_rate, " +
              "dispatcher_driver_ext_id, dispatcher_carrier_ext_id",
          )
          .in("dispatcher_status", ELIGIBLE_VEHICLE_STATUSES as readonly string[])
          .limit(500);
        if (vehiclesRes.error) return jsonResponse({ error: vehiclesRes.error.message }, { status: 500 });
        const vehicles: VehicleRow[] = vehiclesRes.data ?? [];

        // 3. Подтягиваем водителей/перевозчиков
        const driverIds = Array.from(
          new Set(vehicles.map((v) => v.dispatcher_driver_ext_id).filter((x): x is string => !!x)),
        );
        const carrierIds = Array.from(
          new Set(vehicles.map((v) => v.dispatcher_carrier_ext_id).filter((x): x is string => !!x)),
        );

        let drivers: DriverRow[] = [];
        let carriers: CarrierRow[] = [];
        if (driverIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r: any = await (auth.client.from("dispatcher_driver_ext" as never) as any)
            .select("id, full_name")
            .in("id", driverIds);
          drivers = r.data ?? [];
        }
        if (carrierIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r: any = await (auth.client.from("dispatcher_carrier_ext" as never) as any)
            .select("id, name")
            .in("id", carrierIds);
          carriers = r.data ?? [];
        }
        const driverMap = new Map(drivers.map((d) => [d.id, d.full_name]));
        const carrierMap = new Map(carriers.map((c) => [c.id, c.name]));

        // 4. Оценка
        const rows: MatchResult[] = vehicles.map((v) => {
          const { verdict, reasons } = evaluate(freight, v);
          const commission = freight.rate != null ? Math.round(freight.rate * 0.05) : null;
          return {
            vehicle_id: v.id,
            vehicle_kind: v.vehicle_kind,
            body_type: v.body_type,
            payload_kg: v.payload_kg,
            volume_m3: v.volume_m3,
            home_city: v.home_city,
            ready_date: v.ready_date,
            dispatcher_status: v.dispatcher_status,
            driver_id: v.dispatcher_driver_ext_id,
            driver_name: v.dispatcher_driver_ext_id
              ? driverMap.get(v.dispatcher_driver_ext_id) ?? null
              : null,
            carrier_id: v.dispatcher_carrier_ext_id,
            carrier_name: v.dispatcher_carrier_ext_id
              ? carrierMap.get(v.dispatcher_carrier_ext_id) ?? null
              : null,
            minimum_trip_rate: v.minimum_trip_rate,
            minimum_km_rate: v.minimum_km_rate,
            freight_rate: freight.rate,
            commission,
            verdict,
            reasons,
          };
        });

        // 5. Сортировка: fit → partial → no_fit
        const order: Record<MatchVerdict, number> = { fit: 0, partial: 1, no_fit: 2 };
        rows.sort((a, b) => order[a.verdict] - order[b.verdict]);

        return jsonResponse({ rows, total: rows.length });
      },
    },
  },
});
