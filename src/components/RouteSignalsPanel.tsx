// Панель логиста: кому отправлен сигнал по рейсу,
// кто принял, кто отказался, кто не ответил, и причины пропусков.
// Только просмотр (read-only) — без правок данных.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Truck,
  User,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  Building2,
  Ruler,
  Weight,
  Box,
} from "lucide-react";
import {
  BroadcastSignalButton,
  type SignalRequirements,
} from "@/components/BroadcastSignalButton";

type Props = {
  routeId: string;
  /** Требования для подбора подходящих авто. Если не переданы — кнопка скрыта. */
  requirements?: SignalRequirements;
};

type OfferRow = {
  id: string;
  route_id: string | null;
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

type CarrierLite = {
  id: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  contact_person: string | null;
};
type VehicleLite = {
  id: string;
  plate_number: string | null;
  brand: string | null;
  model: string | null;
  body_type: string | null;
  capacity_kg: number | null;
  volume_m3: number | null;
  body_length_m: number | null;
  body_width_m: number | null;
  body_height_m: number | null;
  has_tent: boolean | null;
  has_manipulator: boolean | null;
  has_straps: boolean | null;
  comment: string | null;
};
type DriverLite = {
  id: string;
  full_name: string | null;
  phone: string | null;
  license_number: string | null;
  license_categories: string | null;
};

type HistoryRow = {
  id: string;
  action: string;
  reason: string | null;
  comment: string | null;
  carrier_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  created_at: string;
};

type EffectiveStatus =
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "no_response";

const STATUS_LABELS: Record<EffectiveStatus, string> = {
  sent: "Отправлено",
  viewed: "Просмотрено",
  accepted: "Принято",
  declined: "Отказался",
  expired: "Истекло",
  no_response: "Не ответил",
};

const STATUS_STYLES: Record<EffectiveStatus, string> = {
  sent: "bg-blue-100 text-blue-900 border-blue-200",
  viewed: "bg-amber-100 text-amber-900 border-amber-200",
  accepted: "bg-green-100 text-green-900 border-green-200",
  declined: "bg-red-100 text-red-900 border-red-200",
  expired: "bg-muted text-muted-foreground border-border",
  no_response: "bg-orange-100 text-orange-900 border-orange-200",
};

function StatusIcon({ status }: { status: EffectiveStatus }) {
  switch (status) {
    case "accepted":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "declined":
      return <XCircle className="h-3.5 w-3.5" />;
    case "no_response":
    case "expired":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "viewed":
      return <Clock className="h-3.5 w-3.5" />;
    case "sent":
    default:
      return <Send className="h-3.5 w-3.5" />;
  }
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** offer.status + истечение по времени → итоговый статус для отображения */
function effectiveStatus(o: OfferRow): EffectiveStatus {
  if (o.status === "accepted" || o.status === "declined") return o.status;
  // sent/viewed без ответа после expires_at — считаем "не ответил"
  if (o.expires_at) {
    const exp = new Date(o.expires_at).getTime();
    if (Number.isFinite(exp) && exp < Date.now()) {
      if (o.status === "expired") return "expired";
      return "no_response";
    }
  }
  if (o.status === "expired") return "expired";
  return o.status; // sent | viewed
}

const SKIP_ACTIONS = new Set([
  "rejected_by_logist",
  "released",
  "declined_by_carrier",
]);

export function RouteSignalsPanel({ routeId, requirements }: Props) {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: offers, isLoading: loadingOffers } = useQuery({
    queryKey: ["route-signals", "offers", routeId],
    queryFn: async (): Promise<OfferRow[]> => {
      const { data, error } = await db
        .from("route_offers")
        .select(
          "id, route_id, carrier_id, vehicle_id, driver_id, status, sent_at, viewed_at, responded_at, expires_at, decline_reason, comment",
        )
        .eq("route_id", routeId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OfferRow[];
    },
    refetchInterval: 15_000,
  });

  const { data: history } = useQuery({
    queryKey: ["route-signals", "history", routeId],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await db
        .from("route_carrier_history")
        .select("id, action, reason, comment, carrier_id, vehicle_id, driver_id, created_at")
        .eq("route_id", routeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
    refetchInterval: 30_000,
  });

  const carrierIds = useMemo(
    () => Array.from(new Set((offers ?? []).map((o) => o.carrier_id).filter(Boolean))),
    [offers],
  );
  const vehicleIds = useMemo(
    () =>
      Array.from(
        new Set((offers ?? []).map((o) => o.vehicle_id).filter((x): x is string => !!x)),
      ),
    [offers],
  );
  const driverIds = useMemo(
    () =>
      Array.from(
        new Set((offers ?? []).map((o) => o.driver_id).filter((x): x is string => !!x)),
      ),
    [offers],
  );

  const { data: carriers } = useQuery({
    queryKey: ["route-signals", "carriers", carrierIds.join(",")],
    enabled: carrierIds.length > 0,
    queryFn: async (): Promise<CarrierLite[]> => {
      const { data, error } = await db
        .from("carriers")
        .select("id, company_name, phone, email, city, contact_person")
        .in("id", carrierIds);
      if (error) throw error;
      return (data ?? []) as CarrierLite[];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["route-signals", "vehicles", vehicleIds.join(",")],
    enabled: vehicleIds.length > 0,
    queryFn: async (): Promise<VehicleLite[]> => {
      const { data, error } = await db
        .from("vehicles")
        .select("id, plate_number, brand, model, body_type, capacity_kg, volume_m3, body_length_m, body_width_m, body_height_m, has_tent, has_manipulator, has_straps, comment")
        .in("id", vehicleIds);
      if (error) throw error;
      return (data ?? []) as VehicleLite[];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["route-signals", "drivers", driverIds.join(",")],
    enabled: driverIds.length > 0,
    queryFn: async (): Promise<DriverLite[]> => {
      const { data, error } = await db
        .from("drivers")
        .select("id, full_name, phone, license_number, license_categories")
        .in("id", driverIds);
      if (error) throw error;
      return (data ?? []) as DriverLite[];
    },
  });

  const carrierById = useMemo(() => {
    const m = new Map<string, CarrierLite>();
    for (const c of carriers ?? []) m.set(c.id, c);
    return m;
  }, [carriers]);
  const vehicleById = useMemo(() => {
    const m = new Map<string, VehicleLite>();
    for (const v of vehicles ?? []) m.set(v.id, v);
    return m;
  }, [vehicles]);
  const driverById = useMemo(() => {
    const m = new Map<string, DriverLite>();
    for (const d of drivers ?? []) m.set(d.id, d);
    return m;
  }, [drivers]);

  const skips = useMemo(
    () => (history ?? []).filter((h) => SKIP_ACTIONS.has(h.action)),
    [history],
  );

  const counts = useMemo(() => {
    const acc: Record<EffectiveStatus, number> = {
      sent: 0,
      viewed: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      no_response: 0,
    };
    for (const o of offers ?? []) acc[effectiveStatus(o)]++;
    return acc;
  }, [offers]);

  const handleRefresh = () => {
    void qc.invalidateQueries({ queryKey: ["route-signals"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Сигналы по рейсу
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {requirements && (
            <BroadcastSignalButton
              routeId={routeId}
              requirements={requirements}
              expiresInHours={1}
            />
          )}
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Сводка */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {(Object.keys(STATUS_LABELS) as EffectiveStatus[]).map((s) => (
            <Badge key={s} variant="outline" className={`${STATUS_STYLES[s]} gap-1`}>
              <StatusIcon status={s} />
              {STATUS_LABELS[s]}: {counts[s]}
            </Badge>
          ))}
        </div>

        {/* Список сигналов */}
        {loadingOffers ? (
          <div className="text-sm text-muted-foreground">Загрузка…</div>
        ) : (offers ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Сигналы по этому рейсу ещё не отправлялись.
          </div>
        ) : (
          <div className="space-y-2">
            {(offers ?? []).map((o) => {
              const st = effectiveStatus(o);
              const c = carrierById.get(o.carrier_id);
              const v = o.vehicle_id ? vehicleById.get(o.vehicle_id) : null;
              const d = o.driver_id ? driverById.get(o.driver_id) : null;
              const carrierName = c?.company_name ?? "Перевозчик";
              const plate = v?.plate_number ?? null;
              const vehicleLabel = v
                ? [plate, [v.brand, v.model].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" · ")
                : null;
              return (
                <div
                  key={o.id}
                  className="rounded-md border border-border bg-card p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`${STATUS_STYLES[st]} gap-1`}>
                          <StatusIcon status={st} />
                          {STATUS_LABELS[st]}
                        </Badge>
                        <span className="font-medium">{carrierName}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {vehicleLabel && (
                          <span className="inline-flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            {vehicleLabel}
                          </span>
                        )}
                        {d?.full_name && (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {d.full_name}
                            {d.phone ? ` · ${d.phone}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>отправлено: {fmt(o.sent_at)}</div>
                      {o.viewed_at && <div>просмотр: {fmt(o.viewed_at)}</div>}
                      {o.responded_at && <div>ответ: {fmt(o.responded_at)}</div>}
                      {o.expires_at && <div>срок: {fmt(o.expires_at)}</div>}
                    </div>
                  </div>
                  {st === "declined" && o.decline_reason && (
                    <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-900 dark:bg-red-950 dark:text-red-200">
                      Причина отказа: {o.decline_reason}
                    </div>
                  )}
                  {st === "no_response" && (
                    <div className="mt-2 rounded bg-orange-50 px-2 py-1 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-200">
                      Водитель не ответил до истечения срока — сигнал можно отправить
                      следующему подходящему авто.
                    </div>
                  )}
                  {o.comment && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Комментарий: {o.comment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Причины пропусков (история) */}
        {skips.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Пропущенные авто
            </div>
            <div className="space-y-1.5">
              {skips.map((h) => {
                const c = h.carrier_id ? carrierById.get(h.carrier_id) : null;
                const v = h.vehicle_id ? vehicleById.get(h.vehicle_id) : null;
                const label =
                  h.action === "rejected_by_logist"
                    ? "Отклонено логистом"
                    : h.action === "released"
                      ? "Освобождено"
                      : h.action === "declined_by_carrier"
                        ? "Отказ перевозчика"
                        : h.action;
                return (
                  <div
                    key={h.id}
                    className="rounded border border-border bg-muted/30 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {c?.company_name ?? "Перевозчик"}
                        {v?.plate_number ? ` · ${v.plate_number}` : ""}
                      </span>
                      <span className="text-muted-foreground">{fmt(h.created_at)}</span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      {label}
                      {h.reason ? `: ${h.reason}` : h.comment ? `: ${h.comment}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
