// Глобальный сторож входящих предложений (route_offers) для перевозчика/водителя.
// Слушает realtime INSERT по своему carrier_id, проигрывает звуковой сигнал
// «Новая подходящая заявка» и показывает модалку с кнопками
// «Принять», «Отказаться», «Подробнее». Не меняет существующие API.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Check, X, ExternalLink, Truck, Clock, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { apiPost } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type IncomingOffer = {
  id: string;
  route_id: string | null;
  transport_request_id: string | null;
  carrier_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  expires_at: string | null;
  comment: string | null;
  // обогащённые данные
  routeNumber?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  plannedAt?: string | null;
  vehicleLabel?: string | null;
};

const DECLINE_REASONS = [
  { value: "time", label: "Не подходит время" },
  { value: "price", label: "Не подходит цена" },
  { value: "no_vehicle", label: "Нет машины" },
  { value: "direction", label: "Не подходит направление" },
  { value: "other", label: "Другое" },
];

/** Проигрывает короткую звуковую «трель» через WebAudio (без файлов). */
function playSignalSound() {
  try {
    const Ctx =
      (window.AudioContext as typeof AudioContext | undefined) ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [880, 1175, 1568]; // A5, D6, G6 — «вызов»
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      const end = start + 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 1500);
  } catch {
    /* без звука */
  }
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function useCountdown(expiresAt: string | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "истекло";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м ${String(s).padStart(2, "0")}с`;
}

export function IncomingOfferWatcher() {
  const { profile } = useAuth();
  const carrierId = profile?.carrier_id ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [queue, setQueue] = useState<IncomingOffer[]>([]);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>("time");
  const [declineComment, setDeclineComment] = useState("");
  const seenIds = useRef<Set<string>>(new Set());

  const current = queue[0] ?? null;
  const countdown = useCountdown(current?.expires_at ?? null);

  // Обогащаем оффер данными по рейсу/машине
  const enrich = async (o: IncomingOffer): Promise<IncomingOffer> => {
    const enriched = { ...o };
    if (o.route_id) {
      const { data: r } = await db
        .from("routes")
        .select("route_number, planned_departure_at, route_date")
        .eq("id", o.route_id)
        .maybeSingle();
      if (r) {
        enriched.routeNumber = r.route_number ?? null;
        enriched.plannedAt = r.planned_departure_at ?? r.route_date ?? null;
      }
      // Маршрут From → To по точкам
      const { data: pts } = await db
        .from("route_points")
        .select("city, sequence, point_type")
        .eq("route_id", o.route_id)
        .order("sequence", { ascending: true });
      if (pts && pts.length > 0) {
        enriched.routeFrom = pts[0]?.city ?? null;
        enriched.routeTo = pts[pts.length - 1]?.city ?? null;
      }
    }
    if (o.vehicle_id) {
      const { data: v } = await db
        .from("vehicles")
        .select("plate_number, brand, model")
        .eq("id", o.vehicle_id)
        .maybeSingle();
      if (v) {
        enriched.vehicleLabel = [
          v.plate_number,
          [v.brand, v.model].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join(" · ");
      }
    }
    return enriched;
  };

  // Подписка realtime
  useEffect(() => {
    if (!carrierId) return;
    const channel = supabase
      .channel(`offer-watch-${carrierId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "route_offers",
          filter: `carrier_id=eq.${carrierId}`,
        },
        (payload) => {
          const row = payload.new as IncomingOffer;
          if (!row?.id || seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          // Воспроизводим звук и показываем тост
          playSignalSound();
          toast.info("Новая подходящая заявка", {
            description: row.comment ?? "Открыто окно с деталями.",
            duration: 6000,
          });
          // Обогащаем и кладём в очередь
          void enrich(row).then((full) => {
            setQueue((prev) =>
              prev.some((x) => x.id === full.id) ? prev : [...prev, full],
            );
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId]);

  // Закрыть текущее окно (без действия)
  const closeCurrent = () => {
    setQueue((prev) => prev.slice(1));
    setDeclineMode(false);
    setDeclineReason("time");
    setDeclineComment("");
  };

  const respondMutation = useMutation({
    mutationFn: async (args: {
      offerId: string;
      action: "accept" | "decline";
      reason?: string | null;
      comment?: string | null;
    }) =>
      apiPost(
        "/api/route-offers",
        {
          action: "respond",
          offerId: args.offerId,
          respondAction: args.action,
          declineReason: args.reason ?? null,
          declineComment: args.comment ?? null,
        },
        10000,
      ),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.action === "accept" ? "Заявка принята" : "Вы отказались от заявки",
      );
      qc.invalidateQueries({ queryKey: ["route-offers"] });
      qc.invalidateQueries({ queryKey: ["route-signals"] });
      qc.invalidateQueries({ queryKey: ["carrier-offers"] });
      closeCurrent();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Если у пользователя нет привязки к перевозчику — вотчер не нужен
  if (!carrierId) return null;

  if (!current) return null;

  return (
    <Dialog
      open={!!current}
      onOpenChange={(o) => {
        if (!o) closeCurrent();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Новая подходящая заявка
          </DialogTitle>
          <DialogDescription>
            {current.routeNumber
              ? `Рейс №${current.routeNumber}`
              : current.transport_request_id
                ? "Заявка на перевозку"
                : "Предложение рейса"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {(current.routeFrom || current.routeTo) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {current.routeFrom ?? "—"} → {current.routeTo ?? "—"}
              </span>
            </div>
          )}
          {current.plannedAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              Отправление: {fmtDateTime(current.plannedAt)}
            </div>
          )}
          {current.vehicleLabel && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Truck className="h-4 w-4" />
              {current.vehicleLabel}
            </div>
          )}
          {current.comment && (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              {current.comment}
            </div>
          )}
          {countdown && (
            <Badge
              variant="outline"
              className={
                countdown === "истекло"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }
            >
              <Clock className="mr-1 h-3 w-3" />
              Срок ответа: {countdown}
            </Badge>
          )}
        </div>

        {declineMode && (
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <div className="text-xs font-medium text-foreground">Причина отказа</div>
            <Select value={declineReason} onValueChange={setDeclineReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECLINE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Комментарий (необязательно)"
              value={declineComment}
              onChange={(e) => setDeclineComment(e.target.value)}
              rows={2}
            />
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const id = current.id;
              closeCurrent();
              navigate({ to: "/carrier-offers", search: { offerId: id } });
            }}
            className="gap-1.5"
          >
            <ExternalLink className="h-4 w-4" />
            Подробнее
          </Button>
          {!declineMode ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeclineMode(true)}
                disabled={respondMutation.isPending}
                className="gap-1.5"
              >
                <X className="h-4 w-4" />
                Отказаться
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  respondMutation.mutate({ offerId: current.id, action: "accept" })
                }
                disabled={respondMutation.isPending}
                className="gap-1.5"
              >
                <Check className="h-4 w-4" />
                Принять
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeclineMode(false)}
                disabled={respondMutation.isPending}
              >
                Назад
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  respondMutation.mutate({
                    offerId: current.id,
                    action: "decline",
                    reason: declineReason,
                    comment: declineComment.trim() || null,
                  })
                }
                disabled={respondMutation.isPending}
              >
                Подтвердить отказ
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
