import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Truck,
  MapPin,
  Calendar,
  Package,
  Weight,
  Boxes,
  Coins,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth/auth-context";
import { respondToOffer } from "@/lib/server-functions/route-offers.functions";
import { BODY_TYPE_LABELS, type BodyType } from "@/lib/carriers";

export const Route = createFileRoute("/carrier-offers")({
  component: CarrierOffersPage,
  head: () => ({
    meta: [{ title: "Предложения рейсов — Радиус Трек" }],
  }),
});

type OfferStatus = "sent" | "viewed" | "accepted" | "declined" | "expired";

const STATUS_LABELS: Record<OfferStatus, string> = {
  sent: "Новое",
  viewed: "Просмотрено",
  accepted: "Принято",
  declined: "Отклонено",
  expired: "Истекло",
};

const STATUS_STYLES: Record<OfferStatus, string> = {
  sent: "bg-blue-100 text-blue-900 border-blue-200",
  viewed: "bg-amber-100 text-amber-900 border-amber-200",
  accepted: "bg-emerald-100 text-emerald-900 border-emerald-200",
  declined: "bg-red-100 text-red-900 border-red-200",
  expired: "bg-muted text-muted-foreground border-border",
};

type OfferRow = {
  id: string;
  route_id: string | null;
  carrier_id: string;
  vehicle_id: string | null;
  status: OfferStatus;
  sent_at: string;
  viewed_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
  decline_reason: string | null;
  comment: string | null;
};

type RouteRow = {
  id: string;
  route_number: string;
  route_date: string;
  planned_departure_at: string | null;
  departure_time: string | null;
  points_count: number;
  total_weight_kg: number;
  total_volume_m3: number;
  total_distance_km: number;
  carrier_cost: number;
  delivery_cost: number;
  carrier_reward: number | null;
  required_body_type: BodyType | null;
  required_capacity_kg: number | null;
  required_volume_m3: number | null;
  required_body_length_m: number | null;
  requires_tent: boolean;
  requires_manipulator: boolean;
  requires_straps: boolean;
  transport_comment: string | null;
  warehouse?: { name: string | null; address: string | null; city: string | null } | null;
  destination?: { name: string | null; city: string | null } | null;
};

type DeclineReason = "time" | "price" | "no_vehicle" | "direction" | "other";

const DECLINE_REASON_OPTIONS: Array<{ value: DeclineReason; label: string }> = [
  { value: "time", label: "Не подходит время" },
  { value: "price", label: "Не подходит цена" },
  { value: "no_vehicle", label: "Нет машины" },
  { value: "direction", label: "Не подходит направление" },
  { value: "other", label: "Другое" },
];

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return `${Number(n).toLocaleString("ru-RU")} ₽`;
}

function CarrierOffersPage() {
  const { user, profile, roles } = useAuth();
  const qc = useQueryClient();
  const [declineFor, setDeclineFor] = useState<OfferRow | null>(null);
  const [declineReason, setDeclineReason] = useState<DeclineReason>("time");
  const [declineComment, setDeclineComment] = useState("");
  const respondFn = useServerFn(respondToOffer);

  const isStaff = roles.includes("admin") || roles.includes("logist");
  const carrierId = profile?.carrier_id ?? null;

  // Загружаем предложения для текущего перевозчика (или все, если staff)
  const { data: offers, isLoading } = useQuery({
    queryKey: ["carrier-offers", "list", carrierId, isStaff],
    enabled: !!user && (isStaff || !!carrierId),
    queryFn: async (): Promise<OfferRow[]> => {
      let q = db.from("route_offers").select("*").order("sent_at", { ascending: false });
      if (!isStaff && carrierId) q = q.eq("carrier_id", carrierId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OfferRow[];
    },
  });

  const routeIds = useMemo(
    () => Array.from(new Set((offers ?? []).map((o) => o.route_id).filter((x): x is string => !!x))),
    [offers],
  );

  const { data: routesById } = useQuery({
    queryKey: ["carrier-offers", "routes", routeIds],
    enabled: routeIds.length > 0,
    queryFn: async (): Promise<Record<string, RouteRow>> => {
      const { data, error } = await db
        .from("routes")
        .select(
          "id, route_number, route_date, planned_departure_at, departure_time, points_count, total_weight_kg, total_volume_m3, total_distance_km, carrier_cost, delivery_cost, carrier_reward, required_body_type, required_capacity_kg, required_volume_m3, required_body_length_m, requires_tent, requires_manipulator, requires_straps, transport_comment, warehouse:warehouse_id(name, address, city), destination:destination_warehouse_id(name, city)",
        )
        .in("id", routeIds);
      if (error) throw error;
      const map: Record<string, RouteRow> = {};
      for (const r of (data ?? []) as unknown as RouteRow[]) map[r.id] = r;
      return map;
    },
  });

  const respondMutation = useMutation({
    mutationFn: async (args: {
      offerId: string;
      action: "accept" | "decline";
      declineReason?: DeclineReason;
      declineComment?: string;
    }) =>
      respondFn({
        data: {
          offerId: args.offerId,
          action: args.action,
          declineReason: args.declineReason ?? null,
          declineComment: args.declineComment ?? null,
        },
      }),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "accept" ? "Предложение принято" : "Предложение отклонено");
      setDeclineFor(null);
      setDeclineComment("");
      setDeclineReason("time");
      qc.invalidateQueries({ queryKey: ["carrier-offers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Доступ
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Войдите, чтобы увидеть предложения.</p>
      </div>
    );
  }

  if (!isStaff && !carrierId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Профиль перевозчика не привязан
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ваш аккаунт пока не связан с компанией-перевозчиком. Обратитесь к администратору, чтобы получить
            доступ к предложениям рейсов.
          </CardContent>
        </Card>
      </div>
    );
  }

  const list = offers ?? [];
  const newCount = list.filter((o) => o.status === "sent" || o.status === "viewed").length;

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Предложения рейсов</h1>
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "Все активные предложения по перевозчикам"
              : "Рейсы, предложенные вашей компании"}
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          Активных: {newCount}
        </Badge>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Загрузка…
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Пока нет предложений. Когда логист предложит вам рейс, он появится здесь.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((o) => {
            const r = o.route_id ? routesById?.[o.route_id] : null;
            const canRespond =
              !isStaff && (o.status === "sent" || o.status === "viewed");

            return (
              <Card key={o.id} className="overflow-hidden">
                <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      Рейс {r?.route_number ? `№${r.route_number}` : "(без номера)"}
                      <Badge className={STATUS_STYLES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                    </CardTitle>
                    <div className="text-xs text-muted-foreground">
                      Получено: {fmtDateTime(o.sent_at)}
                      {o.expires_at ? ` · действительно до: ${fmtDateTime(o.expires_at)}` : ""}
                    </div>
                  </div>
                  {canRespond && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          respondMutation.mutate({ offerId: o.id, action: "accept" })
                        }
                        disabled={respondMutation.isPending}
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Принять
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDeclineFor(o);
                          setDeclineReason("time");
                          setDeclineComment("");
                        }}
                        disabled={respondMutation.isPending}
                      >
                        <XCircle className="mr-1.5 h-4 w-4" />
                        Отклонить
                      </Button>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  {!r ? (
                    <p className="text-sm text-muted-foreground">
                      Данные рейса недоступны.
                    </p>
                  ) : (
                    <>
                      {/* Основная сводка */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Stat
                          icon={<MapPin className="h-3.5 w-3.5" />}
                          label="Склад погрузки"
                          value={r.warehouse?.name ?? "—"}
                          sub={r.warehouse?.city ?? null}
                        />
                        <Stat
                          icon={<Calendar className="h-3.5 w-3.5" />}
                          label="Дата и время"
                          value={
                            r.planned_departure_at
                              ? fmtDateTime(r.planned_departure_at)
                              : `${r.route_date}${r.departure_time ? ` ${r.departure_time.slice(0, 5)}` : ""}`
                          }
                        />
                        <Stat
                          icon={<MapPin className="h-3.5 w-3.5" />}
                          label="Направление"
                          value={
                            r.destination?.name ??
                            r.destination?.city ??
                            (r.warehouse?.city ? `Из ${r.warehouse.city}` : "—")
                          }
                        />
                        <Stat
                          icon={<Package className="h-3.5 w-3.5" />}
                          label="Точек"
                          value={String(r.points_count)}
                        />
                        <Stat
                          icon={<Weight className="h-3.5 w-3.5" />}
                          label="Общий вес"
                          value={`${Number(r.total_weight_kg).toLocaleString("ru-RU")} кг`}
                        />
                        <Stat
                          icon={<Boxes className="h-3.5 w-3.5" />}
                          label="Общий объём"
                          value={`${Number(r.total_volume_m3).toLocaleString("ru-RU")} м³`}
                        />
                        <Stat
                          icon={<Coins className="h-3.5 w-3.5" />}
                          label="Стоимость рейса"
                          value={fmtMoney(r.carrier_reward ?? r.carrier_cost ?? r.delivery_cost)}
                        />
                        <Stat
                          icon={<Clock className="h-3.5 w-3.5" />}
                          label="Расстояние"
                          value={
                            r.total_distance_km
                              ? `${Number(r.total_distance_km).toLocaleString("ru-RU")} км`
                              : "—"
                          }
                        />
                      </div>

                      {/* Требования к машине */}
                      <div className="rounded-md border border-border bg-secondary/30 p-3">
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Требования к машине
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {r.required_body_type && (
                            <span>Тип кузова: {BODY_TYPE_LABELS[r.required_body_type]}</span>
                          )}
                          {r.required_capacity_kg != null && (
                            <span>Грузоподъёмность от {r.required_capacity_kg} кг</span>
                          )}
                          {r.required_volume_m3 != null && (
                            <span>Объём от {r.required_volume_m3} м³</span>
                          )}
                          {r.required_body_length_m != null && (
                            <span>Длина от {r.required_body_length_m} м</span>
                          )}
                          {r.requires_tent && <span>Тент</span>}
                          {r.requires_manipulator && <span>Манипулятор</span>}
                          {r.requires_straps && <span>Ремни / крепления</span>}
                          {!r.required_body_type &&
                            r.required_capacity_kg == null &&
                            r.required_volume_m3 == null &&
                            !r.requires_tent &&
                            !r.requires_manipulator &&
                            !r.requires_straps && (
                              <span className="text-muted-foreground">Особых требований нет</span>
                            )}
                        </div>
                      </div>

                      {/* Адрес склада */}
                      {(r.warehouse?.address || r.warehouse?.city) && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Адрес склада: </span>
                          <span className="font-medium">
                            {[r.warehouse?.city, r.warehouse?.address].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}

                      {/* Условия оплаты — берём из комментария логиста, если есть */}
                      {r.transport_comment && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Условия от логиста: </span>
                          <span>{r.transport_comment}</span>
                        </div>
                      )}

                      {o.comment && (
                        <div className="rounded-md border border-border bg-card p-3 text-sm">
                          <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            Комментарий логиста
                          </div>
                          <div>{o.comment}</div>
                        </div>
                      )}

                      {o.status === "declined" && o.decline_reason && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
                          Отклонено. Причина: {o.decline_reason}
                        </div>
                      )}
                      {o.status === "accepted" && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                          Вы приняли предложение. Окончательное назначение делает логист.
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Диалог отклонения */}
      <Dialog open={!!declineFor} onOpenChange={(o) => !o && setDeclineFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить предложение</DialogTitle>
            <DialogDescription>Укажите причину — логист увидит её в уведомлении.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <RadioGroup
              value={declineReason}
              onValueChange={(v) => setDeclineReason(v as DeclineReason)}
              className="space-y-1.5"
            >
              {DECLINE_REASON_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`r-${o.value}`} />
                  <Label htmlFor={`r-${o.value}`} className="cursor-pointer text-sm">
                    {o.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <div className="space-y-1.5">
              <Label htmlFor="decline-comment" className="text-sm">
                Комментарий (необязательно)
              </Label>
              <Textarea
                id="decline-comment"
                value={declineComment}
                onChange={(e) => setDeclineComment(e.target.value)}
                placeholder="Поясните, если нужно"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineFor(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                declineFor &&
                respondMutation.mutate({
                  offerId: declineFor.id,
                  action: "decline",
                  declineReason,
                  declineComment: declineComment.trim() || undefined,
                })
              }
              disabled={respondMutation.isPending}
            >
              Отклонить рейс
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <div className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium leading-tight">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
