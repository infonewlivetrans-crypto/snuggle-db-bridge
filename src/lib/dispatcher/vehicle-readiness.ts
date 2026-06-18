// Утилита для расчёта готовности машины к появлению на карте AI-диспетчера
// в кабинете перевозчика. Возвращает причины, почему машина пока не на карте.

export type ReadinessInput = {
  body_type?: string | null;
  payload_kg?: number | null;
  capacity_kg?: number | null;
  home_city?: string | null;
  current_city?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  driver_id?: string | null;
  dispatcher_driver_ext_id?: string | null;
  is_active?: boolean | null;
  dispatcher_status?: string | null;
  load_status?: string | null;
  ready_mode?: string | null;
};

const ARCHIVED = new Set(["archive", "inactive"]);

export function computeVehicleReadiness(v: ReadinessInput): {
  ready: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (v.dispatcher_status === "archive") {
    return { ready: false, reasons: ["Машина в архиве"] };
  }
  if (v.dispatcher_status === "blocked") {
    return { ready: false, reasons: ["Машина заблокирована"] };
  }
  if (v.is_active === false) reasons.push("Машина не активна");
  if (v.load_status === "unavailable" || v.load_status === "repair" || v.load_status === "resting") {
    reasons.push("Машина не готова");
  }
  const driver = v.driver_id || v.dispatcher_driver_ext_id;
  if (!driver) reasons.push("Не назначен водитель");
  const hasCity = !!(v.current_city || v.home_city);
  const hasCoords = v.current_lat != null && v.current_lng != null;
  if (!hasCity && !hasCoords) reasons.push("Не указан текущий город");
  const kg = v.payload_kg ?? v.capacity_kg;
  if (!kg) reasons.push("Не хватает данных по машине: грузоподъёмность");
  if (!v.body_type) reasons.push("Не хватает данных по машине: тип кузова");
  if (v.dispatcher_status && ARCHIVED.has(v.dispatcher_status)) {
    reasons.push("Машина не активна");
  }
  return { ready: reasons.length === 0, reasons };
}
