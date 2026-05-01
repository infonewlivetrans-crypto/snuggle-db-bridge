import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  User,
  MessageSquare,
  History as HistoryIcon,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth/auth-context";
import {
  confirmCarrierForRoute,
  rejectCarrierForRoute,
} from "@/lib/server-functions/route-offers.functions";

type Props = { routeId: string };

type RouteRow = {
  id: string;
  route_number: string | null;
  carrier_assignment_status: "none" | "pending" | "assigned" | "rejected";
  carrier_id: string | null;
  pending_offer_id: string | null;
  carrier_assigned_at: string | null;
  carrier?: { company_name: string | null } | null;
};

type OfferRow = {
  id: string;
  carrier_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  responded_at: string | null;
  comment: string | null;
  carriers?: { company_name: string | null } | null;
  vehicles?: { plate_number: string | null; brand: string | null; model: string | null } | null;
  drivers?: { full_name: string | null; phone: string | null } | null;
};

type HistoryRow = {
  id: string;
  action:
    | "offer_sent"
    | "accepted_by_carrier"
    | "declined_by_carrier"
    | "confirmed_by_logist"
    | "rejected_by_logist"
    | "released";
  carrier_id: string | null;
  comment: string | null;
  reason: string | null;
  actor_user_id: string | null;
  created_at: string;
  carriers?: { company_name: string | null } | null;
  actor?: { full_name: string | null; email: string | null } | null;
};

const ACTION_LABEL: Record<HistoryRow["action"], string> = {
  offer_sent: "Предложение отправлено",
  accepted_by_carrier: "Перевозчик принял",
  declined_by_carrier: "Перевозчик отклонил",
  confirmed_by_logist: "Логист подтвердил",
  rejected_by_logist: "Логист отклонил",
  released: "Назначение снято",
};

const ACTION_STYLE: Record<HistoryRow["action"], string> = {
  offer_sent: "bg-blue-100 text-blue-900 border-blue-200",
  accepted_by_carrier: "bg-emerald-100 text-emerald-900 border-emerald-200",
  declined_by_carrier: "bg-red-100 text-red-900 border-red-200",
  confirmed_by_logist: "bg-emerald-100 text-emerald-900 border-emerald-200",
  rejected_by_logist: "bg-red-100 text-red-900 border-red-200",
  released: "bg-muted text-muted-foreground border-border",
};

const ASSIGNMENT_STATUS_LABELS: Record<RouteRow["carrier_assignment_status"], string> = {
  none: "Перевозчик не назначен",
  pending: "Ожидает подтверждения логиста",
  assigned: "Перевозчик назначен",
  rejected: "Назначение отклонено",
};

const ASSIGNMENT_STATUS_STYLES: Record<RouteRow["carrier_assignment_status"], string> = {
  none: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-100 text-amber-900 border-amber-200",
  assigned: "bg-emerald-100 text-emerald-900 border-emerald-200",
  rejected: "bg-red-100 text-red-900 border-red-200",
};

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export function CarrierConfirmationBlock({ routeId }: Props) {
  const { roles } = useAuth();
  const isLogist = roles.includes("admin") || roles.includes("logist");

  const qc = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<"confirm" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const confirmFn = useServerFn(confirmCarrierForRoute);
  const rejectFn = useServerFn(rejectCarrierForRoute);

  const routeQ = useQuery({
    queryKey: ["carrier-confirmation", "route", routeId],
    queryFn: async (): Promise<RouteRow | null> => {
      const { data, error } = await db
        .from("routes")
        .select(
          "id, route_number, carrier_assignment_status, carrier_id, pending_offer_id, carrier_assigned_at, carrier:carrier_id(company_name)",
        )
        .eq("id", routeId)
        .maybeSingle();
      if (error) throw error;
      return data as RouteRow | null;
    },
  });

  const route = routeQ.data;
  const pendingOfferId = route?.pending_offer_id ?? null;

  const offerQ = useQuery({
    queryKey: ["carrier-confirmation", "pending-offer", pendingOfferId],
    enabled: !!pendingOfferId,
    queryFn: async (): Promise<OfferRow | null> => {
      const { data, error } = await db
        .from("route_offers")
        .select(
          "id, carrier_id, vehicle_id, driver_id, responded_at, comment, carriers:carrier_id(company_name), vehicles:vehicle_id(plate_number, brand, model), drivers:driver_id(full_name, phone)",
        )
        .eq("id", pendingOfferId!)
        .maybeSingle();
      if (error) throw error;
      return data as OfferRow | null;
    },
  });

  const historyQ = useQuery({
    queryKey: ["carrier-confirmation", "history", routeId],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await db
        .from("route_carrier_history")
        .select(
          "id, action, carrier_id, comment, reason, actor_user_id, created_at, carriers:carrier_id(company_name)",
        )
        .eq("route_id", routeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () =>
      confirmFn({ data: { routeId, comment: comment.trim() || null } }),
    onSuccess: () => {
      toast.success("Перевозчик подтверждён и назначен на рейс");
      setConfirmDialog(null);
      setComment("");
      qc.invalidateQueries({ queryKey: ["carrier-confirmation"] });
      // обновим карточку рейса в родителе
      qc.invalidateQueries({ queryKey: ["route"] });
      qc.invalidateQueries({ queryKey: ["routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async () =>
      rejectFn({ data: { routeId, comment: comment.trim() || null } }),
    onSuccess: () => {
      toast.success("Перевозчик отклонён. Рейс снова доступен для предложений.");
      setConfirmDialog(null);
      setComment("");
      qc.invalidateQueries({ queryKey: ["carrier-confirmation"] });
      qc.invalidateQueries({ queryKey: ["route"] });
      qc.invalidateQueries({ queryKey: ["routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!route) return null;

  const status = route.carrier_assignment_status;
  const offer = offerQ.data;
  const history = historyQ.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Подтверждение перевозчика
        </CardTitle>
        <Badge variant="outline" className={ASSIGNMENT_STATUS_STYLES[status]}>
          {ASSIGNMENT_STATUS_LABELS[status]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Карточка ожидающего подтверждения */}
        {status === "pending" && offer && (
          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <Clock className="h-4 w-4" />
              Ожидает подтверждения логиста
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                icon={<Truck className="h-3.5 w-3.5" />}
                label="Перевозчик"
                value={offer.carriers?.company_name ?? "—"}
              />
              <Field
                icon={<User className="h-3.5 w-3.5" />}
                label="Водитель"
                value={
                  offer.drivers
                    ? `${offer.drivers.full_name ?? "—"}${offer.drivers.phone ? ` · ${offer.drivers.phone}` : ""}`
                    : "—"
                }
              />
              <Field
                icon={<Truck className="h-3.5 w-3.5" />}
                label="Машина"
                value={
                  offer.vehicles
                    ? `${offer.vehicles.plate_number ?? "—"} · ${offer.vehicles.brand ?? ""} ${offer.vehicles.model ?? ""}`.trim()
                    : "—"
                }
              />
              <Field
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Время принятия"
                value={fmtDateTime(offer.responded_at)}
              />
              {offer.comment && (
                <div className="sm:col-span-2">
                  <div className="mb-0.5 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    Комментарий перевозчика
                  </div>
                  <div className="text-sm">{offer.comment}</div>
                </div>
              )}
            </div>
            {isLogist && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setComment("");
                    setConfirmDialog("confirm");
                  }}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Подтвердить перевозчика
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setComment("");
                    setConfirmDialog("reject");
                  }}
                >
                  <XCircle className="mr-1.5 h-4 w-4" />
                  Отклонить перевозчика
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Закреплённый перевозчик */}
        {status === "assigned" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              Перевозчик назначен
            </div>
            <div>
              {route.carrier?.company_name ?? "—"} · подтверждён{" "}
              {fmtDateTime(route.carrier_assigned_at)}
            </div>
          </div>
        )}

        {status === "none" && (
          <p className="text-sm text-muted-foreground">
            Перевозчик ещё не выбран. Отправьте предложения через блок «Подбор перевозчиков».
          </p>
        )}

        {status === "rejected" && (
          <p className="text-sm text-muted-foreground">
            Предыдущий перевозчик отклонён. Можно отправить предложения другим.
          </p>
        )}

        {/* История */}
        {history.length > 0 && (
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <HistoryIcon className="h-3 w-3" />
              История назначения
            </div>
            <div className="space-y-1.5">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-secondary/30 p-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={ACTION_STYLE[h.action]}>{ACTION_LABEL[h.action]}</Badge>
                    {h.carriers?.company_name && (
                      <span className="font-medium">{h.carriers.company_name}</span>
                    )}
                    {(h.comment || h.reason) && (
                      <span className="text-muted-foreground">
                        · {h.reason ?? h.comment}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">{fmtDateTime(h.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Диалог подтверждения / отклонения */}
      <Dialog open={confirmDialog !== null} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog === "confirm" ? "Подтвердить перевозчика" : "Отклонить перевозчика"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog === "confirm"
                ? "Перевозчик будет закреплён за рейсом, водитель получит доступ к маршруту."
                : "Принятое предложение будет отменено, рейс снова станет доступен для других перевозчиков."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cc-comment">
              {confirmDialog === "confirm" ? "Комментарий (необязательно)" : "Причина / комментарий"}
            </Label>
            <Textarea
              id="cc-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={
                confirmDialog === "confirm"
                  ? "Например: подтверждено по телефону"
                  : "Например: нашли другого перевозчика"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Отмена
            </Button>
            {confirmDialog === "confirm" ? (
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
              >
                Подтвердить
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
              >
                Отклонить
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-0.5 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium leading-tight">{value}</div>
    </div>
  );
}
