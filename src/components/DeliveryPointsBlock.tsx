import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  MapPin,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Clock,
  CalendarDays,
  Phone,
  AlertTriangle,
} from "lucide-react";
import { POINT_STATUS_LABELS, POINT_STATUS_STYLES, type PointStatus } from "@/lib/routes";
import { formatRuPhone } from "@/lib/phone";
import { detectCargoFeatures } from "@/lib/cargo-features";

type Point = {
  id: string;
  point_number: number;
  status: PointStatus;
  planned_time: string | null;
  client_window_from: string | null;
  client_window_to: string | null;
  order: {
    id: string;
    order_number: string;
    delivery_address: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    latitude: number | null;
    longitude: number | null;
    map_link: string | null;
    client_works_weekends: boolean;
    comment: string | null;
    driver_comment: string | null;
    driver_comment_is_important: boolean | null;
  } | null;
};

function formatTime(t: string | null) {
  if (!t) return null;
  return t.slice(0, 5);
}

function mapHref(p: Point["order"]) {
  if (!p) return null;
  if (p.map_link) return p.map_link;
  if (p.latitude != null && p.longitude != null) {
    return `https://yandex.ru/maps/?pt=${p.longitude},${p.latitude}&z=16&l=map`;
  }
  if (p.delivery_address) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(p.delivery_address)}`;
  }
  return null;
}

// "HH:MM" → минуты в сутках
function tToMin(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

type Risk = { level: "none" | "risk"; reasons: string[] };

function computeRisk(p: Point, routeIsWeekend: boolean): Risk {
  const reasons: string[] = [];
  const o = p.order;

  if (routeIsWeekend && o && !o.client_works_weekends) {
    reasons.push("Получатель не работает в выходные");
  }

  const at = tToMin(p.planned_time);
  const from = tToMin(p.client_window_from);
  const to = tToMin(p.client_window_to);
  if (at != null && from != null && at < from) {
    reasons.push(`Прибытие в ${formatTime(p.planned_time)} раньше начала приёма (${formatTime(p.client_window_from)})`);
  }
  if (at != null && to != null && at > to) {
    reasons.push(`Прибытие в ${formatTime(p.planned_time)} после окончания приёма (${formatTime(p.client_window_to)})`);
  }

  return { level: reasons.length ? "risk" : "none", reasons };
}

export function DeliveryPointsBlock({ requestId }: { requestId: string }) {
  const qc = useQueryClient();

  const routeQ = useQuery({
    queryKey: ["request-route-date", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, route_date")
        .eq("id", requestId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; route_date: string | null } | null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["request-delivery-points", requestId],
    queryFn: async (): Promise<Point[]> => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "id, point_number, status, planned_time, client_window_from, client_window_to, order:order_id(id, order_number, delivery_address, contact_name, contact_phone, latitude, longitude, map_link, client_works_weekends, comment, driver_comment, driver_comment_is_important)",
        )
        .eq("route_id", requestId)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Point[];
    },
  });

  const routeIsWeekend = useMemo(() => {
    const d = routeQ.data?.route_date;
    if (!d) return false;
    // route_date YYYY-MM-DD: считаем 6 (сб) и 0 (вс) выходными
    const dt = new Date(`${d}T00:00:00`);
    const day = dt.getDay();
    return day === 0 || day === 6;
  }, [routeQ.data?.route_date]);

  const risks = useMemo(() => {
    const out = new Map<string, Risk>();
    for (const p of data ?? []) out.set(p.id, computeRisk(p, routeIsWeekend));
    return out;
  }, [data, routeIsWeekend]);

  const riskyPoints = useMemo(
    () => (data ?? []).filter((p) => risks.get(p.id)?.level === "risk"),
    [data, risks],
  );

  const reorder = useMutation({
    mutationFn: async (newOrder: Point[]) => {
      const tempBase = 100000;
      for (let i = 0; i < newOrder.length; i++) {
        const { error } = await supabase
          .from("route_points")
          .update({ point_number: tempBase + i })
          .eq("id", newOrder[i].id);
        if (error) throw error;
      }
      for (let i = 0; i < newOrder.length; i++) {
        const { error } = await supabase
          .from("route_points")
          .update({ point_number: i + 1 })
          .eq("id", newOrder[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Порядок точек обновлён");
      qc.invalidateQueries({ queryKey: ["request-delivery-points", requestId] });
      qc.invalidateQueries({ queryKey: ["request-orders", requestId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Не удалось сохранить порядок"),
  });

  const move = (idx: number, dir: -1 | 1) => {
    if (!data) return;
    const next = [...data];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorder.mutate(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Точки доставки
        </div>
        <span className="text-xs text-muted-foreground">
          Всего: {data?.length ?? 0}
          {riskyPoints.length > 0 && (
            <span className="ml-2 text-destructive">
              · рискованных: {riskyPoints.length}
            </span>
          )}
        </span>
      </div>

      {riskyPoints.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            Получатель не работает в указанное время / выходные. Требуется корректировка маршрута.
          </AlertTitle>
          <AlertDescription>
            <div className="mt-1 text-sm">
              Подтверждение маршрута возможно, но рискованные точки выделены ниже:
            </div>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {riskyPoints.map((p) => {
                const r = risks.get(p.id);
                return (
                  <li key={p.id}>
                    <span className="font-mono">№{p.point_number}</span>
                    {p.order?.contact_name ? ` · ${p.order.contact_name}` : ""}
                    {r ? ` — ${r.reasons.join("; ")}` : ""}
                  </li>
                );
              })}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Добавьте заказы в заявку — точки доставки появятся здесь автоматически
        </div>
      ) : (
        <ol className="space-y-2">
          {data.map((p, idx) => {
            const o = p.order;
            const href = mapHref(o);
            const wf = formatTime(p.client_window_from);
            const wt = formatTime(p.client_window_to);
            const r = risks.get(p.id);
            const risky = r?.level === "risk";
            return (
              <li
                key={p.id}
                className={
                  "flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-start " +
                  (risky ? "border-destructive/60 bg-destructive/5" : "border-border")
                }
              >
                <div
                  className={
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
                    (risky
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/10 text-primary")
                  }
                >
                  {p.point_number}
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {o?.order_number ?? "—"}
                    </span>
                    {o?.contact_name && (
                      <span className="text-sm text-foreground">{o.contact_name}</span>
                    )}
                    <Badge
                      variant="outline"
                      className={POINT_STATUS_STYLES[p.status] ?? ""}
                    >
                      {POINT_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                    {risky && (
                      <Badge
                        variant="destructive"
                        className="inline-flex items-center gap-1"
                        title={r?.reasons.join("; ")}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Рискованная точка
                      </Badge>
                    )}
                    {o?.client_works_weekends && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 text-xs text-foreground">
                        <CalendarDays className="h-3 w-3" />
                        Работает в выходные
                      </span>
                    )}
                    {o?.driver_comment_is_important && o?.driver_comment && (
                      <Badge
                        variant="destructive"
                        className="inline-flex items-center gap-1"
                        title={o.driver_comment}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Важно для водителя
                      </Badge>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {o?.delivery_address || (
                      <span className="italic">Адрес не указан</span>
                    )}
                  </div>

                  {o?.driver_comment_is_important && o?.driver_comment && (
                    <div className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-2 text-xs font-medium text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="whitespace-pre-line">Важно: {o.driver_comment}</div>
                    </div>
                  )}
                  {risky && r && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-destructive">
                      {r.reasons.join(" · ")}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {wf || wt ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Окно: {wf ?? "…"}–{wt ?? "…"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Окно не задано
                      </span>
                    )}
                    {p.planned_time && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        План: {formatTime(p.planned_time)}
                      </span>
                    )}
                    {o?.contact_phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {formatRuPhone(o.contact_phone)}
                      </span>
                    )}
                    {o?.latitude != null && o?.longitude != null && (
                      <span className="font-mono">
                        {Number(o.latitude).toFixed(5)}, {Number(o.longitude).toFixed(5)}
                      </span>
                    )}
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Открыть на карте
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1 sm:flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === 0 || reorder.isPending}
                    onClick={() => move(idx, -1)}
                    title="Переместить вверх"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === data.length - 1 || reorder.isPending}
                    onClick={() => move(idx, 1)}
                    title="Переместить вниз"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
