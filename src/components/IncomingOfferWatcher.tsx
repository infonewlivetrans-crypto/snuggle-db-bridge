// Глобальный сторож входящих предложений (route_offers) для перевозчика/водителя.
// Раньше использовал Supabase Realtime; теперь — обычный polling через REST API,
// поскольку production backend не отдаёт WebSocket из браузера.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Check, X, ExternalLink, Truck, Clock, MapPin } from "lucide-react";
import { apiPost, apiGetAuth, fetchListViaApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getNotifSoundSettings,
  triggerVibration,
} from "@/lib/notifications/sound-settings";
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
  status?: string;
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
export function playSignalSound(volumeOverride?: number) {
  try {
    const settings = getNotifSoundSettings();
    if (!settings.enabled && volumeOverride == null) return;
    const vol = Math.max(
      0,
      Math.min(1, volumeOverride != null ? volumeOverride : settings.volume),
    );
    if (vol <= 0) return;
    const Ctx =
      (window.AudioContext as typeof AudioContext | undefined) ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [880, 1175, 1568]; // A5, D6, G6 — «вызов»
    const peak = 0.25 * vol;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      const end = start + 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.02);
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

/** Полный сигнал: звук + (опционально) вибрация согласно настройкам. */
export function triggerNewOfferSignal() {
  const settings = getNotifSoundSettings();
  if (settings.enabled) playSignalSound();
  if (settings.vibrate) triggerVibration([120, 60, 120, 60, 200]);
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const raw = String(s);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (!m) return raw;
  const day = m[3];
  const month = m[2];
  const hour = m[4] ?? "00";
  const minute = m[5] ?? "00";
  return `${day}.${month} ${hour}:${minute}`;
}

function useCountdown(expiresAt: string | null | undefined): string | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt || now === null) return null;
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
  // Первый успешный ответ только заполняет seenIds, чтобы не сигналить
  // о ранее существующих офферах при первой загрузке страницы.
  const initialized = useRef(false);

  const current = queue[0] ?? null;
  const countdown = useCountdown(current?.expires_at ?? null);

  // Polling вместо realtime: раз в 30 секунд опрашиваем активные предложения
  // для текущего carrier_id. Любой новый id играет звук и попадает в очередь.
  const { data: activeOffers } = useQuery({
    queryKey: ["incoming-offers-watch", carrierId],
    enabled: !!carrierId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    queryFn: async (): Promise<IncomingOffer[]> => {
      const qs = new URLSearchParams();
      qs.set("carrier_id", String(carrierId));
      qs.set("status", "sent");
      qs.set("limit", "50");
      return await apiGetAuth<IncomingOffer[]>(`/api/route-offers?${qs.toString()}`);
    },
  });

  // Обогащаем оффер данными по рейсу/машине через REST API
  const enrich = async (o: IncomingOffer): Promise<IncomingOffer> => {
    const enriched = { ...o };
    if (o.route_id) {
      try {
        const { rows: rs } = await fetchListViaApi<{
          route_number: string | null;
          planned_departure_at: string | null;
          route_date: string | null;
        }>("/api/routes", {
          limit: 1,
          extra: {
            ids: o.route_id,
            fields: "id, route_number, planned_departure_at, route_date",
          },
        });
        const r = rs[0];
        if (r) {
          enriched.routeNumber = r.route_number ?? null;
          enriched.plannedAt = r.planned_departure_at ?? r.route_date ?? null;
        }
      } catch { /* ignore */ }
      try {
        const pts = await apiGetAuth<Array<{ city: string | null; sequence: number }>>(
          `/api/route-points?route_id=${encodeURIComponent(o.route_id)}&fields=city,sequence,point_type`,
        );
        if (pts.length > 0) {
          const sorted = [...pts].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
          enriched.routeFrom = sorted[0]?.city ?? null;
          enriched.routeTo = sorted[sorted.length - 1]?.city ?? null;
        }
      } catch { /* ignore */ }
    }
    if (o.vehicle_id) {
      try {
        const vv = await apiGetAuth<{ plate_number?: string; brand?: string; model?: string } | null>(
          `/api/vehicles/${o.vehicle_id}`,
        );
        if (vv) {
          enriched.vehicleLabel = [
            vv.plate_number,
            [vv.brand, vv.model].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join(" · ");
        }
      } catch { /* ignore */ }
    }
    return enriched;
  };

  // Обработка polling-результата: новые id сигналим, старые игнорируем.
  useEffect(() => {
    if (!activeOffers) return;
    if (!initialized.current) {
      activeOffers.forEach((o) => seenIds.current.add(o.id));
      initialized.current = true;
      return;
    }
    const fresh = activeOffers.filter((o) => o.id && !seenIds.current.has(o.id));
    if (fresh.length === 0) return;
    fresh.forEach((o) => seenIds.current.add(o.id));
    triggerNewOfferSignal();
    toast.info("Новая подходящая заявка", {
      description: fresh[0]?.comment ?? "Открыто окно с деталями.",
      duration: 6000,
    });
    void Promise.all(fresh.map((o) => enrich(o))).then((full) => {
      setQueue((prev) => {
        const exist = new Set(prev.map((x) => x.id));
        return [...prev, ...full.filter((x) => !exist.has(x.id))];
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOffers]);

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
      qc.invalidateQueries({ queryKey: ["incoming-offers-watch"] });
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
              closeCurrent();
              navigate({ to: "/carrier-offers" });
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
