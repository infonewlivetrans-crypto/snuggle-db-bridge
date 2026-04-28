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
