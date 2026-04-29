// Утилиты для отображения ETA по точкам маршрута.

export type EtaRiskLevel = "on_time" | "tight" | "late" | "unknown";

export type EtaReason = { code: string; text: string };

export const ETA_RISK_LABELS: Record<EtaRiskLevel, string> = {
  on_time: "В срок",
  tight: "Впритык",
  late: "Опоздание",
  unknown: "Не рассчитано",
};

export const ETA_RISK_STYLES: Record<EtaRiskLevel, string> = {
  on_time: "border-green-300 bg-green-100 text-green-900",
  tight: "border-amber-300 bg-amber-100 text-amber-900",
  late: "border-red-300 bg-red-100 text-red-900",
  unknown: "border-border bg-secondary text-muted-foreground",
};

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatEtaWindow(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!from || !to) return "—";
  return `${formatTime(from)} – ${formatTime(to)}`;
}

export function parseReasons(value: unknown): EtaReason[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is { code?: unknown; text?: unknown } => !!r && typeof r === "object")
    .map((r) => ({
      code: typeof r.code === "string" ? r.code : "info",
      text: typeof r.text === "string" ? r.text : "",
    }))
    .filter((r) => r.text.length > 0);
}

// ---------- Базовый расчёт ETA по GPS ----------

export type EtaInputPoint = {
  point_number: number;
  status: string; // dp_status
  latitude: number | null;
  longitude: number | null;
  client_window_from: string | null; // "HH:MM" или "HH:MM:SS"
  client_window_to: string | null;
  planned_arrival_at: string | null; // ISO
};

export type EtaComputed = {
  point_number: number;
  eta_at: string | null;
  planned_at: string | null;
  window_from_iso: string | null;
  window_to_iso: string | null;
  risk: EtaRiskLevel;
  delay_minutes: number; // > 0 — опаздывает к окну
  distance_km_from_prev: number;
};

const FINAL_STATUSES = new Set(["delivered", "not_delivered", "returned_to_warehouse"]);

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseHm(value: string | null, baseDate: Date): Date | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(baseDate);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export function classifyRisk(
  etaAt: Date,
  windowTo: Date | null,
  tightMinutes = 15,
): { risk: EtaRiskLevel; delayMinutes: number } {
  if (!windowTo) return { risk: "on_time", delayMinutes: 0 };
  const diffMin = (etaAt.getTime() - windowTo.getTime()) / 60_000;
  if (diffMin > 0) return { risk: "late", delayMinutes: Math.round(diffMin) };
  if (-diffMin <= tightMinutes) return { risk: "tight", delayMinutes: 0 };
  return { risk: "on_time", delayMinutes: 0 };
}

/**
 * Базовый расчёт ETA по точкам маршрута:
 *  - старт = текущая позиция водителя (если есть) или планируемое отправление,
 *  - время в пути = расстояние по прямой / средняя скорость,
 *  - время разгрузки фиксированное на каждой ожидаемой точке.
 */
export function computeRouteEta(params: {
  now?: Date;
  driver: { lat: number; lng: number; at: string | null } | null;
  points: EtaInputPoint[];
  avgSpeedKmh: number;
  serviceMinutes: number;
  plannedDepartureAt: string | null;
  tightMinutes?: number;
}): EtaComputed[] {
  const now = params.now ?? new Date();
  const speed = params.avgSpeedKmh > 0 ? params.avgSpeedKmh : 35;
  const service = Math.max(0, params.serviceMinutes ?? 0);
  const tight = params.tightMinutes ?? 15;

  const upcoming = params.points.filter(
    (p) =>
      !FINAL_STATUSES.has(p.status) &&
      typeof p.latitude === "number" &&
      typeof p.longitude === "number",
  );

  // Стартовая точка и время старта
  let cursor: { lat: number; lng: number } | null = null;
  let cursorTime: Date;
  if (params.driver) {
    cursor = { lat: params.driver.lat, lng: params.driver.lng };
    const driverAt = params.driver.at ? new Date(params.driver.at) : now;
    // если позиция свежая (< 10 мин), считаем от now, иначе от momenta фиксации
    cursorTime = (now.getTime() - driverAt.getTime()) < 10 * 60_000 ? now : driverAt;
  } else {
    cursorTime = params.plannedDepartureAt ? new Date(params.plannedDepartureAt) : now;
  }

  const result: EtaComputed[] = [];
  for (const p of upcoming) {
    const next = { lat: p.latitude as number, lng: p.longitude as number };
    const distKm = cursor ? haversineKm(cursor, next) : 0;
    const travelMin = (distKm / speed) * 60;
    const arrival = new Date(cursorTime.getTime() + travelMin * 60_000);

    const baseDate = arrival;
    const winFrom = parseHm(p.client_window_from, baseDate);
    const winTo = parseHm(p.client_window_to, baseDate);

    let risk: EtaRiskLevel = "on_time";
    let delay = 0;
    if (winTo) {
      const diff = (arrival.getTime() - winTo.getTime()) / 60_000;
      if (diff > 0) {
        risk = "late";
        delay = Math.round(diff);
      } else if (-diff <= tight) {
        risk = "tight";
      }
    }

    result.push({
      point_number: p.point_number,
      eta_at: arrival.toISOString(),
      planned_at: p.planned_arrival_at,
      window_from_iso: winFrom ? winFrom.toISOString() : null,
      window_to_iso: winTo ? winTo.toISOString() : null,
      risk,
      delay_minutes: delay,
      distance_km_from_prev: Number(distKm.toFixed(2)),
    });

    // обновляем курсор: после разгрузки уезжаем дальше
    cursor = next;
    cursorTime = new Date(arrival.getTime() + service * 60_000);
  }

  return result;
}

export function summarizeRouteEta(
  points: Array<{
    eta_at: string | null;
    eta_risk: EtaRiskLevel | string;
  }>,
): { lateCount: number; tightCount: number; lastEta: string | null; risk: EtaRiskLevel } {
  let lateCount = 0;
  let tightCount = 0;
  let lastEta: string | null = null;
  for (const p of points) {
    if (p.eta_risk === "late") lateCount++;
    else if (p.eta_risk === "tight") tightCount++;
    if (p.eta_at && (!lastEta || p.eta_at > lastEta)) lastEta = p.eta_at;
  }
  const risk: EtaRiskLevel =
    lateCount > 0 ? "late" : tightCount > 0 ? "tight" : points.length > 0 ? "on_time" : "unknown";
  return { lateCount, tightCount, lastEta, risk };
}
