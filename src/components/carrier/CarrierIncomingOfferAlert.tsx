import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellRing,
  Check,
  X,
  ArrowRight,
  Loader2,
  MapPin,
  CalendarDays,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import {
  CARRIER_REQUESTS_QUERY_KEY,
  useCarrierRequestsQuery,
} from "@/components/carrier/CarrierRequestsBlock";
import { startLoudRing, stopLoudRing } from "@/lib/notifications/loud-ring";

const DECLINE_REASONS = [
  "Низкая ставка",
  "Не подходит маршрут",
  "Не подходит дата",
  "Не подходят условия оплаты",
  "Машина занята",
  "Водитель отказался",
  "Другая причина",
];

const DISMISS_KEY = "carrier-offer-dismissed-ids";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* noop */
  }
}

function fmtMoney(n: number | string | null | undefined, currency = "RUB"): string | null {
  if (n == null || n === "") return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return `${v.toLocaleString("ru-RU")} ${currency === "RUB" ? "₽" : currency}`;
}

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("ru-RU");
  } catch {
    return d;
  }
}

export function CarrierIncomingOfferAlert() {
  const qc = useQueryClient();
  const { data } = useCarrierRequestsQuery();
  const rows = data?.rows ?? [];

  const sentRows = useMemo(
    () =>
      rows
        .filter((r) => r.request_status === "sent")
        .slice()
        .sort(
          (a, b) =>
            new Date(b.sent_at ?? b.created_at).getTime() -
            new Date(a.sent_at ?? a.created_at).getTime(),
        ),
    [rows],
  );

  const top = sentRows[0];
  const extra = Math.max(0, sentRows.length - 1);

  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const [modalOpen, setModalOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>(DECLINE_REASONS[0]);
  const [declineComment, setDeclineComment] = useState("");

  // auto-open modal once per session per request id + громкий звук
  useEffect(() => {
    if (!top) return;
    if (dismissed.has(top.id)) return;
    setModalOpen(true);
    startLoudRing();
  }, [top, dismissed]);

  // Останавливаем звук при размонтировании
  useEffect(() => () => stopLoudRing(), []);

  // sent → viewed
  useEffect(() => {
    if (!top || top.request_status !== "sent") return;
    if (!modalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        await apiGetAuth(`/api/carrier/requests/${top.id}`, 10000);
        if (!cancelled) qc.invalidateQueries({ queryKey: CARRIER_REQUESTS_QUERY_KEY });
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [top, modalOpen, qc]);

  const respondMut = useMutation({
    mutationFn: async (vars: { id: string; status: "accepted" | "declined"; comment: string | null }) =>
      apiPatch(`/api/carrier/requests/${vars.id}/respond`, {
        request_status: vars.status,
        carrier_comment: vars.comment,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: CARRIER_REQUESTS_QUERY_KEY });
      toast.success(vars.status === "accepted" ? "Рейс принят" : "Отказ отправлен");
      stopLoudRing();
      setModalOpen(false);
      setDeclineOpen(false);
      setDeclineComment("");
    },
    onError: (e: unknown) =>
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  if (!top) return null;

  const dismiss = () => {
    const next = new Set(dismissed);
    next.add(top.id);
    setDismissed(next);
    writeDismissed(next);
    stopLoudRing();
    setModalOpen(false);
  };

  const accept = () => {
    respondMut.mutate({ id: top.id, status: "accepted", comment: null });
  };

  const submitDecline = () => {
    const reason = declineReason || "Отказ";
    const combined = declineComment ? `${reason}: ${declineComment}` : reason;
    respondMut.mutate({ id: top.id, status: "declined", comment: combined });
  };

  const currency = top.rate_currency ?? "RUB";
  const payout =
    top.rate_amount != null && top.commission_amount != null
      ? Number(top.rate_amount) - Number(top.commission_amount)
      : null;
  const freights = top.freights ?? [];

  const Summary = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-primary text-primary-foreground">Новое предложение</Badge>
        <span className="text-xs text-muted-foreground">
          {top.request_number ? `№ ${top.request_number}` : ""}
          {top.sent_at ? ` · ${new Date(top.sent_at).toLocaleString("ru-RU")}` : ""}
        </span>
      </div>

      <div className="flex items-start gap-2 text-base font-semibold">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          {top.loading_city ?? "—"} → {top.unloading_city ?? "—"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border p-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3" /> Загрузка
          </div>
          <div className="font-medium">{fmtDate(top.loading_date)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Wallet className="h-3 w-3" /> Ставка
          </div>
          <div className="font-medium">{fmtMoney(top.rate_amount, currency)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Комиссия сервиса</div>
          <div className="font-medium">
            {fmtMoney(top.commission_amount, currency)}
            {top.commission_percent != null ? ` (${top.commission_percent}%)` : ""}
          </div>
        </div>
        <div className="rounded-md border bg-primary/5 p-2">
          <div className="text-xs text-muted-foreground">К выплате</div>
          <div className="text-base font-semibold text-primary">
            {fmtMoney(payout, currency)}
          </div>
        </div>
      </div>

      {freights.length > 0 && (
        <div className="rounded-md border p-2 text-xs">
          <div className="mb-1 font-medium">Грузы в рейсе: {freights.length}</div>
          <ul className="space-y-0.5">
            {freights.slice(0, 4).map((f) => (
              <li key={f.id} className="truncate text-muted-foreground">
                • {f.cargo_name ?? "Груз"} · {f.loading_city ?? "—"} → {f.unloading_city ?? "—"}
              </li>
            ))}
            {freights.length > 4 && (
              <li className="text-muted-foreground">… и ещё {freights.length - 4}</li>
            )}
          </ul>
        </div>
      )}

      {top.dispatcher_comment && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs">
          <span className="font-semibold">Диспетчер: </span>
          {top.dispatcher_comment}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Большая карточка на /carrier */}
      <Card className="border-primary/60 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Новое предложение рейса</h2>
          </div>

          {Summary}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              className="flex-1"
              onClick={accept}
              disabled={respondMut.isPending}
            >
              {respondMut.isPending && respondMut.variables?.status === "accepted" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Принять рейс
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setDeclineOpen(true)}
              disabled={respondMut.isPending}
            >
              <X className="mr-1 h-4 w-4" /> Отказаться
            </Button>
          </div>

          {extra > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Ещё {extra} новых предложений</span>
              <Button asChild size="sm" variant="ghost">
                <Link to="/carrier/trips">
                  Открыть все <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Модалка/bottom sheet при появлении нового предложения */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) dismiss(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" /> Вам поступило предложение рейса
            </DialogTitle>
            <DialogDescription>
              Проверьте маршрут и условия. Решение можно принять прямо сейчас.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm">{Summary}</div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ghost" onClick={dismiss} disabled={respondMut.isPending}>
              Смотреть позже
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeclineOpen(true)}
              disabled={respondMut.isPending}
            >
              <X className="mr-1 h-4 w-4" /> Отказаться
            </Button>
            <Button onClick={accept} disabled={respondMut.isPending}>
              {respondMut.isPending && respondMut.variables?.status === "accepted" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Принять
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог отказа с причиной */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Причина отказа</DialogTitle>
            <DialogDescription>
              Укажите, почему рейс не подходит — это увидит диспетчер.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Причина</div>
              <Select value={declineReason} onValueChange={setDeclineReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECLINE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Комментарий (необязательно)</div>
              <Textarea
                value={declineComment}
                onChange={(e) => setDeclineComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)} disabled={respondMut.isPending}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={submitDecline}
              disabled={respondMut.isPending}
            >
              {respondMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Отправить отказ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
